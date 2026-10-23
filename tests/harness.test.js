'use strict';
// Tests del arnés de medición de Pignolo 2 (tests/evals/harness). Ninguno gasta tokens:
// el `claude` real se reemplaza por tests/fixtures/harness/fake-claude.mjs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const HARNESS = path.join(__dirname, 'evals', 'harness');
const STUB = path.join(__dirname, 'fixtures', 'harness', 'fake-claude.mjs');
const imp = (f) => import(pathToFileURL(path.join(HARNESS, f)).href);

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
const put = (root, rel, content) => {
  const p = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};

// Entorno de juguete: repo fuente, raíz privada, carpeta de trabajo y configuración.
function setup(over = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-harness-'));
  const src = path.join(root, 'source');
  const priv = path.join(root, 'private');
  const work = path.join(root, 'work');
  fs.mkdirSync(src);
  git(src, 'init', '-q', '-b', 'main');
  git(src, 'config', 'user.name', 't');
  git(src, 'config', 'user.email', 't@example.invalid');
  git(src, 'config', 'core.autocrlf', 'false');
  put(src, 'package.json', '{"name":"toy","scripts":{"test":"node scripts/full.js"}}\n');
  put(src, 'CLAUDE.md', '# private workflow notes\n');
  put(src, 'AGENTS.md', '# agents notes\n');
  put(src, '.mcp.json', '{"mcpServers":{}}\n');
  put(src, '.claude/settings.json', '{}\n');
  put(src, 'docs/CLAUDE.md', '# nested notes\n');
  put(src, '.gitignore', 'node_modules/\ngenerated/\n');
  put(src, 'src/app.js', 'exports.hello = () => "hi";\n');
  put(src, 'scripts/full.js', 'console.log("# pass 3");\nconsole.log("# fail 0");\n');
  git(src, 'add', '-A');
  git(src, 'commit', '-q', '-m', 'toy base');
  const base = git(src, 'rev-parse', 'HEAD');
  put(src, 'node_modules/dep/index.js', 'module.exports = 1;\n');
  put(src, 'generated/client/index.js', 'module.exports = "client";\n');

  put(priv, 't1/prompt.md', 'Add a feature.\nSecond line.\n');
  put(priv, 't1/base.txt', base + '\n');
  put(priv, 't1/accept/test/new.test.js', '// acceptance test\n');
  put(priv, 't1/accept/check.js',
    'const fs=require("fs");const p=process.argv[2];' +
    'if(p)fs.writeFileSync(p,JSON.stringify({numPassedTests:2,numFailedTests:1,numTotalTests:3}));' +
    'console.log("Tests  1 failed | 2 passed (3)");process.exit(1);\n');
  put(priv, 't1/accept-cmd.txt', 'node check.js {json}\n');
  put(priv, 't1/full-cmd.txt', 'node scripts/full.js\n');

  const plugins = {};
  for (const [dir, name] of [['sp', 'superpowers'], ['pg', 'pignolo']]) {
    put(root, `plugins/${dir}/.claude-plugin/plugin.json`, JSON.stringify({ name }));
    plugins[name] = path.join(root, 'plugins', dir);
  }
  const cfg = {
    sourceRepo: src,
    privateRoot: priv,
    workRoot: work,
    configDir: path.join(root, 'cfgdir'),
    claudeBin: process.execPath,
    claudeArgsPrefix: [STUB],
    model: 'sonnet',
    permissionMode: 'bypassPermissions',
    perRunCapUsd: 5,
    timeoutMs: 20000,
    acceptTimeoutMs: 20000,
    arms: {
      A: { pluginName: 'superpowers', pluginDir: plugins.superpowers },
      B: { pluginName: 'pignolo', pluginDir: plugins.pignolo },
    },
    copyDirs: ['generated'],
    seed: 7,
    csvPath: path.join(root, 'runs.csv'),
    gradesPath: path.join(root, 'grades.json'),
    experiment: 'toy-exp',
    ...over,
  };
  const cfgPath = path.join(root, 'harness.local.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  return { root, src, priv, work, cfg, cfgPath, base };
}
const cleanup = (env) => fs.rmSync(env.root, { recursive: true, force: true });
const runDir = (env, task, arm, rep) => path.join(env.work, `${task}-${arm}-${rep}`);

// ---------------------------------------------------------------- prepare

test('prepare: exporta el commit base, limpia el contexto del autor y escribe el CLAUDE.md neutral', async () => {
  const env = setup();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { prepare } = await imp('prepare.mjs');
    const r = await prepare(loadConfig(env.cfgPath), { task: 't1', arm: 'A', rep: 1 });
    const repo = path.join(runDir(env, 't1', 'A', 1), 'repo');
    assert.strictEqual(r.repo, repo);
    assert.ok(fs.existsSync(path.join(repo, 'src', 'app.js')));
    assert.ok(!fs.existsSync(path.join(repo, 'AGENTS.md')));
    assert.ok(!fs.existsSync(path.join(repo, '.mcp.json')));
    assert.ok(!fs.existsSync(path.join(repo, '.claude')));
    assert.ok(!fs.existsSync(path.join(repo, 'docs', 'CLAUDE.md')), 'también los anidados');
    const neutral = fs.readFileSync(path.join(HARNESS, 'neutral-claude.md'), 'utf8');
    assert.strictEqual(fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf8'), neutral);
    assert.ok(!/private workflow/.test(neutral));
    assert.ok(!/plugin|superpowers|pignolo|skill/i.test(neutral), 'el texto neutral no nombra ningún método');
  } finally { cleanup(env); }
});

test('prepare: node_modules es una junction, copyDirs se copia, commit base y git limpio', async () => {
  const env = setup();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { prepare } = await imp('prepare.mjs');
    await prepare(loadConfig(env.cfgPath), { task: 't1', arm: 'B', rep: 2 });
    const repo = path.join(runDir(env, 't1', 'B', 2), 'repo');
    const nm = path.join(repo, 'node_modules');
    assert.ok(fs.lstatSync(nm).isSymbolicLink(), 'junction');
    assert.strictEqual(path.resolve(fs.readlinkSync(nm)).toLowerCase().replace(/\\+$/, ''),
      path.join(env.src, 'node_modules').toLowerCase());
    assert.ok(fs.existsSync(path.join(nm, 'dep', 'index.js')));
    assert.strictEqual(fs.readFileSync(path.join(repo, 'generated', 'client', 'index.js'), 'utf8'),
      'module.exports = "client";\n');
    assert.ok(!fs.lstatSync(path.join(repo, 'generated')).isSymbolicLink(), 'copiado, no enlazado');
    assert.strictEqual(git(repo, 'branch', '--show-current'), 'main');
    assert.strictEqual(git(repo, 'log', '--format=%s'), 'base');
    assert.strictEqual(git(repo, 'log', '-1', '--format=%an <%ae>'), 'eval <eval@example.invalid>');
    assert.strictEqual(git(repo, 'status', '--porcelain'), '', 'node_modules y generated no ensucian');
    assert.ok(!git(repo, 'ls-files').split('\n').some((f) => f.startsWith('node_modules/')));
    assert.ok(git(repo, 'ls-files').split('\n').includes('CLAUDE.md'), 'el neutral entra en base');
    // Borrar la carpeta de la corrida no debe llevarse el node_modules de la fuente.
    fs.rmSync(runDir(env, 't1', 'B', 2), { recursive: true, force: true });
    assert.ok(fs.existsSync(path.join(env.src, 'node_modules', 'dep', 'index.js')));
  } finally { cleanup(env); }
});

