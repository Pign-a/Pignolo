'use strict';
// Runner de la prueba de validación de planes, con un `claude` falso: ninguna llamada real.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir, git } = require('./helpers');
const { buildMatrix, estimate, runBench, renderTable, main } = require('./bench/plans/run');

const RUN = path.join(__dirname, 'bench', 'plans', 'run.js');
const REPO = path.join(__dirname, '..');

// Un `claude` falso: anota cómo lo llamaron y devuelve un JSON grabado.
const FAKE = `
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  const args = process.argv.slice(2);
  const at = (flag) => args[args.indexOf(flag) + 1];
  const withBash = args.includes('--allowedTools') && at('--allowedTools').split(',').includes('Bash');
  // Con --settings (paso B de M6): anota el archivo y claims.json, y hace de Claude Code
  // corriendo sus hooks: FAKE_BASH veces PostToolUse de Bash y después un Stop.
  let settings = null; let claims = null; const hookOut = [];
  if (args.includes('--settings')) {
    settings = JSON.parse(fs.readFileSync(at('--settings'), 'utf8'));
    const cf = path.join(path.dirname(at('--settings')), 'claims.json');
    claims = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf8')) : null;
    const fire = (event, payload) => {
      for (const group of settings.hooks[event] || []) {
        if (group.matcher && !new RegExp(group.matcher).test(payload.tool_name || '')) continue;
        for (const h of group.hooks) {
          const r = spawnSync(h.command, h.args || [], { input: JSON.stringify({ hook_event_name: event, ...payload }), encoding: 'utf8' });
          hookOut.push(r.stdout);
        }
      }
    };
    for (let i = 0; i < Number(process.env.FAKE_BASH || 0); i += 1) fire('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'node x.js' } });
    fire('Stop', { transcript_path: path.join(process.cwd(), 'no-transcript.jsonl'), stop_hook_active: false });
  }
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({
    args, cwd: process.cwd(), hasPlan: fs.existsSync('PLAN.md'),
    hasClaudeMd: fs.existsSync('CLAUDE.md'), prompt: input, settings, claims, hookOut,
  }) + '\\n');
  if (process.env.FAKE_MODE === 'garbage') { process.stdout.write('no es json'); process.exit(1); }
  const text = (withBash && process.env.FAKE_RESULT_B) || process.env.FAKE_RESULT || '[]';
  process.stdout.write(JSON.stringify({
    type: 'result', subtype: 'success', is_error: false,
    result: 'Informe\\n\`\`\`json\\n' + text + '\\n\`\`\`\\n',
    total_cost_usd: Number(process.env.FAKE_COST || 0.5), duration_ms: 1500,
    usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 5 },
  }));
});
`;

function setup(extraEnv = {}) {
  const dir = makeTempDir('bench-run-');
  const fake = path.join(dir, 'fake-claude.js');
  fs.writeFileSync(fake, FAKE);
  const log = path.join(dir, 'calls.log');
  const opts = {
    claude: [process.execPath, fake],
    outDir: path.join(dir, 'results'),
    resultsMd: path.join(dir, 'RESULTS-planes.md'),
    tmpDir: makeTempDir('bench-run-tmp-'),
    env: { ...process.env, FAKE_LOG: log, FAKE_RESULT: '[{"task":"T1","kind":"x","evidence":"roundCents no existe","keywords":[]}]', ...extraEnv },
    log: () => {},
    now: new Date('2026-09-30T12:00:00Z'),
  };
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  return { dir, opts, calls };
}
const argOf = (call, flag) => call.args[call.args.indexOf(flag) + 1];

test('la matriz: M1 y M2 una vez por caso; M3 y M4 por modelo y repetición; M0 una vez por modelo', () => {
  const m = buildMatrix({ cases: ['p1', 'clean'], methods: ['M1', 'M2', 'M3', 'M4', 'M0'], models: ['sonnet', 'opus'], reps: 3 });
  const count = (method) => m.filter((x) => x.method === method).length;
  assert.deepStrictEqual([count('M1'), count('M2'), count('M3'), count('M4'), count('M0')], [2, 2, 12, 12, 4]);
  assert.ok(m.filter((x) => x.method === 'M1').every((x) => x.model === null && x.rep === 1));
  assert.strictEqual(m[0].rep, 1); // por repetición: si el tope corta, quedan las primeras de todo
});

test('--dry-run: imprime la matriz y el costo estimado sin llamar a nadie ni escribir nada', () => {
  const { opts, calls } = setup();
  const lines = [];
  const r = runBench({ ...opts, cases: ['p1', 'clean'], methods: ['M3', 'M0'], models: ['sonnet', 'opus'], reps: 3, cap: 25, dryRun: true, log: (l) => lines.push(l) });
  assert.strictEqual(calls().length, 0);
  assert.strictEqual(r.rows.length, 0);
  assert.ok(!fs.existsSync(opts.outDir) && !fs.existsSync(opts.resultsMd));
  assert.ok(r.estimate.total > 0);
  const text = lines.join('\n');
  assert.match(text, /M3/);
  assert.match(text, /USD/);
  assert.match(text, new RegExp(`${r.matrix.length} corridas`));
  assert.strictEqual(estimate(r.matrix).total, r.estimate.total);
});

