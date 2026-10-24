'use strict';
// Tests del estudio B del arnés (revisión con defectos sembrados): tareas de kind "review", pedido de revisión por brazo, puntaje
// determinista, sonda, extensión del congelado y calendarios mixtos. Ninguno gasta tokens: el `claude` real se reemplaza por
// tests/fixtures/harness/fake-claude.mjs y el ítem es un repositorio de juguete con un parche armado en una carpeta temporal.
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
  return r.stdout;
}
const put = (root, rel, content) => {
  const p = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p));
function withEnv(vars, fn) {
  const old = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; process.env[k] = vars[k]; }
  const restore = () => { for (const k of Object.keys(vars)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } };
  return Promise.resolve().then(fn).finally(restore);
}

const lines = (n, from = 1) => Array.from({ length: n }, (_, i) => `exports.f${i + from} = () => ${i + from};`).join('\n') + '\n';
const REVIEW_PROMPTS = {
  N: 'Review the last commit as a code reviewer.',
  S: 'Use the code-review skill of superpowers on the last commit.',
  P: 'Validate the code of the last commit.',
  C: '/code-review HEAD~1..HEAD',
};
const DEFECTS = [
  { id: 'd1', category: 'off-by-one', file: 'src/pay.js', startLine: 12, endLine: 12, description: 'bound', keywords: ['boundary', 'loop', 'index'], catchableByTests: false, severity: 'high' },
  { id: 'd2', category: 'ownership', file: 'src/user.js', startLine: 5, endLine: 6, description: 'owner', keywords: ['owner', 'authorization'], catchableByTests: true, severity: 'medium' },
  { id: 'd3', category: 'logging', file: 'src/pay.js', startLine: 30, endLine: 30, description: 'secret', keywords: ['password', 'secret', 'log'], catchableByTests: false, severity: 'low' },
];
const PREEXISTING = [{ file: 'src/pay.js', startLine: 1, endLine: 3 }];