test('prepare: se niega a pisar una carpeta de corrida existente y valida copyDirs', async () => {
  const env = setup();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { prepare } = await imp('prepare.mjs');
    const cfg = loadConfig(env.cfgPath);
    await prepare(cfg, { task: 't1', arm: 'A', rep: 1 });
    fs.writeFileSync(path.join(runDir(env, 't1', 'A', 1), 'repo', 'mark.txt'), 'x');
    await assert.rejects(() => prepare(cfg, { task: 't1', arm: 'A', rep: 1 }), /ya existe/);
    assert.ok(fs.existsSync(path.join(runDir(env, 't1', 'A', 1), 'repo', 'mark.txt')), 'no se tocó');
    await assert.rejects(() => prepare({ ...cfg, copyDirs: ['..\\..\\x'] }, { task: 't1', arm: 'B', rep: 1 }), /copyDirs/);
    await assert.rejects(() => prepare(cfg, { task: 't1', arm: 'C', rep: 1 }), /brazo/);
    await assert.rejects(() => prepare(cfg, { task: '../x', arm: 'A', rep: 1 }), /tarea/);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- run

async function prepared(env, arm = 'A', rep = 1, task = 't1') {
  const { loadConfig } = await imp('config.mjs');
  const { prepare } = await imp('prepare.mjs');
  const cfg = loadConfig(env.cfgPath);
  await prepare(cfg, { task, arm, rep });
  return cfg;
}
function withEnv(vars, fn) {
  const old = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; process.env[k] = vars[k]; }
  const restore = () => { for (const k of Object.keys(vars)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } };
  return Promise.resolve().then(fn).finally(restore);
}

test('run: arma el argv exacto, fija CLAUDE_CONFIG_DIR y calcula las métricas', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'B', 1);
    const { runTask } = await imp('execute.mjs');
    const log = path.join(env.root, 'stub.json');
    const m = await withEnv({ FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_MODE: 'ok' }, () => runTask(cfg, { task: 't1', arm: 'B', rep: 1 }));
    const seen = JSON.parse(fs.readFileSync(log, 'utf8'));
    assert.deepStrictEqual(seen.argv, [
      '-p', 'Add a feature.\nSecond line.',
      '--model', 'sonnet',
      '--plugin-dir', cfg.arms.B.pluginDir,
      '--permission-mode', 'bypassPermissions',
      '--output-format', 'stream-json',
      '--verbose',
      '--max-budget-usd', '5',
      '--no-session-persistence',
    ]);
    assert.strictEqual(fs.realpathSync(seen.cwd), fs.realpathSync(path.join(runDir(env, 't1', 'B', 1), 'repo')));
    assert.strictEqual(seen.configDir, cfg.configDir);
    const dir = runDir(env, 't1', 'B', 1);
    assert.ok(fs.readFileSync(path.join(dir, 'stream.jsonl'), 'utf8').includes('"type":"result"'));
    assert.strictEqual(fs.readFileSync(path.join(dir, 'stderr.txt'), 'utf8').trim(), 'fake stderr');
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8'));
    assert.deepStrictEqual(onDisk, JSON.parse(JSON.stringify(m)));
    assert.strictEqual(m.costUsd, 0.5);
    assert.strictEqual(m.turns, 4);
    assert.deepStrictEqual(m.tokens, { input: 150, output: 30, cacheRead: 1500, cacheWrite: 600 });
    assert.strictEqual(m.tokenSource, 'modelUsage');
    assert.deepStrictEqual(m.usageMainThread, { input: 100, output: 20, cacheRead: 1000, cacheWrite: 400 });
    // 150*1 + 30*5 + 1500*0.1 + 600*1.25
    assert.strictEqual(m.weightedTokens, 1200);
    assert.strictEqual(m.agents, 2, 'Agent + Task, sin contar dos veces el mismo tool_use');
    assert.strictEqual(m.agentsMain, 1);
    assert.strictEqual(m.timedOut, false);
    assert.strictEqual(m.exitCode, 0);
    assert.strictEqual(m.contamination, false);
    assert.strictEqual(m.ownPluginLoaded, true);
    assert.ok(m.wallS >= 0 && m.badLines === 1);
    assert.ok(!JSON.stringify(m).includes(process.env.PATH || 'no-path-in-env'), 'no se registra el entorno');
  } finally { cleanup(env); }
});