test('CLI --dry-run por defecto cubre los cinco casos, sin llamar a claude', () => {
  const res = spawnSync(process.execPath, [RUN, '--dry-run'], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, res.stderr);
  assert.match(res.stdout, /real/);
  assert.match(res.stdout, /Costo estimado total/);
  assert.match(res.stdout, /tope/i);
});

test('corre la matriz: llamadas con las herramientas y el modelo del método, costos sumados, tabla escrita', () => {
  const { opts, calls } = setup();
  const r = runBench({ ...opts, cases: ['p1', 'clean'], methods: ['M1', 'M3'], models: ['sonnet'], reps: 2, cap: 25 });
  assert.strictEqual(r.rows.length, 6); // 2 de M1 + 4 de M3
  const cs = calls();
  assert.strictEqual(cs.length, 4);
  for (const c of cs) {
    assert.strictEqual(argOf(c, '--model'), 'sonnet');
    assert.strictEqual(argOf(c, '--output-format'), 'json');
    assert.ok(Number(argOf(c, '--max-budget-usd')) > 0);
    assert.strictEqual(argOf(c, '--allowedTools'), 'Read,Grep,Glob');
    assert.ok(c.hasPlan && !c.hasClaudeMd);
    assert.ok(!fs.existsSync(c.cwd), 'la carpeta de trabajo se borra al terminar');
    assert.ok(c.args.includes('--strict-mcp-config') && c.args.includes('--disable-slash-commands'));
  }
  assert.ok(Math.abs(r.spent - 2.0) < 1e-9);
  const p1 = r.rows.find((x) => x.case === 'p1' && x.method === 'M3');
  assert.deepStrictEqual(p1.found, ['p1-missing-symbol']);
  assert.strictEqual(p1.total, 6);
  assert.deepStrictEqual([p1.costUsd, p1.durationSeconds, p1.tokens], [0.5, 1.5, { input: 10, output: 20, cache: 35 }]);
  const clean = r.rows.find((x) => x.case === 'clean' && x.method === 'M3');
  assert.strictEqual(clean.falsePositives, 1);
  const m1 = r.rows.find((x) => x.method === 'M1' && x.case === 'p1');
  assert.strictEqual(m1.costUsd, 0);
  assert.ok(m1.found.includes('p1-missing-symbol') && m1.found.includes('p1-wrong-signature') && m1.found.includes('p1-broken-command'));
  assert.strictEqual(r.rows.find((x) => x.method === 'M1' && x.case === 'clean').falsePositives, 0);

  const saved = JSON.parse(fs.readFileSync(r.file, 'utf8'));
  assert.ok(r.file.startsWith(opts.outDir) && r.file.includes('2026-09-30'));
  assert.strictEqual(saved.rows.length, 6);
  const md = fs.readFileSync(opts.resultsMd, 'utf8');
  assert.match(md, /M3/);
  assert.match(md, /sonnet/);
});

test('por defecto no carga pignolo: sin --bare pero con --setting-sources; con mode bare usa --bare', () => {
  const a = setup();
  runBench({ ...a.opts, cases: ['p1'], methods: ['M3'], models: ['sonnet'], reps: 1, cap: 25 });
  const c = a.calls()[0];
  assert.ok(!c.args.includes('--bare'));
  assert.strictEqual(argOf(c, '--setting-sources'), 'project,local');
  const b = setup();
  runBench({ ...b.opts, cases: ['p1'], methods: ['M3'], models: ['sonnet'], reps: 1, cap: 25, mode: 'bare' });
  const d = b.calls()[0];
  assert.ok(d.args.includes('--bare'));
  assert.ok(!d.args.includes('--setting-sources'));
});

test('M0 puede editar y correr Bash; M4 recibe el informe de M2 y solo lee', () => {
  const { opts, calls } = setup();
  runBench({ ...opts, cases: ['p1'], methods: ['M4', 'M0'], models: ['opus'], reps: 1, cap: 25 });
  const [m4, m0] = calls();
  assert.strictEqual(argOf(m4, '--allowedTools'), 'Read,Grep,Glob');
  assert.match(m4.prompt, /plan-check/);
  assert.match(m4.prompt, /roundCents/); // el informe de M2 sobre p1 va en el prompt
  assert.strictEqual(argOf(m0, '--allowedTools'), 'Read,Grep,Glob,Edit,Write,Bash');
  assert.strictEqual(argOf(m0, '--permission-mode'), 'acceptEdits');
  assert.strictEqual(argOf(m0, '--model'), 'opus');
});