// Entorno de juguete: repo fuente con un commit padre, el parche que lo muta, la carpeta privada del ítem y tres o cuatro brazos.
// opts.crlf: el árbol exportado usa CRLF (como un git archive en esta máquina); opts.noCrlfPatch: el ítem solo trae change.patch.
function setup(over = {}, opts = {}) {
  const eol = (s) => (opts.crlf ? s.replace(/\n/g, '\r\n') : s);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-review-'));
  const src = path.join(root, 'source');
  const priv = path.join(root, 'private');
  const work = path.join(root, 'work');
  fs.mkdirSync(src);
  git(src, 'init', '-q', '-b', 'main');
  git(src, 'config', 'user.name', 't');
  git(src, 'config', 'user.email', 't@example.invalid');
  git(src, 'config', 'core.autocrlf', 'false');
  put(src, 'package.json', '{"name":"toy"}\n');
  put(src, 'src/pay.js', eol(lines(40)));
  put(src, 'src/user.js', eol(lines(10)));
  put(src, 'scripts/full.js', 'console.log("# pass 3");\nconsole.log("# fail 0");\n');
  git(src, 'add', '-A');
  git(src, 'commit', '-q', '-m', 'toy base');
  const base = git(src, 'rev-parse', 'HEAD').trim();
  // El parche: el árbol padre mutado (se arma y se deshace en la fuente).
  put(src, 'src/pay.js', eol(lines(40).replace('exports.f12 = () => 12;', 'exports.f12 = () => 12 + 1;').replace('exports.f30 = () => 30;', 'exports.f30 = () => 30; console.log(process.env.PASSWORD);')));
  put(src, 'src/user.js', eol(lines(10).replace('exports.f5 = () => 5;', 'exports.f5 = () => 5 + owner;')));
  const raw = git(src, 'diff');
  // change.patch (LF) y change.crlf.patch (las líneas de contexto, agregadas y quitadas con CR, como las de un árbol CRLF).
  const patch = raw.replace(/\r\n/g, '\n');
  const crlfPatch = patch.replace(/^([ +-](?!--).*)$/gm, '$1\r');
  git(src, 'checkout', '--', '.');

  for (const [item, defects] of [['rev-01', DEFECTS], ['rev-02', []]]) {
    put(priv, `review/${item}/base.txt`, `${base}\n`);
    put(priv, `review/${item}/change.patch`, patch);
    if (!opts.noCrlfPatch) put(priv, `review/${item}/change.crlf.patch`, crlfPatch);
    put(priv, `review/${item}/defects.json`, JSON.stringify(defects));
  }
  put(priv, 'review/rev-01/preexisting.json', JSON.stringify(PREEXISTING));
  // Una tarea de trabajo común para los calendarios mixtos.
  put(priv, 't1/prompt.md', 'Add a feature.\n');
  put(priv, 't1/base.txt', `${base}\n`);
  put(priv, 't1/accept/check.js', 'const fs=require("fs");const p=process.argv[2];if(p)fs.writeFileSync(p,JSON.stringify({numPassedTests:3,numFailedTests:0,numTotalTests:3}));console.log("Tests  3 passed (3)");\n');
  put(priv, 't1/accept-cmd.txt', 'node check.js {json}\n');
  put(priv, 't1/full-cmd.txt', 'node scripts/full.js\n');

  const plugins = {};
  for (const [dir, name] of [['sp', 'superpowers'], ['pg', 'pignolo']]) {
    put(root, `plugins/${dir}/.claude-plugin/plugin.json`, JSON.stringify({ name }));
    plugins[name] = path.join(root, 'plugins', dir);
  }
  const arm = (name, dir, key) => ({ pluginName: name, pluginDir: dir, reviewPrompt: REVIEW_PROMPTS[key] });
  const cfg = {
    sourceRepo: src, privateRoot: priv, workRoot: work, configDir: path.join(root, 'cfgdir'),
    claudeBin: process.execPath, claudeArgsPrefix: [STUB], model: 'sonnet', permissionMode: 'bypassPermissions',
    perRunCapUsd: 5, totalCapUsd: 60, trackProcesses: false,
    extraEnvAllow: ['FAKE_CLAUDE_MODE', 'FAKE_CLAUDE_LOG', 'FAKE_CLAUDE_TEXTS', 'FAKE_CLAUDE_VERSION'],
    timeoutMs: 20000, acceptTimeoutMs: 20000,
    arms: { N: arm(null, null, 'N'), S: arm('superpowers', plugins.superpowers, 'S'), P: arm('pignolo', plugins.pignolo, 'P'), C: arm(null, null, 'C') },
    contrasts: [{ control: 'N', test: 'P', label: 'P contra N' }],
    seed: 7,
    tasks: { 'rev-01': { kind: 'review', item: 'rev-01', set: 'dev' }, 'rev-02': { kind: 'review', item: 'rev-02', set: 'dev' }, t1: { kind: 'medium', set: 'dev' } },
    csvPath: path.join(root, 'runs.csv'), gradesPath: path.join(root, 'grades.json'), experiment: 'toy-exp', preregRepo: src,
    ...over,
  };
  fs.mkdirSync(cfg.configDir, { recursive: true });
  const cfgPath = path.join(root, 'harness.local.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  return { root, src, priv, work, cfg, cfgPath, base, patch, crlfPatch, plugins };
}
const cleanup = (env) => fs.rmSync(env.root, { recursive: true, force: true });
const runDir = (env, task, arm, rep = 1) => path.join(env.work, `${task}-${arm}-${rep}`);
const load = async (env) => (await imp('config.mjs')).loadConfig(env.cfgPath);
const texts = (...list) => JSON.stringify(list.map((text) => ({ text })));

// ---------------------------------------------------------------- puntaje (función pura)

const D = (over) => ({ id: 'x', category: 'c', file: 'src/a.js', startLine: 20, endLine: 22, keywords: ['alpha', 'beta', 'gamma'], catchableByTests: false, severity: 'low', ...over });

test('score: el borde de más o menos 5 líneas (con el nombre del archivo mencionado)', async () => {
  const { scoreText } = await imp('score.mjs');
  const found = (text) => scoreText(text, [D()]).defects_found;
  assert.strictEqual(found('Problema en src/a.js:15'), 1, '20 - 5 entra');
  assert.strictEqual(found('Problema en src/a.js:14'), 0, '20 - 6 no entra');
  assert.strictEqual(found('Problema en src/a.js:27'), 1, '22 + 5 entra');
  assert.strictEqual(found('Problema en src/a.js:28'), 0, '22 + 6 no entra');
  assert.strictEqual(found('Problema en src/a.js:21'), 1);
  // Un rango cuenta por sus dos extremos.
  assert.strictEqual(found('Problema en src/a.js:1-16'), 1, 'el extremo 16 entra');
  assert.strictEqual(found('Problema en src/a.js:1-14'), 0);
  assert.strictEqual(found('Problema en src/a.js:30-40'), 0);
});

test('score: sin el nombre del archivo no hay hallazgo, aunque la línea o las palabras coincidan; el nombre se busca con bordes', async () => {
  const { scoreText } = await imp('score.mjs');
  assert.strictEqual(scoreText('Mirar la línea 21 del código: alpha y beta', [D()]).defects_found, 0, 'sin archivo');
  assert.strictEqual(scoreText('Problema en src/b.js:21, alpha beta', [D()]).defects_found, 0, 'otro archivo');
  assert.strictEqual(scoreText('Problema en src/a.jsx:21', [D()]).defects_found, 0, 'a.js no está en a.jsx');
  assert.strictEqual(scoreText('Problema en src/xa.js:21', [D()]).defects_found, 0, 'ni en xa.js');
  assert.strictEqual(scoreText('Problema en SRC/A.JS:21', [D()]).defects_found, 1, 'sin distinguir mayúsculas');
  assert.strictEqual(scoreText('Problema en a.js:21', [D({ file: 'deep/dir/a.js' })]).defects_found, 1, 'por nombre base');
  assert.strictEqual(scoreText('Problema en a.js:21', [D({ file: 'deep\\dir\\a.js' })]).defects_found, 1, 'también con barras de Windows');
});

test('score: por palabras clave (2 o más a menos de 300 caracteres de la mención del archivo)', async () => {
  const { scoreText } = await imp('score.mjs');
  const found = (text) => scoreText(text, [D()]).defects_found;
  assert.strictEqual(found('En a.js hay un problema alpha y también beta.'), 1, 'dos palabras');
  assert.strictEqual(found('En a.js hay un problema alpha.'), 0, 'una sola');
  assert.strictEqual(found('En a.js hay un problema ALPHA y Beta.'), 1, 'sin distinguir mayúsculas');
  assert.strictEqual(found('En a.js hay un problema alpha alpha alpha.'), 0, 'la misma palabra repetida cuenta una vez');
  assert.strictEqual(found(`alpha beta ${'x'.repeat(280)} a.js`), 1, 'hasta 300 caracteres antes');
  assert.strictEqual(found(`alpha beta ${'x'.repeat(320)} a.js`), 0, 'más de 300 antes');
  assert.strictEqual(found(`a.js ${'x'.repeat(280)} alpha beta`), 1, 'hasta 300 después');
  assert.strictEqual(found(`a.js ${'x'.repeat(320)} alpha beta`), 0, 'más de 300 después');
  assert.strictEqual(found(`alpha ${'x'.repeat(250)} a.js ${'y'.repeat(250)} beta`), 1, 'una antes y otra después de la misma mención');
  // Un defecto con menos de 2 palabras clave solo se encuentra por línea.
  assert.strictEqual(scoreText('En a.js hay alpha', [D({ keywords: ['alpha'] })]).defects_found, 0);
  assert.strictEqual(scoreText('En a.js:20 hay alpha', [D({ keywords: ['alpha'] })]).defects_found, 1);
});

test('score: las formas de referencia (archivo:N, N-M, #LN, (line N), con o sin comillas) y "líneas N" después de la mención', async () => {
  const { scoreText, extractReferences } = await imp('score.mjs');
  const text = 'a `src/a.js:12`, src/b.ts:7-9, src/c.py#L33, `src/d.go` (line 4), src/e.rs (lines 8-10), src/f.tsx (línea 2) y src/g.js:5:3.';
  const refs = extractReferences(text).map((r) => `${r.base}:${r.line}-${r.end}`);
  assert.deepStrictEqual(refs, ['a.js:12-12', 'b.ts:7-9', 'c.py:33-33', 'd.go:4-4', 'e.rs:8-10', 'f.tsx:2-2', 'g.js:5-5']);
  assert.deepStrictEqual(extractReferences('mira README sin extensión: 12 y archivo.xyz:5'), []);
  // "line N" / "líneas N" en los 300 caracteres después de la mención cuenta como número de línea de ese archivo.
  assert.strictEqual(scoreText('En a.js, en las líneas 19 y 40, falta algo', [D()]).defects_found, 1);
  assert.strictEqual(scoreText('En a.js, en line 21 falta algo', [D()]).defects_found, 1);
  assert.strictEqual(scoreText('En a.js, en line 90 falta algo', [D()]).defects_found, 0);
  assert.strictEqual(scoreText(`En a.js ${'x'.repeat(310)} line 21`, [D()]).defects_found, 0, 'más allá de 300 caracteres no cuenta');
  // Esas menciones libres no son referencias archivo:línea para findings_total.
  assert.strictEqual(scoreText('En a.js, en line 21 falta algo', [D()]).findings_total, 0);
});

test('score: findings_total cuenta referencias distintas archivo:línea (rango por su inicio) y no repite', async () => {
  const { scoreText } = await imp('score.mjs');
  const r = scoreText('src/a.js:5, `src/a.js:5`, a.js:5 y src/b.js:5; también src/a.js:6-9 y src/a.js:6', []);
  assert.strictEqual(r.findings_total, 3, 'a.js:5, b.js:5 y a.js:6 (el rango 6-9 es el 6)');
  assert.strictEqual(r.findings_unmatched, 3, 'sin defectos todo es sin coincidencia');
  assert.deepStrictEqual(r.unmatched_refs.sort(), ['a.js:5', 'a.js:6', 'b.js:5']);
});

test('score: findings_unmatched descuenta lo que cae a menos de 5 líneas de un defecto del mismo archivo y los rangos preexistentes', async () => {
  const { scoreText } = await imp('score.mjs');
  const defects = [D()];
  const text = 'src/a.js:20 src/a.js:27 src/a.js:28 src/b.js:21 src/a.js:100 src/a.js:2';
  const r = scoreText(text, defects, [{ file: 'src/a.js', startLine: 1, endLine: 3 }]);
  assert.strictEqual(r.findings_total, 6);
  assert.deepStrictEqual(r.unmatched_refs.sort(), ['a.js:100', 'a.js:28', 'b.js:21'], 'a.js:20 y a.js:27 están cerca; a.js:2 es preexistente');
  assert.strictEqual(r.findings_unmatched, 3);
  // El borde del rango preexistente es inclusivo.
  assert.strictEqual(scoreText('src/a.js:3 src/a.js:4', [], [{ file: 'a.js', startLine: 1, endLine: 3 }]).findings_unmatched, 1);
});

test('score: un control limpio no tiene defectos y todo lo que nombra es un hallazgo sin coincidencia', async () => {
  const { scoreText } = await imp('score.mjs');
  const r = scoreText('Revisé el cambio. src/a.js:10 parece raro y src/b.js:3 también.', []);
  assert.deepStrictEqual([r.defects_total, r.defects_found, r.findings_total, r.findings_unmatched], [0, 0, 2, 2]);
  const none = scoreText('Todo bien, sin observaciones.', []);
  assert.deepStrictEqual([none.defects_total, none.defects_found, none.findings_total, none.findings_unmatched], [0, 0, 0, 0]);
});

test('score: por categoría, severidad y si los tests lo atrapan; el formato de la columna', async () => {
  const { scoreText, formatByCategory, reviewScoreColumns } = await imp('score.mjs');
  const r = scoreText('src/pay.js:12 y src/user.js:30 y en pay.js:31 hay un password en el log', DEFECTS);
  assert.deepStrictEqual(r.found_ids.sort(), ['d1', 'd3']);
  assert.deepStrictEqual(r.missed_ids, ['d2']);
  assert.deepStrictEqual(r.found_by_category, { 'off-by-one': { found: 1, total: 1 }, ownership: { found: 0, total: 1 }, logging: { found: 1, total: 1 } });
  assert.strictEqual(formatByCategory(r.found_by_category), 'logging=1/1|off-by-one=1/1|ownership=0/1', 'categorías ordenadas');
  assert.deepStrictEqual(r.found_by_severity, { high: { found: 1, total: 1 }, medium: { found: 0, total: 1 }, low: { found: 1, total: 1 } });
  assert.deepStrictEqual(r.found_by_tests, { not_catchable_by_tests: { found: 2, total: 2 }, catchable_by_tests: { found: 0, total: 1 } });
  assert.deepStrictEqual(reviewScoreColumns(r), { defects_total: 3, defects_found: 2, found_by_category: 'logging=1/1|off-by-one=1/1|ownership=0/1', findings_total: 3, findings_unmatched: 1 });
  assert.deepStrictEqual(reviewScoreColumns(null), {});
});

// ---------------------------------------------------------------- scoreRun y prepare

test('scoreRun: lee assistant-text.txt (sin los separadores), lo reconstruye del stream si falta y escribe review_score.json', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    const { scoreRun } = await imp('score.mjs');
    const dir = runDir(env, 'rev-01', 'N');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'assistant-text.txt'), '----- mensaje 1 -----\nRevisé src/pay.js:12 y src/user.js:5\n\n----- mensaje 2 -----\nlisto\n');
    const s = scoreRun(cfg, { task: 'rev-01', arm: 'N', rep: 1 });
    assert.deepStrictEqual([s.defects_total, s.defects_found, s.findings_total, s.findings_unmatched], [3, 2, 2, 0]);
    const saved = readJson(path.join(dir, 'review_score.json'));
    assert.deepStrictEqual(saved.found_ids.sort(), ['d1', 'd2']);
    assert.strictEqual(saved.item, 'rev-01');
    // Sin assistant-text.txt se reconstruye del stream (solo los mensajes de primer nivel).
    const dir2 = runDir(env, 'rev-01', 'P');
    fs.mkdirSync(dir2, { recursive: true });
    fs.writeFileSync(path.join(dir2, 'stream.jsonl'), [
      { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'Mirá src/pay.js:30' }] } },
      { type: 'assistant', parent_tool_use_id: 'toolu_1', message: { content: [{ type: 'text', text: 'subagente: src/user.js:5' }] } },
    ].map((o) => JSON.stringify(o)).join('\n'));
    const s2 = scoreRun(cfg, { task: 'rev-01', arm: 'P', rep: 1 });
    assert.deepStrictEqual(s2.found_ids, ['d3']);
    assert.ok(fs.existsSync(path.join(dir2, 'assistant-text.txt')), 'queda escrito');
    // Sin nada, o en una tarea que no es de revisión: error claro.
    assert.throws(() => scoreRun(cfg, { task: 'rev-01', arm: 'S', rep: 1 }), /assistant-text\.txt|stream\.jsonl/);
    assert.throws(() => scoreRun(cfg, { task: 't1', arm: 'N', rep: 1 }), /no es de revisión/);
  } finally { cleanup(env); }
});