test('run: usa el peso configurado y cae a usage si no hay modelUsage', async () => {
  const { weightedTokens, parseStream } = await imp('metrics.mjs');
  assert.strictEqual(weightedTokens({ input: 10, output: 10, cacheRead: 10, cacheWrite: 10 }, { input: 2, output: 3, cacheRead: 4, cacheWrite: 5 }), 140);
  const stream = [
    JSON.stringify({ type: 'system', subtype: 'init', plugins: [{ name: 'superpowers' }] }),
    JSON.stringify({ type: 'result', total_cost_usd: 1, duration_ms: 9, num_turns: 2, usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 } }),
  ].join('\n');
  const m = parseStream(stream, { ownPlugin: 'superpowers', otherPlugin: 'pignolo', weights: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 } });
  assert.strictEqual(m.tokenSource, 'usage');
  assert.deepStrictEqual(m.tokens, { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 });
  assert.strictEqual(m.weightedTokens, 10);
  const none = parseStream('', { ownPlugin: 'a', otherPlugin: 'b' });
  assert.strictEqual(none.costUsd, null);
  assert.strictEqual(none.weightedTokens, null);
  assert.strictEqual(none.hasResult, false);
});

test('run: el timeout mata el proceso y lo anota', async () => {
  const env = setup({ timeoutMs: 600 });
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const t0 = Date.now();
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'hang' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.ok(Date.now() - t0 < 10000, 'volvió');
    assert.strictEqual(m.timedOut, true);
    assert.strictEqual(m.costUsd, null, 'sin mensaje result no se inventan cifras');
    assert.strictEqual(m.hasResult, false);
    assert.ok(m.wallS >= 0.5 && m.wallS < 8, `wallS=${m.wallS}`);
    assert.ok(fs.existsSync(path.join(runDir(env, 't1', 'A', 1), 'metrics.json')));
  } finally { cleanup(env); }
});

test('run: marca contaminación si el init lista el plugin del otro brazo', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'contaminated', FAKE_CLAUDE_EXTRA_PLUGIN: 'pignolo' },
      () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(m.contamination, true);
    assert.ok(m.contaminationHits.includes('plugin:pignolo'));
    assert.ok(m.contaminationHits.includes('skill:pignolo:other-skill'));
  } finally { cleanup(env); }
});

test('run: sin costo en el result queda en null y la corrida no falla', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'nocost' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(m.costUsd, null);
    assert.strictEqual(m.weightedTokens, null);
    assert.strictEqual(m.turns, 4);
  } finally { cleanup(env); }
});