test('M5: revisor con experimentos puntuales; recibe el informe de M2, puede correr Bash y carga la guardia de pignolo', () => {
  const { opts, calls } = setup();
  runBench({ ...opts, cases: ['p1'], methods: ['M5'], models: ['sonnet'], reps: 2, cap: 25 });
  const got = calls();
  assert.strictEqual(got.length, 2); // una por repetición, como M3 y M4
  const [m5] = got;
  assert.strictEqual(argOf(m5, '--allowedTools'), 'Read,Grep,Glob,Bash,Write');
  assert.match(argOf(m5, '--plugin-dir'), /plugins[\\/]pignolo$/);
  assert.strictEqual(argOf(m5, '--permission-mode'), 'acceptEdits');
  assert.match(argOf(m5, '--add-dir'), /plan-bench-scratch-/); // puede escribir el experimento en la carpeta temporal
  assert.match(m5.prompt, /roundCents/); // el informe de M2 va en el prompt
  assert.match(m5.prompt, /experiment/i);
  assert.doesNotMatch(m5.prompt, /{{SCRATCH}}/); // la carpeta temporal está resuelta
});

const STEP_A = JSON.stringify({
  findings: [],
  claims: [
    { id: 'C1', task: 'T3', claim: 'chmod +x makes ./scripts/report.js runnable on Windows', how: 'run it' },
    { id: 'C2', task: 'T2', claim: 'fs.readFileSync of coupons.json works', how: 'read it' },
  ],
});

test('M6: revisor de solo lectura y después un experimentador con Bash, la guardia y un hook Stop real', () => {
  const { opts, calls } = setup({ FAKE_RESULT: STEP_A, FAKE_RESULT_B: '[{"task":"T1","kind":"x","evidence":"roundCents no existe"}]', FAKE_BASH: '1' });
  const r = runBench({ ...opts, cases: ['p1'], methods: ['M6'], models: ['sonnet'], reps: 1, cap: 25 });
  const [a, b] = calls();
  assert.strictEqual(calls().length, 2);
  assert.strictEqual(argOf(a, '--allowedTools'), 'Read,Grep,Glob');
  assert.ok(!a.args.includes('--settings') && !a.args.includes('--plugin-dir'));
  assert.match(a.prompt, /roundCents/); // el informe de M2 va al paso A
  assert.match(a.prompt, /"claims"/);
  assert.strictEqual(argOf(b, '--model'), 'sonnet');
  assert.strictEqual(argOf(b, '--allowedTools'), 'Read,Grep,Glob,Bash,Write');
  assert.match(argOf(b, '--plugin-dir'), /plugins[\\/]pignolo$/);
  assert.strictEqual(argOf(b, '--permission-mode'), 'acceptEdits');
  const scratch = argOf(b, '--add-dir');
  assert.match(scratch, /plan-bench-scratch-/);
  assert.strictEqual(path.dirname(argOf(b, '--settings')), scratch);
  const stop = b.settings.hooks.Stop[0].hooks[0];
  assert.strictEqual(stop.command, 'node');
  assert.match(stop.args[0], /hooks\/require-experiments\.js$/);
  assert.strictEqual(path.resolve(stop.args[1]), path.resolve(scratch));
  assert.deepStrictEqual(b.claims.map((c) => c.id), ['C1', 'C2']); // el runner escribió las afirmaciones del paso A
  assert.match(b.hookOut.join(''), /"decision":"block"/); // 1 Bash para 2 afirmaciones
  assert.match(b.prompt, /chmod \+x makes/);
  assert.ok(b.prompt.includes(scratch));
  assert.ok(!fs.existsSync(scratch), 'la carpeta temporal se borra');
  const row = r.rows[0];
  assert.deepStrictEqual(row.found, ['p1-missing-symbol']); // el arreglo final es el del paso B
  assert.deepStrictEqual([row.costUsd, row.durationSeconds, row.tokens.output], [1, 3, 40]);
  assert.deepStrictEqual([row.claims, row.bashCalls, row.hookBlocks], [2, 1, 1]);
});

test('M6: sin afirmaciones no hay paso B; los hallazgos son los del paso A', () => {
  const { opts, calls } = setup({ FAKE_RESULT: JSON.stringify({ findings: [{ task: 'T1', kind: 'x', evidence: 'roundCents no existe' }], claims: [] }) });
  const r = runBench({ ...opts, cases: ['p1'], methods: ['M6'], models: ['opus'], reps: 1, cap: 25 });
  assert.strictEqual(calls().length, 1);
  assert.deepStrictEqual(r.rows[0].found, ['p1-missing-symbol']);
  assert.deepStrictEqual([r.rows[0].costUsd, r.rows[0].claims, r.rows[0].bashCalls, r.rows[0].hookBlocks], [0.5, 0, 0, 0]);
});