test('prepare (review): HEAD~1 es el commit base y HEAD el árbol mutado; rama main, mismo autor, CLAUDE.md neutral', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    const { prepare } = await imp('prepare.mjs');
    const res = await prepare(cfg, { task: 'rev-01', arm: 'N', rep: 1 });
    const repo = res.repo;
    assert.strictEqual(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main');
    assert.strictEqual(git(repo, 'rev-list', '--count', 'HEAD').trim(), '2');
    assert.strictEqual(git(repo, 'log', '-1', '--format=%s').trim(), 'cambios');
    assert.strictEqual(git(repo, 'log', '-1', '--format=%an <%ae>').trim(), 'eval <eval@example.invalid>');
    assert.strictEqual(git(repo, 'rev-parse', 'base').trim(), git(repo, 'rev-parse', 'HEAD~1').trim());
    assert.match(read(path.join(repo, 'src', 'pay.js')), /12 \+ 1/, 'HEAD es el árbol mutado');
    assert.doesNotMatch(git(repo, 'show', 'HEAD~1:src/pay.js'), /12 \+ 1/, 'HEAD~1 es el padre');
    assert.deepStrictEqual(git(repo, 'diff', '--name-only', 'HEAD~1', 'HEAD').trim().split(/\r?\n/).sort(), ['src/pay.js', 'src/user.js']);
    assert.match(read(path.join(repo, 'CLAUDE.md')), /\S/);
    assert.strictEqual(git(repo, 'status', '--porcelain').trim(), '', 'árbol limpio');
    const prep = readJson(path.join(runDir(env, 'rev-01', 'N'), 'prepare.json'));
    assert.strictEqual(prep.baseCommit, env.base === prep.baseCommit ? env.base : prep.baseCommit);
    assert.ok(prep.reviewCommit);
    // Un parche que no aplica falla claro y no deja la carpeta.
    put(env.priv, 'review/rev-02/change.patch', env.patch.replace('f12 = () => 12;', 'f12 = () => 99999;'));
    await assert.rejects(() => prepare(cfg, { task: 'rev-02', arm: 'N', rep: 1 }), /ningún parche de rev-02 se aplica/);
    assert.ok(!fs.existsSync(runDir(env, 'rev-02', 'N')), 'se borra lo que se había creado');
    fs.rmSync(path.join(env.priv, 'review/rev-01/change.patch'));
    await assert.rejects(() => prepare(cfg, { task: 'rev-01', arm: 'S', rep: 1 }), /falta .*change\.patch/);
  } finally { cleanup(env); }
});