test('run: si no existe la carpeta preparada, pide prepare', async () => {
  const env = setup();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { runTask } = await imp('execute.mjs');
    await assert.rejects(() => runTask(loadConfig(env.cfgPath), { task: 't1', arm: 'A', rep: 9 }), /prepare/);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- accept

test('accept: calcula el resumen de cambios ANTES de copiar los tests y registra los conteos', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const { acceptRun, parseCounts } = await imp('accept.mjs');
    await withEnv({ FAKE_CLAUDE_MODE: 'edit' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    const a = await acceptRun(cfg, { task: 't1', arm: 'A', rep: 1 });
    const dir = runDir(env, 't1', 'A', 1);
    const changes = JSON.parse(fs.readFileSync(path.join(dir, 'changes.json'), 'utf8'));
    assert.deepStrictEqual(changes.files, ['src/feature.js']);
    assert.strictEqual(changes.filesChanged, 1);
    assert.strictEqual(changes.linesAdded, 3);
    assert.strictEqual(changes.linesRemoved, 0);
    assert.match(changes.shortstat, /1 file changed, 3 insertions/);
    const patch = fs.readFileSync(path.join(dir, 'changes.patch'), 'utf8');
    assert.ok(patch.includes('src/feature.js') && !patch.includes('new.test.js') && !patch.includes('check.js'));
    // Los tests de aceptación sí quedaron copiados en el repo, y después del resumen.
    assert.strictEqual(fs.readFileSync(path.join(dir, 'repo', 'test', 'new.test.js'), 'utf8'), '// acceptance test\n');
    assert.strictEqual(a.accept.exitCode, 1);
    assert.deepStrictEqual([a.accept.pass, a.accept.fail, a.accept.source], [2, 1, 'json']);
    assert.deepStrictEqual([a.full.pass, a.full.fail, a.full.source, a.full.exitCode], [3, 0, 'summary', 0]);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'acceptance.json'), 'utf8')), JSON.parse(JSON.stringify(a)));
    // Una segunda pasada no vuelve a calcular el resumen con los tests ya copiados.
    await acceptRun(cfg, { task: 't1', arm: 'A', rep: 1 });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'changes.json'), 'utf8')).files, ['src/feature.js']);

    assert.deepStrictEqual(parseCounts('Tests  3 failed | 9 passed (12)', 1), { pass: 9, fail: 3, source: 'summary' });
    assert.deepStrictEqual(parseCounts('Tests:       1 failed, 2 passed, 3 total', 1), { pass: 2, fail: 1, source: 'summary' });
    assert.deepStrictEqual(parseCounts('ℹ pass 5\nℹ fail 0\n', 0), { pass: 5, fail: 0, source: 'summary' });
    assert.deepStrictEqual(parseCounts('Tests  4 passed (4)', 0), { pass: 4, fail: 0, source: 'summary' });
    assert.deepStrictEqual(parseCounts('nada reconocible', 0), { pass: 1, fail: 0, source: 'exit-code' });
    assert.deepStrictEqual(parseCounts('nada reconocible', 3), { pass: 0, fail: 1, source: 'exit-code' });
  } finally { cleanup(env); }
});