test('M7: el paso A y después sondas fijas sin IA; su hallazgo se suma, el costo es solo el del paso A', () => {
  const { opts, calls } = setup({ FAKE_RESULT: JSON.stringify({ findings: [{ task: 'T1', kind: 'x', evidence: 'roundCents no existe' }], claims: JSON.parse(STEP_A).claims }) });
  let ran = 0;
  const probes = [
    { id: 'fake-chmod', triggers: /chmod/i, keywords: ['chmod'], run: () => { ran += 1; return { falsified: true, evidence: 'chmod no cambia nada en Windows' }; } },
    { id: 'fake-never', triggers: /nada que ver/, keywords: ['x'], run: () => { throw new Error('no tenía que correr'); } },
  ];
  const r = runBench({ ...opts, cases: ['p1'], methods: ['M7'], models: ['sonnet'], reps: 1, cap: 25, probes });
  assert.strictEqual(calls().length, 1);
  assert.strictEqual(argOf(calls()[0], '--allowedTools'), 'Read,Grep,Glob');
  assert.strictEqual(ran, 1);
  const row = r.rows[0];
  assert.deepStrictEqual(row.found, ['p1-missing-symbol', 'p1-false-platform-assumption']);
  assert.deepStrictEqual([row.costUsd, row.claims, row.probeFindings], [0.5, 2, 1]);
});

test('M6 y M7 en la matriz, la estimación y el tope por corrida', () => {
  const m = buildMatrix({ cases: ['real'], methods: ['M6', 'M7'], models: ['sonnet', 'opus'], reps: 3 });
  assert.strictEqual(m.length, 12);
  const est = estimate(m);
  assert.ok(Math.abs(est.total - 3 * 2 * (0.9 + 2.2 + 0.5 + 1.2)) < 1e-9);
  assert.strictEqual(main(['--dry-run', '--methods', 'M6,M7', '--models', 'sonnet', '--cases', 'p1']), 0);
});

test('el tope global corta antes de pasarse y lo informa', () => {
  const { opts, calls } = setup();
  const r = runBench({ ...opts, cases: ['p1', 'p2', 'p3'], methods: ['M3'], models: ['sonnet'], reps: 1, cap: 1.2 });
  assert.strictEqual(calls().length, 2);
  assert.ok(r.stopped && /tope/.test(r.stopped.reason));
  assert.ok(r.spent <= 1.2);
  assert.ok(Math.abs(Number(argOf(calls()[1], '--max-budget-usd')) - 0.7) < 1e-9); // el resto del tope
  assert.match(fs.readFileSync(opts.resultsMd, 'utf8'), /tope/);
});

test('una salida que no es JSON es una fila con error, costo 0, y la corrida sigue', () => {
  const { opts, calls } = setup({ FAKE_MODE: 'garbage' });
  const r = runBench({ ...opts, cases: ['p1', 'p2'], methods: ['M3'], models: ['sonnet'], reps: 1, cap: 25 });
  assert.strictEqual(calls().length, 2);
  assert.ok(r.rows.every((x) => x.error && x.costUsd === 0 && x.found.length === 0));
});

test('el caso real: M1 sobre el plan v1 contra el checkout de 794b009, que se borra', () => {
  const before = git(['worktree', 'list'], REPO);
  const { opts } = setup();
  const r = runBench({ ...opts, cases: ['real'], methods: ['M1'], models: [], reps: 1, cap: 25 });
  assert.strictEqual(r.rows.length, 1);
  assert.strictEqual(r.rows[0].total, 14);
  assert.strictEqual(git(['worktree', 'list'], REPO), before);
  assert.deepStrictEqual(fs.readdirSync(opts.tmpDir), []);
});

test('renderTable: recall medio, falsas alarmas, costo medio y costo por error encontrado', () => {
  const row = (extra) => ({ method: 'M3', model: 'sonnet', case: 'p1', total: 6, falsePositives: 0, durationSeconds: 10, error: null, ...extra });
  const rows = [
    row({ found: ['a', 'b', 'c'], costUsd: 1 }),
    row({ found: ['a', 'b', 'c', 'd', 'e', 'f'], costUsd: 2, falsePositives: 2 }),
    row({ case: 'clean', total: 0, found: [], falsePositives: 4, costUsd: 0.6 }),
  ];
  const md = renderTable(rows, { spent: 3.6, stopped: null });
  assert.match(md, /\| M3 \| sonnet \| 3 \|/);
  assert.match(md, /75%/); // (3/6 + 6/6) / 2
  assert.match(md, /1,20/); // 3,6 USD / 3 corridas
  assert.match(md, /0,40/); // 3,6 USD / 9 errores
});