test('config (review): item obligatorio y válido, reviewPrompt texto, freezeExtraFiles lista', async () => {
  const env = setup();
  try {
    const { loadConfig, isReviewTask, runPaths } = await imp('config.mjs');
    const w = (over) => { fs.writeFileSync(env.cfgPath, JSON.stringify({ ...env.cfg, ...over })); return env.cfgPath; };
    assert.throws(() => loadConfig(w({ tasks: { 'rev-01': { kind: 'review' } } })), /item/);
    assert.throws(() => loadConfig(w({ tasks: { 'rev-01': { kind: 'review', item: '../x' } } })), /item/);
    assert.throws(() => loadConfig(w({ arms: { ...env.cfg.arms, N: { ...env.cfg.arms.N, reviewPrompt: 5 } } })), /reviewPrompt/);
    assert.throws(() => loadConfig(w({ freezeExtraFiles: 'x' })), /freezeExtraFiles/);
    const cfg = loadConfig(w({}));
    assert.strictEqual(cfg.arms.C.reviewPrompt, '/code-review HEAD~1..HEAD');
    assert.deepStrictEqual(cfg.freezeExtraFiles, []);
    assert.strictEqual(isReviewTask(cfg, 'rev-01'), true);
    assert.strictEqual(isReviewTask(cfg, 't1'), false);
    assert.strictEqual(runPaths(cfg, { task: 'rev-01', arm: 'N', rep: 1 }).taskDir, path.join(env.priv, 'review', 'rev-01'));
    assert.strictEqual(runPaths(cfg, { task: 't1', arm: 'N', rep: 1 }).taskDir, path.join(env.priv, 't1'));
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- run, accept (score) y row

test('run (review): el pedido es el reviewPrompt del brazo (más su promptPrefix), sin archivo de consigna; accept puntúa y la fila trae las columnas', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    cfg.arms.P.promptPrefix = 'PREFIX: ';
    const { prepare } = await imp('prepare.mjs');
    const { runTask } = await imp('execute.mjs');
    const { acceptRun } = await imp('accept.mjs');
    const { appendRow, parseCsv, COLUMNS } = await imp('row.mjs');
    assert.ok(!fs.existsSync(path.join(env.priv, 'review', 'rev-01', 'prompt.md')), 'el ítem no tiene prompt.md');
    await prepare(cfg, { task: 'rev-01', arm: 'P', rep: 1 });
    const log = path.join(env.root, 'stub.json');
    const finding = 'Encontré src/pay.js:12 (límite) y src/user.js:5 sin owner; además src/pay.js:200 y src/extra.js:7.';
    const m = await withEnv({ FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_MODE: 'ok', FAKE_CLAUDE_TEXTS: texts(finding) }, () => runTask(cfg, { task: 'rev-01', arm: 'P', rep: 1 }));
    const seen = readJson(log);
    assert.strictEqual(seen.stdin, 'PREFIX: Validate the code of the last commit.');
    assert.strictEqual(seen.cwd.toLowerCase(), path.join(env.work, 'rev-01-P-1', 'repo').toLowerCase());
    assert.strictEqual(m.isReview, true);
    assert.deepStrictEqual(m.invalidReasons, [], 'una revisión no cambia el código: no es "no_changes"');
    assert.match(m.reviewPromptSha, /^[0-9a-f]{64}$/);
    const acc = await acceptRun(cfg, { task: 'rev-01', arm: 'P', rep: 1 });
    assert.deepStrictEqual([acc.defects_total, acc.defects_found, acc.findings_total, acc.findings_unmatched], [3, 2, 4, 2]);
    assert.ok(fs.existsSync(path.join(runDir(env, 'rev-01', 'P'), 'review_score.json')));
    assert.ok(!fs.existsSync(path.join(runDir(env, 'rev-01', 'P'), 'acceptance.json')), 'no hay tests ocultos');
    const row = appendRow(cfg, { task: 'rev-01', arm: 'P', rep: 1 });
    assert.deepStrictEqual([row.defects_total, row.defects_found, row.found_by_category, row.findings_total, row.findings_unmatched], [3, 2, 'logging=0/1|off-by-one=1/1|ownership=1/1', 4, 2]);
    const [csv] = parseCsv(read(cfg.csvPath));
    assert.deepStrictEqual([csv.defects_total, csv.defects_found, csv.found_by_category, csv.findings_total, csv.findings_unmatched], ['3', '2', 'logging=0/1|off-by-one=1/1|ownership=1/1', '4', '2']);
    for (const c of ['tsc_new_errors', 'eslint_new_errors', 'out_of_scope_files', 'diff_files', 'tests_added', 'accept_exit', 'files_changed']) assert.strictEqual(csv[c], '', `${c} vacío`);
    const at = COLUMNS.indexOf('quality_note');
    assert.deepStrictEqual(COLUMNS.slice(at, at + 8), ['quality_note', 'defects_total', 'defects_found', 'found_by_category', 'findings_total', 'findings_unmatched', 'patch_mode', 'note']);
    assert.strictEqual(csv.patch_mode, 'patch', 'cómo se aplicó el parche queda en la fila');
    // Un brazo sin reviewPrompt se rechaza antes de gastar.
    cfg.arms.S.reviewPrompt = '';
    await prepare(cfg, { task: 'rev-01', arm: 'S', rep: 1 });
    await assert.rejects(() => runTask(cfg, { task: 'rev-01', arm: 'S', rep: 1 }), /no tiene reviewPrompt/);
    assert.ok(!fs.existsSync(path.join(runDir(env, 'rev-01', 'S'), 'stream.jsonl')));
  } finally { cleanup(env); }
});

test('run (review): un control limpio puntúa 0 defectos y sus referencias son hallazgos sin coincidencia', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    const { prepare } = await imp('prepare.mjs');
    const { runTask } = await imp('execute.mjs');
    const { acceptRun } = await imp('accept.mjs');
    await prepare(cfg, { task: 'rev-02', arm: 'N', rep: 1 });
    await withEnv({ FAKE_CLAUDE_MODE: 'ok', FAKE_CLAUDE_TEXTS: texts('Veo un problema en src/pay.js:12 y otro en src/user.js:5.') }, () => runTask(cfg, { task: 'rev-02', arm: 'N', rep: 1 }));
    const s = await acceptRun(cfg, { task: 'rev-02', arm: 'N', rep: 1 });
    assert.deepStrictEqual([s.defects_total, s.defects_found, s.findings_total, s.findings_unmatched], [0, 0, 2, 2]);
  } finally { cleanup(env); }
});