test('accept: el timeout del comando se registra y no cuelga', async () => {
  const env = setup({ acceptTimeoutMs: 500 });
  try {
    const cfg = await prepared(env, 'A', 1);
    put(env.priv, 't1/accept-cmd.txt', 'node -e "setInterval(()=>{},1000)"\n');
    const { acceptRun } = await imp('accept.mjs');
    const a = await acceptRun(cfg, { task: 't1', arm: 'A', rep: 1 });
    assert.strictEqual(a.accept.timedOut, true);
    assert.strictEqual(a.accept.fail, 1);
    assert.strictEqual(a.full.timedOut, false);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- row

function writeRun(env, task, arm, rep, { metrics = {}, acceptance, changes, patch } = {}) {
  const dir = runDir(env, task, arm, rep);
  fs.mkdirSync(dir, { recursive: true });
  const m = {
    task, arm, rep, model: 'sonnet', finishedAt: '2026-10-23T12:00:00.000Z', costUsd: 1.5,
    weightedTokens: 1200, tokens: { input: 150, output: 30, cacheRead: 1500, cacheWrite: 600 },
    wallS: 42.5, turns: 4, agents: 2, timedOut: false, contamination: false, ...metrics,
  };
  fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(m));
  if (acceptance) fs.writeFileSync(path.join(dir, 'acceptance.json'), JSON.stringify(acceptance));
  if (changes) fs.writeFileSync(path.join(dir, 'changes.json'), JSON.stringify(changes));
  if (patch !== undefined) fs.writeFileSync(path.join(dir, 'changes.patch'), patch);
}
const ACC = { accept: { pass: 2, fail: 1, source: 'json' }, full: { pass: 3, fail: 0, source: 'summary' } };
const CHG = { filesChanged: 1, linesAdded: 3, linesRemoved: 0, files: ['src/feature.js'] };

test('row: agrega una fila con las columnas del contrato y rechaza duplicados', async () => {
  const env = setup();
  try {
    writeRun(env, 't1', 'A', 1, { acceptance: ACC, changes: CHG });
    const { loadConfig } = await imp('config.mjs');
    const { appendRow, COLUMNS, parseCsv } = await imp('row.mjs');
    const cfg = loadConfig(env.cfgPath);
    assert.strictEqual(COLUMNS.join(','),
      'experiment,task,arm,rep,timestamp,model,cost_usd,weighted_tokens,input,output,cache_read,cache_write,wall_s,turns,agents,accept_pass,accept_fail,full_pass,full_fail,timed_out,contamination,files_changed,lines_added,lines_removed,note');
    appendRow(cfg, { task: 't1', arm: 'A', rep: 1, note: 'prueba, con coma' });
    const lines = fs.readFileSync(cfg.csvPath, 'utf8').trim().split(/\r?\n/);
    assert.strictEqual(lines[0], COLUMNS.join(','));
    assert.strictEqual(lines.length, 2);
    const [r] = parseCsv(fs.readFileSync(cfg.csvPath, 'utf8'));
    assert.deepStrictEqual(r, {
      experiment: 'toy-exp', task: 't1', arm: 'A', rep: '1', timestamp: '2026-10-23T12:00:00.000Z', model: 'sonnet',
      cost_usd: '1.5', weighted_tokens: '1200', input: '150', output: '30', cache_read: '1500', cache_write: '600',
      wall_s: '42.5', turns: '4', agents: '2', accept_pass: '2', accept_fail: '1', full_pass: '3', full_fail: '0',
      timed_out: 'false', contamination: 'false', files_changed: '1', lines_added: '3', lines_removed: '0',
      note: 'prueba, con coma',
    });
    assert.throws(() => appendRow(cfg, { task: 't1', arm: 'A', rep: 1 }), /ya existe una fila.*rerun/);
    assert.strictEqual(fs.readFileSync(cfg.csvPath, 'utf8').trim().split(/\r?\n/).length, 2, 'no cambió');
    appendRow(cfg, { task: 't1', arm: 'A', rep: 1, note: 'rerun' });
    assert.strictEqual(parseCsv(fs.readFileSync(cfg.csvPath, 'utf8')).length, 2);
    // Una corrida sin aceptación todavía deja las columnas vacías en vez de inventar.
    writeRun(env, 't1', 'B', 1);
    appendRow(cfg, { task: 't1', arm: 'B', rep: 1 });
    const rows = parseCsv(fs.readFileSync(cfg.csvPath, 'utf8'));
    assert.strictEqual(rows[2].accept_pass, '');
    assert.strictEqual(rows[2].files_changed, '');
  } finally { cleanup(env); }
});

test('row: un conteo por código de salida se avisa en la nota', async () => {
  const env = setup();
  try {
    writeRun(env, 't1', 'A', 1, { acceptance: { accept: { pass: 0, fail: 1, source: 'exit-code' }, full: { pass: 3, fail: 0, source: 'json' } }, changes: CHG });
    const { loadConfig } = await imp('config.mjs');
    const { appendRow, parseCsv } = await imp('row.mjs');
    const cfg = loadConfig(env.cfgPath);
    appendRow(cfg, { task: 't1', arm: 'A', rep: 1 });
    assert.match(parseCsv(fs.readFileSync(cfg.csvPath, 'utf8'))[0].note, /accept-por-codigo-de-salida/);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- blind

const PATCH = (n, extra = '') =>
  `diff --git a/src/feature.js b/src/feature.js\nnew file mode 100644\n--- /dev/null\n+++ b/src/feature.js\n@@ -0,0 +1,1 @@\n+const value${n} = ${n};\n` + extra;
const PROCESS_ARTIFACT = 'diff --git a/docs/superpowers/plan.md b/docs/superpowers/plan.md\nnew file mode 100644\n--- /dev/null\n+++ b/docs/superpowers/plan.md\n@@ -0,0 +1,1 @@\n+plan\n';

function blindEnv() {
  const env = setup();
  let n = 0;
  for (const arm of ['A', 'B']) {
    for (const rep of [1, 2]) {
      n += 1;
      writeRun(env, 't1', arm, rep, {
        changes: { filesChanged: 1, linesAdded: n, linesRemoved: 0, files: ['src/feature.js'] },
        patch: PATCH(n, arm === 'A' && rep === 1 ? PROCESS_ARTIFACT : ''),
      });
    }
  }
  return env;
}
function allFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...allFiles(p)); else out.push(p);
  }
  return out;
}

test('blind: los paquetes no revelan el brazo, la clave queda aparte y el orden es reproducible', async () => {
  const env = blindEnv();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { blind } = await imp('blind.mjs');
    const cfg = loadConfig(env.cfgPath);
    const r = blind(cfg, { task: 't1', reps: [1, 2] });
    const base = path.join(env.priv, 'blind', 't1');
    assert.strictEqual(r.packs, 4);
    const packs = fs.readdirSync(base).filter((d) => d.startsWith('pack-')).sort();
    assert.deepStrictEqual(packs, ['pack-1', 'pack-2', 'pack-3', 'pack-4']);
    const labels = [];
    for (const p of packs) {
      assert.deepStrictEqual(fs.readdirSync(path.join(base, p)).sort(), ['diff.patch', 'meta.json']);
      labels.push(JSON.parse(fs.readFileSync(path.join(base, p, 'meta.json'), 'utf8')).label);
    }
    assert.deepStrictEqual([...labels].sort(), ['W', 'X', 'Y', 'Z']);
    for (const f of packs.flatMap((p) => allFiles(path.join(base, p)))) {
      const text = fs.readFileSync(f, 'utf8');
      assert.ok(!/superpowers|pignolo|t1-[AB]-\d|"arm"|"rep"/i.test(text), `${f} revela el brazo`);
    }
    assert.ok(!fs.readFileSync(path.join(base, 'pack-1', 'diff.patch'), 'utf8').includes('plan.md'));
    const key = JSON.parse(fs.readFileSync(path.join(base, 'key.json'), 'utf8'));
    assert.deepStrictEqual(Object.keys(key).sort(), ['W', 'X', 'Y', 'Z']);
    assert.deepStrictEqual(Object.values(key).map((v) => `${v.arm}${v.rep}`).sort(), ['A1', 'A2', 'B1', 'B2']);
    for (const p of packs) {
      const label = JSON.parse(fs.readFileSync(path.join(base, p, 'meta.json'), 'utf8')).label;
      const k = key[label];
      assert.ok(fs.readFileSync(path.join(base, p, 'diff.patch'), 'utf8').includes('value'));
      assert.ok(k.arm && k.rep);
    }
    const prompt = fs.readFileSync(path.join(base, 'grader-prompt.md'), 'utf8');
    assert.match(prompt, /serious_findings/);
    assert.match(prompt, /correctness/);
    assert.ok(!/superpowers|pignolo|key\.json contents/i.test(prompt));
    assert.ok(fs.existsSync(path.join(base, 'task-prompt.md')));

    // Reproducible con la misma semilla, otra semilla cambia el orden.
    const first = fs.readFileSync(path.join(base, 'key.json'), 'utf8');
    assert.throws(() => blind(cfg, { task: 't1', reps: [1, 2] }), /ya existe/);
    blind(cfg, { task: 't1', reps: [1, 2], force: true });
    assert.strictEqual(fs.readFileSync(path.join(base, 'key.json'), 'utf8'), first);
    const orders = new Set();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      blind({ ...cfg, seed }, { task: 't1', reps: [1, 2], force: true });
      orders.add(fs.readFileSync(path.join(base, 'key.json'), 'utf8'));
    }
    assert.ok(orders.size > 1, 'la semilla influye');
    const { shuffle } = await imp('blind.mjs');
    assert.deepStrictEqual(shuffle([1, 2, 3, 4, 5, 6, 7, 8], 42), shuffle([1, 2, 3, 4, 5, 6, 7, 8], 42));
  } finally { cleanup(env); }
});