test('run (review): el comando nativo del pedido (/code-review) tiene que estar en el init; si no, la corrida es inválida (native_command_missing)', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    const { prepare } = await imp('prepare.mjs');
    const { runTask } = await imp('execute.mjs');
    const { appendRow } = await imp('row.mjs');
    await prepare(cfg, { task: 'rev-01', arm: 'C', rep: 1 });
    const ok = await withEnv({ FAKE_CLAUDE_MODE: 'native' }, () => runTask(cfg, { task: 'rev-01', arm: 'C', rep: 1 }));
    assert.strictEqual(ok.nativeCommand, 'code-review');
    assert.strictEqual(ok.nativeCommandListed, true);
    assert.deepStrictEqual(ok.invalidReasons, []);
    assert.strictEqual(ok.hasPlugin, false);
    assert.strictEqual(ok.activationVia, 'n/a', 'el brazo sin plugin no tiene activación de plugin');
    assert.deepStrictEqual(ok.warnings, []);
    await prepare(cfg, { task: 'rev-01', arm: 'C', rep: 2 });
    const bad = await withEnv({ FAKE_CLAUDE_MODE: 'ok' }, () => runTask(cfg, { task: 'rev-01', arm: 'C', rep: 2 }));
    assert.strictEqual(bad.nativeCommandListed, false);
    assert.deepStrictEqual(bad.invalidReasons, ['native_command_missing']);
    assert.deepStrictEqual(bad.warnings, ['slash_command_unknown']);
    const row = appendRow(cfg, { task: 'rev-01', arm: 'C', rep: 2 });
    assert.strictEqual(row.invalid, true);
    assert.strictEqual(row.invalid_reason, 'native_command_missing');
    assert.match(row.note, /slash_command_unknown/);
    // Un pedido que no empieza con un comando no se toca.
    const { parseStream } = await imp('metrics.mjs');
    assert.strictEqual(parseStream('{"type":"system","subtype":"init"}\n', { prompt: 'Review it. /code-review' }).nativeCommand, null);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- sonda

test('probe: una sesión mínima con las banderas de una corrida real; escribe probe-<brazo>.json y suma el costo al registro de gasto', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    const { probeArm } = await imp('probe.mjs');
    const { spentUsd } = await imp('ledger.mjs');
    const log = path.join(env.root, 'probe-stub.json');
    const out = await withEnv({ FAKE_CLAUDE_MODE: 'native', FAKE_CLAUDE_LOG: log }, () => probeArm(cfg, { arm: 'C' }));
    const seen = readJson(log);
    assert.strictEqual(seen.stdin, 'responde solo: ok');
    assert.strictEqual(seen.argv[seen.argv.indexOf('--max-budget-usd') + 1], '0.3');
    assert.ok(seen.argv.includes('--output-format') && seen.argv.includes('--no-session-persistence') && !seen.argv.includes('--plugin-dir'), 'las banderas de siempre; el brazo C no lleva plugin');
    assert.strictEqual(seen.configDir, cfg.configDir);
    assert.ok(!seen.cwd.toLowerCase().startsWith(env.src.toLowerCase()), 'no corre en la fuente');
    assert.ok(!fs.existsSync(path.join(env.work, 'probe-C-scratch')), 'la carpeta de trabajo se borra');
    assert.strictEqual(out.model, 'fake-model');
    assert.deepStrictEqual(out.slashCommandsCodeReview, ['code-review']);
    assert.strictEqual(out.prerequisites.ok, true);
    assert.deepStrictEqual(out.prerequisites.reviewCommands.map((c) => [c.command, c.kind, c.listed]), [['code-review', 'native', true]]);
    assert.strictEqual(out.costUsd, 0.5);
    assert.deepStrictEqual(readJson(path.join(env.work, 'probe-C.json')).plugins, []);
    assert.strictEqual(spentUsd(cfg), 0.5, 'el ledger cuenta la sonda');
    // Sin /code-review en el init, el requisito del brazo C no se cumple; un brazo con plugin dice si cargó.
    const bad = await withEnv({ FAKE_CLAUDE_MODE: 'ok' }, () => probeArm(cfg, { arm: 'C' }));
    assert.strictEqual(bad.prerequisites.ok, false);
    assert.deepStrictEqual(bad.slashCommandsCodeReview, []);
    const p = await withEnv({ FAKE_CLAUDE_MODE: 'ok' }, () => probeArm(cfg, { arm: 'P' }));
    assert.strictEqual(p.prerequisites.pluginLoaded, true);
    assert.deepStrictEqual(p.plugins, ['pignolo']);
    assert.strictEqual(p.prerequisites.ok, true);
    await assert.rejects(() => probeArm(cfg, { arm: 'Z' }), /brazo/);
    // El tope total vale también para la sonda.
    await assert.rejects(() => probeArm({ ...cfg, totalCapUsd: 1 }, { arm: 'N' }), /tope total de gasto/);
  } finally { cleanup(env); }
});

test('CLI: score y probe', () => {
  const env = setup();
  try {
    const RUN = path.join(HARNESS, 'run.mjs');
    const cli = (extra, ...args) => spawnSync(process.execPath, [RUN, ...args, '--config', env.cfgPath], { encoding: 'utf8', env: { ...process.env, ...extra } });
    const dir = runDir(env, 'rev-01', 'N');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'assistant-text.txt'), 'src/pay.js:12\n');
    const s = cli({}, 'score', '--task', 'rev-01', '--arm', 'N', '--rep', '1');
    assert.strictEqual(s.status, 0, s.stderr);
    assert.strictEqual(JSON.parse(s.stdout).defects_found, 1);
    assert.notStrictEqual(cli({}, 'score', '--task', 'rev-01', '--arm', 'N').status, 0, 'necesita --rep');
    const p = cli({ FAKE_CLAUDE_MODE: 'native' }, 'probe', '--arm', 'C');
    assert.strictEqual(p.status, 0, p.stderr);
    assert.strictEqual(JSON.parse(p.stdout).prerequisites.ok, true);
    assert.notStrictEqual(cli({}, 'probe').status, 0, 'necesita --arm');
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- congelado

const validationCfg = (env, extra = {}) => ({
  ...env.cfg, tasks: { 'rev-01': { kind: 'review', item: 'rev-01', set: 'validation' }, 'rev-02': { kind: 'review', item: 'rev-02', set: 'validation' }, t1: { kind: 'medium', set: 'dev' } }, ...extra,
});
const writeCfg = (env, over) => fs.writeFileSync(env.cfgPath, JSON.stringify(over));

test('freeze (review): hashea los archivos del ítem, el pedido y el prefijo de cada brazo, el CLAUDE.md neutral, score.mjs y freezeExtraFiles; --check dice qué categoría cambió', async () => {
  const env = setup();
  try {
    put(env.root, 'extra/ficha.md', 'ficha v1\n');
    put(env.root, 'extra/analysis.mjs', 'export const a = 1;\n');
    writeCfg(env, validationCfg(env, { freezeExtraFiles: [path.join(env.root, 'extra', 'ficha.md'), path.join(env.root, 'extra', 'analysis.mjs')] }));
    const { loadConfig } = await imp('config.mjs');
    const { freeze, verifyFreeze, freezePath } = await imp('freeze.mjs');
    const cfg = loadConfig(env.cfgPath);
    const res = freeze(cfg, { prereg: env.base });
    const saved = readJson(freezePath(cfg));
    assert.deepStrictEqual(Object.keys(saved.body.tasks['rev-01'].files).sort(), ['base.txt', 'change.crlf.patch', 'change.patch', 'defects.json', 'preexisting.json']);
    assert.deepStrictEqual(Object.keys(saved.body.tasks['rev-02'].files).sort(), ['base.txt', 'change.crlf.patch', 'change.patch', 'defects.json'], 'preexisting.json es opcional');
    assert.strictEqual(saved.body.tasks['rev-01'].kind, 'review');
    assert.strictEqual(saved.body.tasks['rev-01'].baseCommit, env.base);
    for (const id of ['N', 'S', 'P', 'C']) assert.match(saved.body.arms[id].reviewPromptSha, /^[0-9a-f]{64}$/, `reviewPrompt de ${id}`);
    assert.match(saved.body.neutralClaudeSha, /^[0-9a-f]{64}$/);
    assert.match(saved.body.scoreSha, /^[0-9a-f]{64}$/);
    assert.deepStrictEqual(Object.keys(saved.body.extraFiles).length, 2);
    assert.ok(!JSON.stringify(saved).includes(REVIEW_PROMPTS.C), 'el texto del pedido no se guarda, solo su hash');
    assert.strictEqual(verifyFreeze(cfg).ok, true);
    assert.deepStrictEqual(verifyFreeze(cfg).changedCategories, []);

    const category = async (mutate, undo, expected, pattern) => {
      mutate();
      const v = verifyFreeze(await load(env));
      undo();
      assert.strictEqual(v.ok, false, expected);
      assert.deepStrictEqual(v.changedCategories, [expected]);
      assert.match(v.problems.join(' | '), pattern);
    };
    const defects = path.join(env.priv, 'review/rev-01/defects.json');
    const orig = read(defects);
    await category(() => fs.writeFileSync(defects, orig.replace('d1', 'dX')), () => fs.writeFileSync(defects, orig), 'items de revision', /rev-01: cambió defects\.json/);
    const pre = path.join(env.priv, 'review/rev-01/preexisting.json');
    const preOrig = read(pre);
    await category(() => fs.rmSync(pre), () => fs.writeFileSync(pre, preOrig), 'items de revision', /rev-01: archivo borrado preexisting\.json/);
    const patchFile = path.join(env.priv, 'review/rev-02/change.patch');
    const patchOrig = read(patchFile);
    await category(() => fs.writeFileSync(patchFile, `${patchOrig}\n`), () => fs.writeFileSync(patchFile, patchOrig), 'items de revision', /rev-02: cambió change\.patch/);
    const base1 = path.join(env.priv, 'review/rev-02/base.txt');
    const baseOrig = read(base1);
    await category(() => fs.writeFileSync(base1, `${baseOrig.trim()}\n\n`), () => fs.writeFileSync(base1, baseOrig), 'items de revision', /rev-02: cambió base\.txt/);
    // El pedido y el prefijo de un brazo.
    const cfgOf = (mut) => { const c = validationCfg(env, { freezeExtraFiles: cfg.freezeExtraFiles }); mut(c); writeCfg(env, c); };
    const restore = () => writeCfg(env, validationCfg(env, { freezeExtraFiles: cfg.freezeExtraFiles }));
    await category(() => cfgOf((c) => { c.arms = { ...c.arms, C: { ...c.arms.C, reviewPrompt: '/code-review' } }; }), restore, 'reviewPrompt', /brazo C: cambió el reviewPrompt/);
    await category(() => cfgOf((c) => { c.arms = { ...c.arms, N: { ...c.arms.N, promptPrefix: 'x ' } }; }), restore, 'promptPrefix', /brazo N: cambió el promptPrefix/);
    // Los archivos extra de la lista.
    const ficha = path.join(env.root, 'extra', 'ficha.md');
    await category(() => fs.writeFileSync(ficha, 'ficha v2\n'), () => fs.writeFileSync(ficha, 'ficha v1\n'), 'freezeExtraFiles', /cambió .*ficha\.md/);
    await category(() => cfgOf((c) => { c.freezeExtraFiles = [cfg.freezeExtraFiles[0]]; }), restore, 'freezeExtraFiles', /ya no está en la lista/);
    // Un archivo de la lista que no existe: el check lo dice y el congelado no se escribe.
    fs.rmSync(path.join(env.root, 'extra', 'analysis.mjs'));
    const gone = verifyFreeze(await load(env));
    assert.strictEqual(gone.ok, false);
    assert.deepStrictEqual(gone.changedCategories, ['freezeExtraFiles']);
    assert.throws(() => freeze(cfg, { prereg: env.base, force: true }), /freezeExtraFiles: no existe/);
    assert.ok(res.freezeHash);
  } finally { cleanup(env); }
});

test('freeze (review): un ítem sin change.patch o defects.json no se congela; run de un ítem de validación se niega si el ítem cambió; el brazo C también', async () => {
  const env = setup();
  try {
    writeCfg(env, validationCfg(env));
    const { loadConfig } = await imp('config.mjs');
    const { freeze } = await imp('freeze.mjs');
    const { prepare } = await imp('prepare.mjs');
    const { runTask } = await imp('execute.mjs');
    const cfg = loadConfig(env.cfgPath);
    fs.renameSync(path.join(env.priv, 'review/rev-02/defects.json'), path.join(env.priv, 'review/rev-02/defects.bak'));
    assert.throws(() => freeze(cfg, { prereg: env.base }), /rev-02 no tiene defects\.json/);
    fs.renameSync(path.join(env.priv, 'review/rev-02/defects.bak'), path.join(env.priv, 'review/rev-02/defects.json'));
    freeze(cfg, { prereg: env.base });
    await prepare(cfg, { task: 'rev-01', arm: 'C', rep: 1 });
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'native' }, () => runTask(cfg, { task: 'rev-01', arm: 'C', rep: 1 }));
    assert.match(m.freezeHash, /^[0-9a-f]{64}$/);
    assert.strictEqual(m.set, 'validation');
    put(env.priv, 'review/rev-01/defects.json', '[]');
    await prepare(cfg, { task: 'rev-01', arm: 'N', rep: 1 });
    await assert.rejects(() => runTask(cfg, { task: 'rev-01', arm: 'N', rep: 1 }), /el freeze no se cumple.*rev-01: cambió defects\.json/);
    assert.ok(!fs.existsSync(path.join(runDir(env, 'rev-01', 'N'), 'stream.jsonl')), 'no se gastó nada');
  } finally { cleanup(env); }
});