test('blind: si un diff nombra un plugin, se detiene salvo --allow-leaks', async () => {
  const env = setup();
  try {
    writeRun(env, 't1', 'A', 1, { changes: CHG, patch: PATCH(1, '+// written with Superpowers\n') });
    writeRun(env, 't1', 'B', 1, { changes: CHG, patch: PATCH(2) });
    const { loadConfig } = await imp('config.mjs');
    const { blind } = await imp('blind.mjs');
    const cfg = loadConfig(env.cfgPath);
    assert.throws(() => blind(cfg, { task: 't1', reps: [1] }), /revela|nombra/);
    assert.ok(!fs.existsSync(path.join(env.priv, 'blind', 't1', 'pack-1')), 'no deja paquetes a medias');
    const r = blind(cfg, { task: 't1', reps: [1], allowLeaks: true });
    assert.strictEqual(r.packs, 2);
    assert.ok(r.leaks.length >= 1);
  } finally { cleanup(env); }
});

test('unblind: pasa las notas del revisor a grades.json usando la clave', async () => {
  const env = blindEnv();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { blind, unblind } = await imp('blind.mjs');
    const cfg = loadConfig(env.cfgPath);
    blind(cfg, { task: 't1', reps: [1, 2] });
    const key = JSON.parse(fs.readFileSync(path.join(env.priv, 'blind', 't1', 'key.json'), 'utf8'));
    const input = Object.keys(key).map((label) => ({ label, serious_findings: label === 'X' ? ['f1'] : [], correctness: 4, quality: 3 }));
    const inFile = path.join(env.root, 'grader.json');
    fs.writeFileSync(inFile, JSON.stringify(input));
    unblind(cfg, { task: 't1', input: inFile });
    const grades = JSON.parse(fs.readFileSync(cfg.gradesPath, 'utf8'));
    assert.strictEqual(grades.length, 4);
    const x = grades.find((g) => g.arm === key.X.arm && g.rep === key.X.rep);
    assert.deepStrictEqual(x.serious_findings, ['f1']);
    assert.strictEqual(x.task, 't1');
    assert.throws(() => unblind(cfg, { task: 't1', input: inFile }), /ya hay nota/);
    fs.writeFileSync(inFile, JSON.stringify([{ label: 'Q', quality: 1 }]));
    assert.throws(() => unblind(cfg, { task: 't1', input: inFile, force: true }), /etiqueta/);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- summary

function mk(task, arm, rep, tokens, extra = {}) {
  return {
    experiment: 'x', task, arm, rep, timestamp: '2026-10-23T00:00:0' + rep + 'Z', model: 'sonnet',
    cost_usd: tokens / 1000, weighted_tokens: tokens, wall_s: 60, turns: 5, agents: 1,
    accept_pass: 3, accept_fail: 0, full_pass: 10, full_fail: 0, timed_out: false, contamination: false, note: '', ...extra,
  };
}
const arm = (task, a, tokens, over = {}) => tokens.map((t, i) => mk(task, a, i + 1, t, typeof over === 'function' ? over(i) : over));
const grade = (task, a, quality, serious = 0) => quality.map((q, i) => ({ task, arm: a, rep: i + 1, quality: q, correctness: 4, serious_findings: Array(serious).fill('s') }));

test('summary medio: pasa con tokens <= 1,5x, calidad igual y rangos separados', async () => {
  const { summarize } = await imp('summary.mjs');
  const rows = [...arm('m', 'A', [100, 105, 110]), ...arm('m', 'B', [130, 135, 140])];
  const grades = [...grade('m', 'A', [4, 4, 4]), ...grade('m', 'B', [4, 5, 4])];
  const r = summarize(rows, { kinds: { m: 'medium' }, grades });
  const t = r.tasks[0];
  assert.strictEqual(t.decision.verdict, 'pasa');
  assert.strictEqual(t.evidence, 'E3');
  assert.deepStrictEqual([t.arms.A.n, t.arms.A.tokens.median, t.arms.A.tokens.min, t.arms.A.tokens.max], [3, 105, 100, 110]);
  assert.strictEqual(t.arms.B.tokens.median, 135);
  const two = summarize([...arm('m', 'A', [100, 105]), ...arm('m', 'B', [130, 135])], { kinds: { m: 'medium' }, grades });
  assert.strictEqual(two.tasks[0].evidence, 'E2');
});

test('summary medio: rangos que se pisan dan "sin diferencia demostrada"', async () => {
  const { summarize } = await imp('summary.mjs');
  const rows = [...arm('m', 'A', [100, 110, 130]), ...arm('m', 'B', [120, 125, 140])];
  const grades = [...grade('m', 'A', [4, 4, 4]), ...grade('m', 'B', [4, 4, 4])];
  const t = summarize(rows, { kinds: { m: 'medium' }, grades }).tasks[0];
  assert.strictEqual(t.decision.verdict, 'sin diferencia demostrada');
});

test('summary medio: más de 1,5x en tokens no pasa; peor calidad no pasa; sin notas queda pendiente', async () => {
  const { summarize } = await imp('summary.mjs');
  const heavy = [...arm('m', 'A', [100, 102, 104]), ...arm('m', 'B', [300, 310, 320])];
  const g = [...grade('m', 'A', [4, 4, 4]), ...grade('m', 'B', [5, 5, 5])];
  assert.strictEqual(summarize(heavy, { kinds: { m: 'medium' }, grades: g }).tasks[0].decision.verdict, 'no pasa');
  const ok = [...arm('m', 'A', [100, 105, 110]), ...arm('m', 'B', [130, 135, 140])];
  const worse = [...grade('m', 'A', [4, 4, 4]), ...grade('m', 'B', [3, 3, 3])];
  const w = summarize(ok, { kinds: { m: 'medium' }, grades: worse }).tasks[0].decision;
  assert.strictEqual(w.verdict, 'no pasa');
  assert.match(w.reasons.join(' '), /calidad/);
  const moreSerious = [...grade('m', 'A', [4, 4, 4], 0), ...grade('m', 'B', [4, 4, 4], 1)];
  assert.strictEqual(summarize(ok, { kinds: { m: 'medium' }, grades: moreSerious }).tasks[0].decision.verdict, 'no pasa');
  const pending = summarize(ok, { kinds: { m: 'medium' }, grades: [] }).tasks[0].decision;
  assert.strictEqual(pending.verdict, 'pendiente');
});

test('summary chico: B <= A en tiempo y tokens pasa; exceso con rangos pisados es sin diferencia; sin pisar, no pasa', async () => {
  const { summarize } = await imp('summary.mjs');
  const wall = (ws) => (i) => ({ wall_s: ws[i] });
  const good = [...arm('s', 'A', [100, 110, 120], wall([60, 65, 70])), ...arm('s', 'B', [80, 85, 90], wall([50, 52, 54]))];
  assert.strictEqual(summarize(good, { kinds: { s: 'small' } }).tasks[0].decision.verdict, 'pasa');
  const overlap = [...arm('s', 'A', [100, 110, 120], wall([60, 65, 70])), ...arm('s', 'B', [105, 115, 125], wall([50, 52, 54]))];
  assert.strictEqual(summarize(overlap, { kinds: { s: 'small' } }).tasks[0].decision.verdict, 'sin diferencia demostrada');
  const bad = [...arm('s', 'A', [100, 110, 120], wall([60, 65, 70])), ...arm('s', 'B', [200, 210, 220], wall([50, 52, 54]))];
  assert.strictEqual(summarize(bad, { kinds: { s: 'small' } }).tasks[0].decision.verdict, 'no pasa');
  const wrong = [...arm('s', 'A', [100, 110, 120]), ...arm('s', 'B', [80, 85, 90], (i) => (i === 1 ? { accept_fail: 1 } : {}))];
  const w = summarize(wrong, { kinds: { s: 'small' } }).tasks[0].decision;
  assert.strictEqual(w.verdict, 'no pasa');
  assert.match(w.reasons.join(' '), /correct/);
});

test('summary: rerun reemplaza a la corrida original, la contaminada se excluye y se dice', async () => {
  const { summarize } = await imp('summary.mjs');
  const rows = [
    ...arm('s', 'A', [100, 110, 120]),
    ...arm('s', 'B', [80, 85, 90]),
    mk('s', 'B', 1, 500, { note: 'rerun', timestamp: '2026-10-24T00:00:00Z' }),
    mk('s', 'B', 4, 70, { contamination: true }),
  ];
  const r = summarize(rows, { kinds: { s: 'small' } });
  const t = r.tasks[0];
  assert.strictEqual(t.arms.B.n, 3, 'rep 4 contaminada fuera');
  assert.strictEqual(t.arms.B.tokens.max, 500, 'rerun de rep 1 reemplaza');
  assert.ok(r.notes.some((n) => /contamin/.test(n)));
  assert.ok(r.notes.some((n) => /rerun|repetid/.test(n)));
  const inc = summarize(rows, { kinds: { s: 'small' }, includeContaminated: true });
  assert.strictEqual(inc.tasks[0].arms.B.n, 4);
});

test('summary: la salida de texto lleva mediana con rango, nivel de evidencia y nunca un número solo', async () => {
  const { summarize, formatSummary } = await imp('summary.mjs');
  const rows = [...arm('m', 'A', [100, 105, 110]), ...arm('m', 'B', [130, 135, 140])];
  const text = formatSummary(summarize(rows, { kinds: { m: 'medium' }, grades: [] }));
  assert.match(text, /mediana 105 \(rango 100 a 110\)/);
  assert.match(text, /mediana 135 \(rango 130 a 140\)/);
  assert.match(text, /evidence: E3/);
  assert.match(text, /aceptación/);
  const text2 = formatSummary(summarize([...arm('m', 'A', [100]), ...arm('m', 'B', [130])], { kinds: {} }));
  assert.match(text2, /evidence: E2/);
  assert.match(text2, /tipo de tarea no definido/);
});

// ---------------------------------------------------------------- CLI

const RUN = path.join(HARNESS, 'run.mjs');
function cli(env, ...args) {
  const r = spawnSync(process.execPath, [RUN, ...args, '--config', env.cfgPath], {
    encoding: 'utf8', env: { ...process.env, FAKE_CLAUDE_MODE: 'edit' },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

test('CLI: prepare, run, accept, row y summary de punta a punta con el claude falso', () => {
  const env = setup();
  try {
    const a = cli(env, 'prepare', '--task', 't1', '--arm', 'B', '--rep', '1');
    assert.strictEqual(a.status, 0, a.err);
    assert.ok(JSON.parse(a.out).repo.endsWith('repo'));
    const again = cli(env, 'prepare', '--task', 't1', '--arm', 'B', '--rep', '1');
    assert.notStrictEqual(again.status, 0);
    assert.match(again.err, /ya existe/);
    const r = cli(env, 'run', '--task', 't1', '--arm', 'B', '--rep', '1');
    assert.strictEqual(r.status, 0, r.err);
    assert.strictEqual(JSON.parse(r.out).weightedTokens, 1200);
    const ac = cli(env, 'accept', '--task', 't1', '--arm', 'B', '--rep', '1');
    assert.strictEqual(ac.status, 0, ac.err);
    const row = cli(env, 'row', '--task', 't1', '--arm', 'B', '--rep', '1');
    assert.strictEqual(row.status, 0, row.err);
    const dup = cli(env, 'row', '--task', 't1', '--arm', 'B', '--rep', '1');
    assert.notStrictEqual(dup.status, 0);
    assert.match(dup.err, /rerun/);
    const s = cli(env, 'summary', '--csv', env.cfg.csvPath);
    assert.strictEqual(s.status, 0, s.err);
    assert.match(s.out, /t1/);
    assert.match(s.out, /mediana 1200 \(rango 1200 a 1200\)/);
    const bad = cli(env, 'nope');
    assert.notStrictEqual(bad.status, 0);
    const miss = spawnSync(process.execPath, [RUN, 'prepare', '--task', 't1', '--arm', 'A', '--rep', '1', '--config', path.join(env.root, 'no.json')], { encoding: 'utf8' });
    assert.notStrictEqual(miss.status, 0);
    assert.match(miss.stderr, /harness\.example\.json/);
  } finally { cleanup(env); }
});

test('repo: harness.local.json está en .gitignore y harness.example.json no trae datos reales', () => {
  const ig = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.match(ig, /^tests\/evals\/harness\/harness\.local\.json$/m);
  const ex = JSON.parse(fs.readFileSync(path.join(HARNESS, 'harness.example.json'), 'utf8'));
  for (const k of ['sourceRepo', 'privateRoot', 'workRoot', 'configDir', 'arms', 'model', 'permissionMode', 'perRunCapUsd', 'timeoutMs', 'weights', 'seed']) {
    assert.ok(k in ex, `falta ${k}`);
  }
  const text = JSON.stringify(ex);
  assert.ok(!/[A-Za-z]:[\\/]Users|pigna/i.test(text), 'sin rutas personales');
});