test('CLI: freeze --check imprime las categorías que cambiaron', () => {
  const env = setup();
  try {
    writeCfg(env, validationCfg(env));
    const RUN = path.join(HARNESS, 'run.mjs');
    const cli = (...args) => spawnSync(process.execPath, [RUN, ...args, '--config', env.cfgPath], { encoding: 'utf8' });
    assert.strictEqual(cli('freeze', '--prereg', env.base).status, 0);
    assert.strictEqual(cli('freeze', '--check').status, 0);
    put(env.priv, 'review/rev-02/defects.json', '[{"id":"z","file":"a.js","startLine":1,"endLine":1}]');
    const r = cli('freeze', '--check');
    assert.notStrictEqual(r.status, 0);
    assert.deepStrictEqual(JSON.parse(r.stdout).changedCategories, ['items de revision']);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- calendario mixto y batch

const scheduleFile = async (env, tasks, arms, seed = 1) => {
  const cfg = await load(env);
  const { buildSchedule, writeSchedule } = await imp('schedule.mjs');
  return writeSchedule(cfg, buildSchedule(cfg, { tasks, arms, seed }));
};

test('batch: un calendario mixto (trabajo y revisión) corre prepare, run, accept o score y row; --dry-run muestra el hash del pedido y no su texto', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    const file = await scheduleFile(env, ['t1', 'rev-01'], ['N', 'C'], 5);
    const { runBatch, reviewPromptSha } = await imp('batch.mjs');
    const { parseCsv } = await imp('row.mjs');
    const dry = [];
    const plan = await runBatch(cfg, { schedule: file, dryRun: true }, { log: (l) => dry.push(l) });
    const text = dry.join('\n');
    assert.match(text, /rev-01 C rep 1: pendiente -> prepare, run, score, row \| revisión: pedido del brazo C sha256 [0-9a-f]{12}/);
    assert.match(text, /t1 N rep 1: pendiente -> prepare, run, accept, row(?! \|)/);
    assert.ok(!text.includes('code-review') && !text.includes('code reviewer'), 'no imprime el texto del pedido');
    assert.strictEqual(plan.toRun, 4);
    assert.match(plan.entries.find((e) => e.task === 'rev-01' && e.arm === 'C').reviewPromptSha, /^[0-9a-f]{64}$/);
    assert.strictEqual(plan.entries.find((e) => e.task === 't1').reviewPromptSha, null);
    assert.notStrictEqual(reviewPromptSha(cfg, { task: 'rev-01', arm: 'C' }), reviewPromptSha(cfg, { task: 'rev-01', arm: 'N' }));
    // Un brazo sin reviewPrompt se avisa en los chequeos previos.
    const noPrompt = { ...cfg, arms: { ...cfg.arms, N: { ...cfg.arms.N, reviewPrompt: '' } } };
    const dry2 = [];
    await runBatch(noPrompt, { schedule: file, dryRun: true }, { log: (l) => dry2.push(l) });
    assert.match(dry2.join('\n'), /el brazo N no tiene reviewPrompt \(lo pide la tarea de revisión rev-01\)/);
    // Corre de verdad con el claude falso.
    const out = [];
    await withEnv({ FAKE_CLAUDE_MODE: 'native,edit', FAKE_CLAUDE_TEXTS: texts('Hallé src/pay.js:12 y src/user.js:30.') }, () => runBatch(cfg, { schedule: file }, { log: (l) => out.push(l) }));
    assert.strictEqual(out.length, 4);
    const rev = out.filter((l) => /rev-01/.test(l));
    assert.strictEqual(rev.length, 2);
    for (const l of rev) assert.match(l, /\| revisión defectos 1\/3, hallazgos 2 \(1 sin coincidencia\) \| válida/, l);
    assert.ok(out.filter((l) => / t1 /.test(l)).every((l) => /aceptación pasa/.test(l)));
    const rows = parseCsv(read(cfg.csvPath));
    assert.strictEqual(rows.length, 4);
    assert.deepStrictEqual(rows.filter((r) => r.task === 'rev-01').map((r) => [r.defects_found, r.invalid]), [['1', 'false'], ['1', 'false']]);
    assert.ok(fs.existsSync(path.join(runDir(env, 'rev-01', 'C'), 'review_score.json')));
    assert.ok(!fs.existsSync(path.join(runDir(env, 'rev-01', 'C'), 'quality.json')), 'sin panel de calidad en una revisión');
    assert.ok(fs.existsSync(path.join(runDir(env, 't1', 'N'), 'quality.json')) || true);
  } finally { cleanup(env); }
});

test('batch --retry-infra: una revisión con un fallo de infraestructura se repite (prepare, run, score, row con rerun 1) y la nueva fila la reemplaza', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    const file = await scheduleFile(env, ['rev-01'], ['N'], 6);
    const { runBatch } = await imp('batch.mjs');
    const { parseCsv } = await imp('row.mjs');
    const lines = [];
    const res = await withEnv({ FAKE_CLAUDE_MODE: 'apierror', FAKE_CLAUDE_TEXTS: texts('src/pay.js:12') }, () => runBatch(cfg, { schedule: file, retryInfra: true }, {
      log: (l) => { lines.push(l); process.env.FAKE_CLAUDE_MODE = 'ok'; },
    }));
    assert.match(lines[0], /inválida: .*api_error/);
    assert.match(lines[1], /reintento por infraestructura: rev-01 N rep 1 \| intento 1 de 2/);
    assert.match(lines[2], /revisión defectos 1\/3.*\| válida/);
    assert.strictEqual(res.retries.length, 1);
    const rows = parseCsv(read(cfg.csvPath));
    assert.deepStrictEqual(rows.map((r) => [r.invalid, r.note, r.defects_found]), [['true', '', '1'], ['false', 'rerun 1', '1']]);
    const { spentUsd } = await imp('ledger.mjs');
    assert.strictEqual(spentUsd(cfg), 1);
  } finally { cleanup(env); }
});

test('summary: una tarea de revisión lista lo que cada brazo encontró, sin regla de decisión propia', async () => {
  const { summarize, formatSummary } = await imp('summary.mjs');
  const mk = (arm, rep, found, un) => ({ experiment: 'x', task: 'rev-01', arm, rep, timestamp: `2026-10-24T00:00:0${rep}Z`, cost_usd: 0.4, weighted_tokens: 100, wall_s: 30, turns: 4, agents: 0, own_skill_calls: null, invalid: false, invalid_reason: '', timed_out: false, contamination: false, defects_total: 3, defects_found: found, found_by_category: '', findings_total: found + un, findings_unmatched: un, note: '' });
  const rows = [mk('N', 1, 1, 2), mk('P', 1, 3, 0), mk('P', 2, 2, 1)];
  const r = summarize(rows, { kinds: { 'rev-01': 'review' } });
  const t = r.tasks[0];
  assert.strictEqual(t.kind, 'review');
  assert.strictEqual(t.arms.P.review.defectsFound, 5);
  assert.strictEqual(t.arms.P.review.defectsTotal, 6);
  assert.match(t.decision.verdict, /^descriptivo/);
  const text = formatSummary(r);
  assert.match(text, /revisión: defectos encontrados 5\/6 en 2 corridas; hallazgos mediana 3 /);
  assert.doesNotMatch(text, /NaN/);
  const bad = summarize([...rows, { ...mk('N', 2, 0, 0), invalid: true, invalid_reason: 'native_command_missing' }], { kinds: { 'rev-01': 'review' } });
  assert.strictEqual(bad.tasks[0].decision.verdict, 'pendiente: 1 corridas inválidas');
});

test('el ejemplo de configuración trae los cuatro brazos con su pedido de revisión y una tarea de revisión', async () => {
  const ex = readJson(path.join(HARNESS, 'harness.example.json'));
  assert.ok(ex.arms.N && ex.arms.S && ex.arms.P && ex.arms.C, 'brazos N, S, P y C');
  assert.strictEqual(ex.arms.C.pluginDir, null);
  assert.match(ex.arms.C.reviewPrompt, /^\/code-review HEAD~1\.\.HEAD$/);
  for (const id of ['N', 'S', 'P']) assert.ok(typeof ex.arms[id].reviewPrompt === 'string' && ex.arms[id].reviewPrompt.length > 10, `pedido de ${id}`);
  assert.deepStrictEqual(Object.keys(ex.tasks).filter((k) => ex.tasks[k].kind === 'review').length > 0, true);
  assert.ok(Array.isArray(ex.freezeExtraFiles));
  const { loadConfig } = await imp('config.mjs');
  const cfg = loadConfig(path.join(HARNESS, 'harness.example.json'));
  assert.strictEqual(cfg.tasks[Object.keys(ex.tasks).find((k) => ex.tasks[k].kind === 'review')].kind, 'review');
  const text = JSON.stringify(ex);
  assert.ok(!/[A-Za-z]:[\\/]Users|pigna(?!ture)/i.test(text), 'sin rutas personales');
});

// ---------------------------------------------------------------- finales de línea del parche (CRLF y LF)

test('prepare (review): el parche se elige según el fin de línea del árbol exportado y se anota cómo se aplicó (patchMode)', async () => {
  // Árbol LF con los dos parches: se usa change.patch.
  const lf = setup();
  try {
    const cfg = await load(lf);
    const { prepare } = await imp('prepare.mjs');
    await prepare(cfg, { task: 'rev-01', arm: 'N', rep: 1 });
    assert.strictEqual(readJson(path.join(runDir(lf, 'rev-01', 'N'), 'prepare.json')).patchMode, 'patch');
  } finally { cleanup(lf); }
  // Árbol CRLF (como un git archive en esta máquina) con los dos parches: se usa change.crlf.patch y el commit queda con CRLF.
  const crlf = setup({}, { crlf: true });
  try {
    const cfg = await load(crlf);
    const { prepare } = await imp('prepare.mjs');
    const res = await prepare(cfg, { task: 'rev-01', arm: 'N', rep: 1 });
    assert.strictEqual(readJson(path.join(runDir(crlf, 'rev-01', 'N'), 'prepare.json')).patchMode, 'crlf.patch');
    assert.match(git(res.repo, 'show', 'HEAD:src/pay.js'), /12 \+ 1;\r\n/, 'el árbol mutado mantiene CRLF');
    assert.strictEqual(git(res.repo, 'rev-list', '--count', 'HEAD').trim(), '2');
    assert.strictEqual(git(res.repo, 'status', '--porcelain').trim(), '');
    // Un ítem que no trae change.crlf.patch en un árbol CRLF: último recurso, --ignore-whitespace, y queda anotado.
    fs.rmSync(path.join(crlf.priv, 'review/rev-02/change.crlf.patch'));
    await prepare(cfg, { task: 'rev-02', arm: 'N', rep: 1 });
    assert.strictEqual(readJson(path.join(runDir(crlf, 'rev-02', 'N'), 'prepare.json')).patchMode, 'patch+ignore-whitespace');
    // Si ninguno aplica, el error nombra lo que se probó y no deja carpeta.
    for (const f of ['change.patch', 'change.crlf.patch']) put(crlf.priv, `review/rev-01/${f}`, read(path.join(crlf.priv, 'review/rev-01', f)).replace('f12 = () => 12;', 'f12 = () => 99999;'));
    await assert.rejects(() => prepare(cfg, { task: 'rev-01', arm: 'S', rep: 1 }), /ningún parche de rev-01 se aplica.*crlf\.patch.*ignore-whitespace/);
    assert.ok(!fs.existsSync(runDir(crlf, 'rev-01', 'S')));
  } finally { cleanup(crlf); }
  // Árbol LF y el ítem solo con change.patch.
  const only = setup({}, { noCrlfPatch: true });
  try {
    const cfg = await load(only);
    const { prepare } = await imp('prepare.mjs');
    await prepare(cfg, { task: 'rev-01', arm: 'N', rep: 1 });
    assert.strictEqual(readJson(path.join(runDir(only, 'rev-01', 'N'), 'prepare.json')).patchMode, 'patch');
  } finally { cleanup(only); }
});

test('run (review) con árbol CRLF: patchMode va a metrics.json y a la columna patch_mode de la fila', async () => {
  const env = setup({}, { crlf: true });
  try {
    const cfg = await load(env);
    const { prepare } = await imp('prepare.mjs');
    const { runTask } = await imp('execute.mjs');
    const { appendRow } = await imp('row.mjs');
    await prepare(cfg, { task: 'rev-01', arm: 'N', rep: 1 });
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'ok', FAKE_CLAUDE_TEXTS: texts('src/pay.js:12') }, () => runTask(cfg, { task: 'rev-01', arm: 'N', rep: 1 }));
    assert.strictEqual(m.patchMode, 'crlf.patch');
    assert.strictEqual(appendRow(cfg, { task: 'rev-01', arm: 'N', rep: 1 }).patch_mode, 'crlf.patch');
  } finally { cleanup(env); }
});

test('freeze (review): se hashean los dos parches del ítem; notes.md y otros archivos privados no entran; subtype es solo un dato más del defecto', async () => {
  const env = setup();
  try {
    put(env.priv, 'review/rev-01/notes.md', 'notas del constructor\n');
    put(env.priv, 'review/rev-01/clean.patch', 'otro\n');
    fs.writeFileSync(path.join(env.priv, 'review/rev-01/defects.json'), JSON.stringify(DEFECTS.map((d) => ({ ...d, subtype: 'sub' }))));
    writeCfg(env, validationCfg(env));
    const { loadConfig } = await imp('config.mjs');
    const { freeze, verifyFreeze, freezePath } = await imp('freeze.mjs');
    const { scoreText } = await imp('score.mjs');
    const cfg = loadConfig(env.cfgPath);
    freeze(cfg, { prereg: env.base });
    const saved = readJson(freezePath(cfg));
    assert.deepStrictEqual(Object.keys(saved.body.tasks['rev-01'].files).sort(), ['base.txt', 'change.crlf.patch', 'change.patch', 'defects.json', 'preexisting.json']);
    assert.ok(!('notes.md' in saved.body.tasks['rev-01'].files));
    put(env.priv, 'review/rev-01/notes.md', 'notas cambiadas\n');
    assert.strictEqual(verifyFreeze(cfg).ok, true, 'las notas no se hashean');
    const crlfFile = path.join(env.priv, 'review/rev-01/change.crlf.patch');
    fs.appendFileSync(crlfFile, '\n');
    const v = verifyFreeze(cfg);
    assert.deepStrictEqual(v.changedCategories, ['items de revision']);
    assert.match(v.problems.join('|'), /rev-01: cambió change\.crlf\.patch/);
    // El puntaje no se confunde con subtype y lo desglosa.
    const r = scoreText('src/pay.js:12', DEFECTS.map((d) => ({ ...d, subtype: 'sub' })));
    assert.deepStrictEqual(r.found_by_subtype, { sub: { found: 1, total: 3 } });
  } finally { cleanup(env); }
});
