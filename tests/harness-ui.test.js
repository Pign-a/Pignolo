'use strict';
// Tests de las tareas de interfaz del arnés (kind "ui"): sandbox en blanco, pedido del autor en la carpeta privada, puntaje con el
// navegador de ui-audit, paquete a ciegas para el voto, congelado, calendarios y resumen. Ninguno gasta tokens: el `claude` real se
// reemplaza por un stub propio (escribe una pantalla HTML) y el navegador por un módulo falso inyectado; un único test usa Chrome
// real si está instalado (si no, se saltea) y otro corre con PIGNOLO_UI_BROWSER sin definir.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const HARNESS = path.join(__dirname, 'evals', 'harness');
const FIXTURE_DESIGN = path.join(__dirname, 'evals', 'fixtures', 'ui-identity', 'design.md');
const AUDIT_LIB = path.join(__dirname, '..', 'plugins', 'pignolo', 'ui-audit', 'lib');
const imp = (f) => import(pathToFileURL(path.join(HARNESS, f)).href);
const impLib = (f) => import(pathToFileURL(path.join(AUDIT_LIB, f)).href);

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
const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p));
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
function withEnv(vars, fn) {
  const old = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  const restore = () => { for (const k of Object.keys(vars)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } };
  return Promise.resolve().then(fn).finally(restore);
}

const SCENARIO_TEXT = 'I need a screen to register a monthly expense: amount, category and the month it belongs to, and a clear way to save it.';
const SCREEN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Expense</title>
<meta name="generator" content="pignolo ui flow">
<!-- note for the pignolo brief step: keep one primary action -->
<style>
body{margin:0;font-family:system-ui;background:#fff;color:#1D1D1F}
h1{font-size:32px;font-weight:600}
.btn{background:#0A6CD8;color:#fff;border:0;border-radius:12px;height:44px;padding:0 16px;transition:background .2s}
.btn:hover{background:#0A5EBB}
/* generated under .pignolo/ui/run-1 */
select{height:44px}
</style></head>
<body><main><h1>New expense</h1>
<label>Category <select><option>Food</option><option>Rent</option></select></label>
<label>Month <input type="month"></label>
<button class="btn">Save</button>
<img alt="" src="../../../.pignolo/ui/shared.png">
<p class="empty-state">No expenses yet</p></main></body></html>
`;

// Un `claude` falso: escribe la pantalla HTML (FAKE_UI_MODE: screens | fallback | none), registra argv y stdin en FAKE_UI_LOG.
const STUB_SOURCE = `
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
if (argv.includes('--version')) { process.stdout.write('9.9.9-fake (Claude Code)\\n'); process.exit(0); }
let stdin = '';
try { stdin = fs.readFileSync(0, 'utf8'); } catch { /* none */ }
if (process.env.FAKE_UI_LOG) fs.writeFileSync(process.env.FAKE_UI_LOG, JSON.stringify({ argv, cwd: process.cwd(), stdin }));
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const i = argv.indexOf('--plugin-dir');
let own = null;
if (i >= 0) { try { own = JSON.parse(fs.readFileSync(path.join(argv[i + 1], '.claude-plugin', 'plugin.json'), 'utf8')).name; } catch { own = null; } }
out({ type: 'system', subtype: 'init', cwd: process.cwd(), model: 'fake-model', claude_code_version: '9.9.9-fake',
  plugins: own ? [{ name: own, path: argv[i + 1] }] : [], skills: own ? [own + ':ui'] : [], agents: [], slash_commands: own ? [own + ':ui'] : [] });
const mode = process.env.FAKE_UI_MODE || 'screens';
const html = process.env.FAKE_UI_HTML ? fs.readFileSync(process.env.FAKE_UI_HTML, 'utf8') : '<!doctype html><title>x</title><h1>x</h1>';
const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(process.cwd(), rel)), { recursive: true }); fs.writeFileSync(path.join(process.cwd(), rel), text); };
if (mode === 'screens') w('design/screens/expense/index.html', html);
if (mode === 'fallback') { w('design/expense.html', html); w('design/components/button.html', html); w('design/index.html', html); }
out({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'Done.' }] } });
out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, num_turns: 3, result: 'Done.', total_cost_usd: 0.25,
  usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 1000, cache_creation_input_tokens: 400 },
  modelUsage: { 'fake-model': { inputTokens: 100, outputTokens: 20, cacheReadInputTokens: 1000, cacheCreationInputTokens: 400, costUSD: 0.25 } } });
`;

// Entorno de juguete: carpeta privada con el escenario, dos brazos (N sin plugin, P con plugin y uiPrefix forzado) y una tarea ui.
function setup(over = {}, taskOver = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-ui-harness-'));
  const src = path.join(root, 'source');
  const priv = path.join(root, 'private');
  const work = path.join(root, 'work');
  fs.mkdirSync(src);
  git(src, 'init', '-q', '-b', 'main');
  git(src, 'config', 'user.name', 't');
  git(src, 'config', 'user.email', 't@example.invalid');
  put(src, 'README.md', 'toy\n');
  git(src, 'add', '-A');
  git(src, 'commit', '-q', '-m', 'toy');
  put(priv, 'ui/expense.md', `title: Registrar un gasto\n${SCENARIO_TEXT}\n`);
  put(root, 'plugins/pg/.claude-plugin/plugin.json', JSON.stringify({ name: 'pignolo' }));
  put(root, 'plugins/sp/.claude-plugin/plugin.json', JSON.stringify({ name: 'superpowers' }));
  fs.writeFileSync(path.join(root, 'stub-ui-claude.mjs'), STUB_SOURCE);
  fs.writeFileSync(path.join(root, 'screen.html'), SCREEN_HTML);
  const cfg = {
    sourceRepo: src, privateRoot: priv, workRoot: work, configDir: path.join(root, 'cfgdir'),
    claudeBin: process.execPath, claudeArgsPrefix: [path.join(root, 'stub-ui-claude.mjs')], model: 'sonnet', permissionMode: 'bypassPermissions',
    perRunCapUsd: 5, totalCapUsd: 60, trackProcesses: false,
    extraEnvAllow: ['FAKE_UI_MODE', 'FAKE_UI_LOG', 'FAKE_UI_HTML'],
    timeoutMs: 30000, acceptTimeoutMs: 30000,
    arms: {
      N: { pluginName: null, pluginDir: null },
      P: { pluginName: 'pignolo', pluginDir: path.join(root, 'plugins', 'pg'), uiPrefix: '/pignolo:ui ' },
      S: { pluginName: 'superpowers', pluginDir: path.join(root, 'plugins', 'sp') },
    },
    contrasts: [{ control: 'N', test: 'P', label: 'P contra N' }],
    seed: 7,
    tasks: { 'ui-expense': { kind: 'ui', scenario: 'expense', set: 'dev', ...taskOver } },
    csvPath: path.join(root, 'runs.csv'), gradesPath: path.join(root, 'grades.json'), experiment: 'toy-exp', preregRepo: src,
    ...over,
  };
  fs.mkdirSync(cfg.configDir, { recursive: true });
  const cfgPath = path.join(root, 'harness.local.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  return { root, src, priv, work, cfg, cfgPath, html: path.join(root, 'screen.html') };
}
const cleanup = (env) => fs.rmSync(env.root, { recursive: true, force: true });
const runDir = (env, arm, rep = 1, task = 'ui-expense') => path.join(env.work, `${task}-${arm}-${rep}`);
const load = async (env) => (await imp('config.mjs')).loadConfig(env.cfgPath);
const TASK = 'ui-expense';

// ---- navegador falso: el módulo que usaría ui-audit, sin Chrome. Registra las llamadas del protocolo.
const DESKTOP_REPLY = {
  native: { select: 1, dateInputs: 1 }, interactive: 3, aboveFold: 3,
  buttons: { total: 2, filled: 2, primary: 2, fill: 'rgb(10, 108, 216)' },
  text: { sizes: [12, 17, 32], weights: [400, 600] }, colors: { used: 5, offToken: 1 },
  states: { empty: true, loading: false, error: false }, heading: true, markedCount: 3, rest: ['rest-0', 'rest-1', 'rest-2'],
};
function fakeBrowserModule({ cdpFails = false, calls = [] } = {}) {
  const forced = new Map();
  const nodeOf = (selector) => Number(/data-uim="(\d+)"/.exec(selector)[1]) + 100;
  const cdp = {
    async send(method, params, opts) {
      calls.push({ method, params, sessionId: opts && opts.sessionId });
      if (cdpFails) throw new Error('Protocol error: CSS agent is not available');
      if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
      if (method === 'DOM.querySelector') return { nodeId: nodeOf(params.selector) };
      if (method === 'CSS.forcePseudoState') { forced.set(params.nodeId, params.forcedPseudoClasses); return {}; }
      return {};
    },
  };
  const tab = {
    sessionId: 'session-1',
    async setViewport(v) { calls.push({ method: 'viewport', params: v }); },
    async setMedia() {},
    async navigate(url) { calls.push({ method: 'navigate', params: { url } }); return { finalUrl: url }; },
    async waitReady() {},
    async screenshot() { return Buffer.from('89504e470d0a1a0a', 'hex'); },
    async evaluate(expression) {
      if (expression.includes('/*ui:desktop*/')) return DESKTOP_REPLY;
      if (expression.includes('/*ui:targets*/')) return { controls: 3, counted: 3, min: 30, below44: 2, below24: 0 };
      if (expression.includes('/*ui:snap*/')) {
        const i = Number(/data-uim="(\d+)"/.exec(expression)[1]);
        const state = (forced.get(i + 100) || []).join('+');
        if (state === 'hover' && i === 0) return 'hover-0'; // only the first control has a hover style
        if (state === 'focus+focus-visible' && i <= 1) return `focus-${i}`; // the first two have a focus style
        return `rest-${i}`;
      }
      throw new Error('unexpected expression');
    },
  };
  const browser = { product: 'FakeChrome/1.0', cdp, async newPage() { return tab; }, async close() { calls.push({ method: 'close' }); } };
  return { calls, deps: { findBrowser: () => ({ path: '/fake/chrome', source: 'env' }), openBrowser: async () => browser } };
}

async function runOne(env, arm, { mode = 'screens', rep = 1 } = {}) {
  const cfg = await load(env);
  const { prepare } = await imp('prepare.mjs');
  const { runTask } = await imp('execute.mjs');
  await prepare(cfg, { task: TASK, arm, rep });
  const m = await withEnv({ FAKE_UI_MODE: mode, FAKE_UI_HTML: env.html, FAKE_UI_LOG: path.join(env.root, `stub-${arm}-${rep}.json`) }, () => runTask(cfg, { task: TASK, arm, rep }));
  return { cfg, m };
}

// ---------------------------------------------------------------- configuración y escenario

test('config: una tarea ui necesita un escenario válido y el uiPrefix de un brazo es un texto', async () => {
  const env = setup();
  try {
    const { loadConfig } = await imp('config.mjs');
    const cfg = loadConfig(env.cfgPath);
    assert.strictEqual(cfg.arms.P.uiPrefix, '/pignolo:ui ');
    assert.strictEqual(cfg.arms.N.uiPrefix, '', 'sin prefijo por defecto');
    const bad = (patch, re) => {
      const f = path.join(env.root, 'bad.json');
      fs.writeFileSync(f, JSON.stringify({ ...env.cfg, ...patch }));
      assert.throws(() => loadConfig(f), re);
    };
    bad({ tasks: { u: { kind: 'ui' } } }, /scenario/);
    bad({ tasks: { u: { kind: 'ui', scenario: '../x' } } }, /scenario/);
    bad({ tasks: { u: { kind: 'ui', scenario: 'a', set: 'otro' } } }, /set/);
    bad({ tasks: { u: { kind: 'ui', scenario: 'a', arms: ['Z'] } } }, /arms/);
    bad({ arms: { ...env.cfg.arms, N: { uiPrefix: 3 } } }, /uiPrefix/);
  } finally { cleanup(env); }
});

test('escenario: la línea title: no entra en el pedido; el prefijo del brazo va delante del texto y nada más', async () => {
  const { parseScenario, readScenario, uiPromptOf } = await imp('ui.mjs');
  assert.deepStrictEqual(parseScenario('title: Algo\r\n\r\nHola\r\nmundo\r\n'), { title: 'Algo', text: 'Hola\nmundo' });
  assert.deepStrictEqual(parseScenario('Sin título aquí.\n'), { title: null, text: 'Sin título aquí.' });
  const env = setup();
  try {
    const cfg = await load(env);
    const s = readScenario(cfg, TASK);
    assert.strictEqual(s.text, SCENARIO_TEXT);
    assert.strictEqual(s.title, 'Registrar un gasto');
    assert.strictEqual(s.sha, sha(SCENARIO_TEXT));
    assert.strictEqual(uiPromptOf(cfg, TASK, 'P').prompt, `/pignolo:ui ${SCENARIO_TEXT}`);
    assert.strictEqual(uiPromptOf(cfg, TASK, 'N').prompt, SCENARIO_TEXT);
    fs.writeFileSync(path.join(env.priv, 'ui', 'expense.md'), 'title: Solo título\n');
    assert.throws(() => readScenario(cfg, TASK), /no tiene texto/);
    fs.rmSync(path.join(env.priv, 'ui', 'expense.md'));
    assert.throws(() => readScenario(cfg, TASK), /falta .*expense\.md/);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- prepare

test('prepare (ui): sandbox en blanco con solo design.md y design/ vacío, commit base; sin node_modules, sin CLAUDE.md, sin exportar la fuente', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    const { prepare } = await imp('prepare.mjs');
    const r = await prepare(cfg, { task: TASK, arm: 'P', rep: 1 });
    const repo = path.join(runDir(env, 'P'), 'repo');
    assert.strictEqual(r.repo, repo);
    assert.deepStrictEqual(fs.readdirSync(repo).sort(), ['.git', 'design', 'design.md']);
    assert.deepStrictEqual(fs.readdirSync(path.join(repo, 'design')), ['.gitkeep'], 'la carpeta se versiona con un .gitkeep vacío');
    assert.strictEqual(fs.statSync(path.join(repo, 'design', '.gitkeep')).size, 0);
    assert.strictEqual(read(path.join(repo, 'design.md')), read(FIXTURE_DESIGN), 'la identidad es la del fixture');
    assert.deepStrictEqual(git(repo, 'ls-files').split('\n').sort(), ['design.md', 'design/.gitkeep']);
    assert.strictEqual(git(repo, 'log', '--format=%s'), 'base');
    assert.strictEqual(git(repo, 'rev-parse', 'base'), git(repo, 'rev-parse', 'HEAD'), 'etiqueta base');
    assert.strictEqual(git(repo, 'branch', '--show-current'), 'main');
    assert.strictEqual(git(repo, 'status', '--porcelain'), '');
    const prep = readJson(path.join(runDir(env, 'P'), 'prepare.json'));
    assert.strictEqual(prep.scenario, 'expense');
    assert.strictEqual(prep.scenarioSha, sha(SCENARIO_TEXT));
    assert.ok(!fs.existsSync(path.join(env.work, '_nm')), 'no se copia node_modules');
    await assert.rejects(() => prepare(cfg, { task: TASK, arm: 'P', rep: 1 }), /ya existe/);
  } finally { cleanup(env); }
});

test('prepare (ui): sin el archivo del escenario falla antes de crear nada', async () => {
  const env = setup();
  try {
    fs.rmSync(path.join(env.priv, 'ui', 'expense.md'));
    const cfg = await load(env);
    const { prepare } = await imp('prepare.mjs');
    await assert.rejects(() => prepare(cfg, { task: TASK, arm: 'N', rep: 1 }), /falta .*expense\.md/);
    assert.ok(!fs.existsSync(runDir(env, 'N')));
  } finally { cleanup(env); }
});

test('la identidad del fixture es un design.md válido para ui-audit, con las decisiones pedidas', async () => {
  const { validateDesign } = await impLib('design-doc.mjs');
  const { loadCatalog } = await impLib('catalog.mjs');
  const text = read(FIXTURE_DESIGN);
  const v = validateDesign(text, { catalog: loadCatalog() });
  assert.strictEqual(v.status, 'valid');
  assert.strictEqual(v.reject, false);
  assert.deepStrictEqual(v.findings, []);
  const d = v.data;
  assert.strictEqual(d.rounded.md, '12px', 'radio de 12px para los controles');
  assert.strictEqual(d.spacing['1'], '4px', 'base de 4px');
  assert.ok(d.pignolo.motion.durationMs.fast >= 120 && d.pignolo.motion.durationMs.slower <= 220, 'movimiento calmo de 120 a 220 ms');
  assert.ok(d.pignolo.targets.minPx >= 44, 'objetivos táctiles de 44px o más');
  assert.ok(/system|apple|segoe/i.test(d.typography['body-md'].fontFamily), 'tipografía del sistema');
  assert.ok(!/inter\b/i.test(d.typography['body-md'].fontFamily));
  const accents = Object.keys(d.colors).filter((k) => /^(azure|blue|green|red|orange|purple|pink|teal|yellow)-/.test(k)).map((k) => k.split('-')[0]);
  assert.deepStrictEqual([...new Set(accents)].sort(), ['azure', 'red'], 'azul como único acento (el rojo es solo el de error)');
  assert.ok(/one primary action per view/i.test(text));
});

// ---------------------------------------------------------------- run

test('run (ui): el pedido es el prefijo del brazo más el texto del escenario, sin título ni instrucciones; un brazo sin plugin no lleva prefijo', async () => {
  const env = setup();
  try {
    const p = await runOne(env, 'P');
    const sentP = readJson(path.join(env.root, 'stub-P-1.json'));
    assert.strictEqual(sentP.stdin, `/pignolo:ui ${SCENARIO_TEXT}`);
    assert.ok(!/title|Registrar/.test(sentP.stdin));
    assert.ok(sentP.argv.includes('--plugin-dir'));
    assert.strictEqual(path.basename(path.dirname(sentP.cwd)), 'ui-expense-P-1');
    assert.strictEqual(p.m.isUi, true);
    assert.strictEqual(p.m.scenario, 'expense');
    assert.strictEqual(p.m.scenarioSha, sha(SCENARIO_TEXT));
    assert.strictEqual(p.m.promptSha, sha(`/pignolo:ui ${SCENARIO_TEXT}`));
    assert.strictEqual(p.m.promptPrefix, '/pignolo:ui ');
    assert.strictEqual(p.m.activationVia, 'slash_command', 'la invocación forzada se cuenta como activación');
    assert.deepStrictEqual(p.m.invalidReasons, []);
    assert.deepStrictEqual(p.m.nm, { checked: false }, 'una tarea ui no mira node_modules');
    const n = await runOne(env, 'N');
    assert.strictEqual(readJson(path.join(env.root, 'stub-N-1.json')).stdin, SCENARIO_TEXT);
    assert.ok(!readJson(path.join(env.root, 'stub-N-1.json')).argv.includes('--plugin-dir'));
    assert.strictEqual(n.m.promptPrefix, '');
  } finally { cleanup(env); }
});

test('run (ui): si el agente no deja nada, la corrida es inválida por no_changes', async () => {
  const env = setup();
  try {
    const { m } = await runOne(env, 'N', { mode: 'none' });
    assert.ok(m.invalidReasons.includes('no_changes'));
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- pantallas

test('findScreens: design/screens/<slug>/index.html con cualquier slug; si no hay, cualquier html salvo components/ e index.html (y dice qué regla)', async () => {
  const { findScreens } = await imp('ui.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-ui-screens-'));
  try {
    assert.deepStrictEqual(findScreens(tmp), { rule: 'none', screens: [], truncated: 0 });
    put(tmp, 'design/index.html', '<h1>index</h1>');
    put(tmp, 'design/components/button.html', '<h1>c</h1>');
    put(tmp, 'design/notas.md', 'x');
    assert.strictEqual(findScreens(tmp).rule, 'none', 'index.html y components/ no son pantallas');
    put(tmp, 'design/flow/home.html', '<h1>h</h1>');
    put(tmp, 'design/settings.html', '<h1>s</h1>');
    const fb = findScreens(tmp);
    assert.strictEqual(fb.rule, 'html-fallback');
    assert.deepStrictEqual(fb.screens.map((s) => s.rel), ['design/flow/home.html', 'design/settings.html']);
    assert.deepStrictEqual(fb.screens.map((s) => s.slug), ['flow-home', 'settings']);
    put(tmp, 'design/screens/Mi pantalla!/index.html', '<h1>1</h1>');
    put(tmp, 'design/screens/vacia/otra.html', '<h1>no es index</h1>');
    const main = findScreens(tmp);
    assert.strictEqual(main.rule, 'screens-dir', 'la regla principal gana a la de respaldo');
    assert.deepStrictEqual(main.screens, [{ slug: 'Mi_pantalla', rel: 'design/screens/Mi pantalla!/index.html' }]);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- uiscore

test('uiscore: renderiza a 1280 y 390, corre el ui-check existente, fuerza hover y foco por el protocolo y escribe las medidas; metrics.json queda intacto', async () => {
  const env = setup();
  try {
    const { cfg, m } = await runOne(env, 'P');
    const dir = runDir(env, 'P');
    const before = sha(read(path.join(dir, 'metrics.json')));
    const fb = fakeBrowserModule();
    const { acceptRun } = await imp('accept.mjs');
    const res = await acceptRun(cfg, { task: TASK, arm: 'P', rep: 1 }, fb.deps);
    assert.strictEqual(sha(read(path.join(dir, 'metrics.json'))), before, 'metrics.json no se toca');
    assert.ok(fs.existsSync(path.join(dir, 'changes.json')), 'accept deja también el resumen de cambios');
    assert.strictEqual(res.screensRule, 'screens-dir');
    assert.strictEqual(res.browser.status, 'ok');
    assert.strictEqual(res.browser.product, 'FakeChrome/1.0');
    assert.deepStrictEqual(res.screens.map((s) => s.slug), ['expense']);
    // capturas
    assert.deepStrictEqual(res.screens[0].shots, [{ width: 1280, file: 'shots/expense-1280.png' }, { width: 390, file: 'shots/expense-390.png' }]);
    for (const f of ['expense-1280.png', 'expense-390.png']) assert.ok(fs.existsSync(path.join(dir, 'shots', f)), f);
    const viewports = fb.calls.filter((c) => c.method === 'viewport').map((c) => c.params);
    assert.deepStrictEqual(viewports.map((v) => v.width), [1280, 390]);
    // estados forzados por el protocolo, sobre la sesión de la pestaña
    const forced = fb.calls.filter((c) => c.method === 'CSS.forcePseudoState').map((c) => c.params.forcedPseudoClasses.join('+'));
    assert.deepStrictEqual(forced, ['hover', 'focus+focus-visible', '', 'hover', 'focus+focus-visible', '', 'hover', 'focus+focus-visible', '']);
    assert.ok(fb.calls.some((c) => c.method === 'DOM.getDocument' && c.sessionId === 'session-1'));
    assert.ok(fb.calls.some((c) => c.method === 'close'), 'el navegador se cierra');
    // medidas
    const ms = res.screens[0].measures;
    assert.strictEqual(ms.native_widgets, 2);
    assert.strictEqual(ms.interactive, 3);
    assert.strictEqual(ms.hover_style, 1);
    assert.strictEqual(ms.focus_style, 2);
    assert.strictEqual(ms.states_ok, 1, 'hover y foco a la vez');
    assert.strictEqual(ms.primary_buttons, 2);
    assert.strictEqual(ms.single_main_action, false);
    assert.strictEqual(ms.font_sizes, 3);
    assert.strictEqual(ms.font_weights, 2);
    assert.strictEqual(ms.size_ratio, 2.67);
    assert.strictEqual(ms.controls_above_fold, 3);
    assert.strictEqual(ms.min_target_px_390, 30);
    assert.strictEqual(ms.targets_below_44_390, 2);
    assert.strictEqual(ms.off_token_colors, 1);
    assert.deepStrictEqual(ms.content_states, { empty: 'found', loading: 'not found', error: 'not found' });
    assert.strictEqual(ms.has_heading, true);
    // ui-check real sobre el archivo de la pantalla, con el design.md del sandbox
    const check = readJson(path.join(dir, 'ui_check.json'));
    assert.deepStrictEqual(check.files, ['design/screens/expense/index.html']);
    assert.strictEqual(check.designSource, 'base');
    assert.ok(check.entries.length > 0);
    assert.strictEqual(check.findings, check.entries.filter((e) => e.status === 'fail').length);
    assert.ok(!fs.existsSync(path.join(dir, 'ui-check-project')), 'el proyecto temporal se borra');
    assert.ok(!fs.existsSync(path.join(dir, 'repo', '.pignolo-ui')), 'nada se escribe en el árbol del agente');
    // columnas
    const cols = res.columns;
    assert.deepStrictEqual(Object.keys(cols), ['ui_screens', 'ui_native_widgets', 'ui_interactive', 'ui_states_ok', 'ui_primary_buttons', 'ui_font_sizes', 'ui_check_findings', 'ui_not_verified']);
    assert.deepStrictEqual({ ...cols, ui_check_findings: 'n' }, { ui_screens: 1, ui_native_widgets: 2, ui_interactive: 3, ui_states_ok: 1, ui_primary_buttons: 2, ui_font_sizes: 3, ui_check_findings: 'n', ui_not_verified: '' });
    assert.strictEqual(typeof cols.ui_check_findings, 'number');
    assert.deepStrictEqual(readJson(path.join(dir, 'ui_measures.json')).columns, cols);
    assert.ok(m.finishedAt);
  } finally { cleanup(env); }
});

test('uiscore: sin acceso al protocolo, hover y foco quedan not_verified (y su celda vacía), nunca cero; lo demás se mide', async () => {
  const env = setup();
  try {
    const { cfg } = await runOne(env, 'N');
    const fb = fakeBrowserModule({ cdpFails: true });
    const { uiScoreStep } = await imp('accept.mjs');
    const res = await uiScoreStep(cfg, { task: TASK, arm: 'N', rep: 1 }, fb.deps);
    const ms = res.screens[0].measures;
    assert.strictEqual(ms.hover_style, 'not_verified');
    assert.strictEqual(ms.focus_style, 'not_verified');
    assert.strictEqual(ms.states_ok, 'not_verified');
    assert.match(res.screens[0].notVerified.hover_style, /CSS agent is not available/);
    assert.strictEqual(ms.native_widgets, 2, 'las otras medidas siguen');
    assert.strictEqual(res.columns.ui_states_ok, null);
    assert.strictEqual(res.columns.ui_native_widgets, 2);
    assert.match(res.columns.ui_not_verified, /hover_style/);
    assert.match(res.columns.ui_not_verified, /states_ok/);
  } finally { cleanup(env); }
});

test('uiscore: con PIGNOLO_UI_BROWSER sin definir (y sin navegador instalado a la vista) registra browser_missing y no inventa medidas', async () => {
  const env = setup();
  try {
    const { cfg } = await runOne(env, 'N');
    const { uiScoreStep } = await imp('accept.mjs');
    // env vacío: ni PIGNOLO_UI_BROWSER, ni ProgramFiles, ni PATH: ningún navegador a la vista, en cualquier máquina.
    const res = await withEnv({ PIGNOLO_UI_BROWSER: undefined }, () => uiScoreStep(cfg, { task: TASK, arm: 'N', rep: 1 }, { env: {} }));
    assert.strictEqual(res.browser.status, 'browser_missing');
    assert.match(res.browser.reason, /no Chrome or Edge found/);
    assert.strictEqual(res.screens.length, 1, 'las pantallas se encuentran igual');
    assert.strictEqual(res.screens[0].measures, null, 'sin navegador no hay medidas del navegador');
    assert.deepStrictEqual(res.screens[0].shots, []);
    const dir = runDir(env, 'N');
    assert.ok(!fs.existsSync(path.join(dir, 'shots')));
    assert.ok(fs.existsSync(path.join(dir, 'ui_check.json')), 'ui-check no necesita navegador');
    assert.strictEqual(res.columns.ui_screens, 1);
    for (const c of ['ui_native_widgets', 'ui_interactive', 'ui_states_ok', 'ui_primary_buttons', 'ui_font_sizes']) assert.strictEqual(res.columns[c], null, c);
    assert.strictEqual(typeof res.columns.ui_check_findings, 'number');
    assert.strictEqual(res.columns.ui_not_verified, 'browser_missing');
    // un PIGNOLO_UI_BROWSER que apunta a un archivo inexistente tampoco se reemplaza por otro navegador
    const res2 = await uiScoreStep(cfg, { task: TASK, arm: 'N', rep: 1 }, { env: { PIGNOLO_UI_BROWSER: path.join(env.root, 'no-existe.exe') } });
    assert.strictEqual(res2.browser.status, 'browser_missing');
    assert.match(res2.browser.reason, /points to a missing file/);
    // y la celda del CSV queda vacía, no en cero
    const { appendRow, parseCsv } = await imp('row.mjs');
    appendRow(cfg, { task: TASK, arm: 'N', rep: 1 });
    const [row] = parseCsv(read(cfg.csvPath));
    assert.strictEqual(row.ui_screens, '1');
    assert.strictEqual(row.ui_native_widgets, '');
    assert.strictEqual(row.ui_states_ok, '');
    assert.strictEqual(row.ui_not_verified, 'browser_missing');
  } finally { cleanup(env); }
});

test('uiscore: un navegador que no arranca queda como browser_failed con su motivo', async () => {
  const env = setup();
  try {
    const { cfg } = await runOne(env, 'N');
    const { uiScoreStep } = await imp('accept.mjs');
    const res = await uiScoreStep(cfg, { task: TASK, arm: 'N', rep: 1 }, {
      findBrowser: () => ({ path: '/fake/chrome', source: 'env' }),
      openBrowser: async () => { throw new Error('the browser did not answer over the pipe'); },
    });
    assert.strictEqual(res.browser.status, 'browser_failed');
    assert.match(res.browser.reason, /did not answer/);
    assert.strictEqual(res.columns.ui_not_verified, 'browser_failed');
    assert.strictEqual(res.columns.ui_native_widgets, null);
  } finally { cleanup(env); }
});

test('uiscore: usa la regla de respaldo cuando no hay design/screens, y sin pantallas deja no_screens (nada medido, nada en cero)', async () => {
  const env = setup();
  try {
    const { cfg } = await runOne(env, 'N', { mode: 'fallback' });
    const { uiScoreStep } = await imp('accept.mjs');
    const fb = fakeBrowserModule();
    const res = await uiScoreStep(cfg, { task: TASK, arm: 'N', rep: 1 }, fb.deps);
    assert.strictEqual(res.screensRule, 'html-fallback');
    assert.deepStrictEqual(res.screens.map((s) => s.file), ['design/expense.html']);
    const none = await runOne(env, 'P', { mode: 'none' });
    const r2 = await uiScoreStep(none.cfg, { task: TASK, arm: 'P', rep: 1 }, fb.deps);
    assert.strictEqual(r2.screensRule, 'none');
    assert.strictEqual(r2.browser.status, 'not_needed');
    assert.strictEqual(r2.columns.ui_screens, 0);
    assert.strictEqual(r2.columns.ui_native_widgets, null);
    assert.strictEqual(r2.columns.ui_not_verified, 'no_screens');
  } finally { cleanup(env); }
});

test('row: una corrida ui lleva las columnas ui_* al final del CSV y el CSV viejo se migra por nombre', async () => {
  const env = setup();
  try {
    const { cfg } = await runOne(env, 'P');
    const { acceptRun } = await imp('accept.mjs');
    await acceptRun(cfg, { task: TASK, arm: 'P', rep: 1 }, fakeBrowserModule().deps);
    const { appendRow, parseCsv, COLUMNS } = await imp('row.mjs');
    assert.deepStrictEqual(COLUMNS.slice(-8), ['ui_screens', 'ui_native_widgets', 'ui_interactive', 'ui_states_ok', 'ui_primary_buttons', 'ui_font_sizes', 'ui_check_findings', 'ui_not_verified']);
    const old = COLUMNS.slice(0, -8);
    fs.writeFileSync(cfg.csvPath, `${old.join(',')}\n${old.map((c) => (c === 'experiment' ? 'toy-exp' : c === 'task' ? 'viejo' : c === 'arm' ? 'N' : c === 'rep' ? '1' : '')).join(',')}\n`);
    const row = appendRow(cfg, { task: TASK, arm: 'P', rep: 1 });
    const rows = parseCsv(read(cfg.csvPath));
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].ui_screens, '', 'la fila vieja queda con las celdas nuevas vacías');
    assert.strictEqual(rows[1].ui_screens, '1');
    assert.strictEqual(rows[1].ui_native_widgets, '2');
    assert.strictEqual(rows[1].ui_states_ok, '1');
    assert.strictEqual(rows[1].ui_primary_buttons, '2');
    assert.strictEqual(rows[1].prompt_prefix_id, 'P');
    assert.strictEqual(rows[1].invalid, 'false');
    assert.ok(row.accept_exit == null, 'no hay tests ocultos');
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- freeze

test('freeze: hashea el escenario, la identidad, el código que puntúa y el uiPrefix de cada brazo', async () => {
  const env = setup({}, { set: 'validation' });
  try {
    const cfg = await load(env);
    const fz = await imp('freeze.mjs');
    const prereg = git(env.src, 'rev-parse', 'HEAD');
    const out = fz.freeze(cfg, { prereg });
    const saved = readJson(out.file);
    const t = saved.body.tasks[TASK];
    assert.strictEqual(t.kind, 'ui');
    assert.strictEqual(t.baseCommit, null);
    assert.strictEqual(t.files['scenario/expense.md'], sha(read(path.join(env.priv, 'ui', 'expense.md'))));
    assert.strictEqual(t.files['ui-identity/design.md'], sha(read(FIXTURE_DESIGN)));
    assert.strictEqual(saved.body.arms.P.uiPrefixSha, sha('/pignolo:ui '));
    assert.strictEqual(saved.body.arms.N.uiPrefixSha, undefined, 'sin prefijo no se anota (el freeze viejo conserva su hash)');
    assert.match(saved.body.uiScoringSha, /^[0-9a-f]{64}$/);
    assert.strictEqual(fz.uiScoringSha(), saved.body.uiScoringSha);
    assert.deepStrictEqual(fz.UI_SCORING_FILES, ['ui.mjs', 'uimeasure.mjs', 'uiscore.mjs', 'uipack.mjs']);
    assert.strictEqual(fz.verifyFreeze(cfg).ok, true);
    // cambiar el texto del autor
    const file = path.join(env.priv, 'ui', 'expense.md');
    const original = read(file);
    fs.writeFileSync(file, `${original}One more sentence.\n`);
    let v = fz.verifyFreeze(cfg);
    assert.strictEqual(v.ok, false);
    assert.ok(v.problems.some((p) => /cambió scenario\/expense\.md/.test(p)), v.problems.join('|'));
    fs.writeFileSync(file, original);
    assert.strictEqual(fz.verifyFreeze(cfg).ok, true);
    // cambiar el uiPrefix de un brazo
    const cfg2 = { ...cfg, arms: { ...cfg.arms, P: { ...cfg.arms.P, uiPrefix: '/pignolo:ui\n' } } };
    v = fz.verifyFreeze(cfg2);
    assert.strictEqual(v.ok, false);
    assert.ok(v.changedCategories.includes('uiPrefix'), v.changedCategories.join());
    // un brazo que gana un prefijo
    const cfg3 = { ...cfg, arms: { ...cfg.arms, N: { ...cfg.arms.N, uiPrefix: 'x' } } };
    assert.ok(fz.verifyFreeze(cfg3).changedCategories.includes('uiPrefix'));
    // run de una tarea de validación sin freeze válido se niega antes de gastar
    const { prepare } = await imp('prepare.mjs');
    const { runTask } = await imp('execute.mjs');
    await prepare(cfg2, { task: TASK, arm: 'N', rep: 1 });
    await assert.rejects(() => runTask(cfg2, { task: TASK, arm: 'N', rep: 1 }), /freeze/);
  } finally { cleanup(env); }
});

test('freeze: sin tareas ui de validación el cuerpo no cambia (sin uiScoringSha ni uiPrefixSha)', async () => {
  const env = setup({ tasks: { 'ui-expense': { kind: 'ui', scenario: 'expense', set: 'dev' }, other: { kind: 'ui', scenario: 'expense', set: 'validation' } } });
  try {
    // con una ui de validación sí está; el caso sin ninguna se prueba con una tarea de otro tipo
    const cfg = await load(env);
    const fz = await imp('freeze.mjs');
    assert.ok(fz.computeBody(cfg, 'abc').body.uiScoringSha);
    const plain = { ...cfg, tasks: { f: { kind: 'fixture', fixture: 'cli-script', prompt: 'Validate.', set: 'validation', arms: ['N'] } }, arms: { ...cfg.arms, P: { ...cfg.arms.P, uiPrefix: '' } } };
    const body = fz.computeBody(plain, 'abc').body;
    assert.strictEqual(body.uiScoringSha, undefined);
    assert.ok(!('uiPrefixSha' in body.arms.P));
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- calendario, batch y resumen

test('schedule y batch --dry-run aceptan tareas ui: muestran el escenario, el hash del pedido y el prefijo, nunca el texto', async () => {
  const env = setup({ tasks: { 'ui-expense': { kind: 'ui', scenario: 'expense', set: 'dev' } } });
  try {
    const cfg = await load(env);
    const { buildSchedule, writeSchedule } = await imp('schedule.mjs');
    const { runBatch } = await imp('batch.mjs');
    const sch = buildSchedule(cfg, { tasks: [TASK], arms: ['N', 'P'], seed: 3, reps: 2 });
    assert.strictEqual(sch.entries.length, 4);
    const file = writeSchedule(cfg, sch);
    const lines = [];
    const res = await runBatch(cfg, { schedule: file, dryRun: true }, { log: (l) => lines.push(l) });
    const text = lines.join('\n');
    assert.match(text, /interfaz: escenario expense, pedido sha256 [0-9a-f]{12}, prefijo "\/pignolo:ui "/);
    assert.match(text, /prefijo ninguno/);
    assert.ok(!text.includes('monthly expense'), 'el texto del autor no se imprime');
    assert.ok(text.includes(sha(`/pignolo:ui ${SCENARIO_TEXT}`).slice(0, 12)));
    assert.ok(text.includes(sha(SCENARIO_TEXT).slice(0, 12)));
    assert.strictEqual(res.entries[0].ui.scenario, 'expense');
    assert.match(text, /chequeos previos \(plugins, configDir, freeze\): bien/);
    // un escenario que falta aparece en los chequeos previos
    fs.rmSync(path.join(env.priv, 'ui', 'expense.md'));
    const lines2 = [];
    await runBatch(cfg, { schedule: file, dryRun: true }, { log: (l) => lines2.push(l) });
    assert.match(lines2.join('\n'), /chequeos previos con problemas:.*tarea de interfaz ui-expense/);
  } finally { cleanup(env); }
});

test('batch (ui) de punta a punta con el stub: prepare, run, accept (puntaje de pantallas) y row; el resumen es descriptivo', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    const { buildSchedule, writeSchedule } = await imp('schedule.mjs');
    const { runBatch } = await imp('batch.mjs');
    const { parseCsv } = await imp('row.mjs');
    const { summarize, formatSummary, rowsFromCsv } = await imp('summary.mjs');
    const file = writeSchedule(cfg, buildSchedule(cfg, { tasks: [TASK], arms: ['N', 'P'], seed: 3 }));
    const lines = [];
    // PIGNOLO_UI_BROWSER apunta a un archivo inexistente: el puntaje no abre ningún navegador de esta máquina.
    await withEnv({ FAKE_UI_MODE: 'screens', FAKE_UI_HTML: env.html, PIGNOLO_UI_BROWSER: path.join(env.root, 'no-existe.exe') },
      () => runBatch(cfg, { schedule: file }, { log: (l) => lines.push(l) }));
    assert.strictEqual(lines.length, 2);
    for (const l of lines) {
      assert.match(l, /interfaz pantallas 1, nativos sin dato, interactivos sin dato, hallazgos de ui-check \d+, sin verificar: browser_missing/);
      assert.match(l, /válida$/);
    }
    const rows = parseCsv(read(cfg.csvPath));
    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(rows.map((r) => r.ui_screens), ['1', '1']);
    assert.ok(fs.existsSync(path.join(runDir(env, 'N'), 'ui_measures.json')));
    // volver a lanzar salta lo ya registrado
    const again = [];
    await withEnv({ PIGNOLO_UI_BROWSER: path.join(env.root, 'no-existe.exe') }, () => runBatch(cfg, { schedule: file }, { log: (l) => again.push(l) }));
    assert.ok(again.every((l) => /ya registrada/.test(l)));
    // resumen
    const res = summarize(rowsFromCsv(read(cfg.csvPath)), { kinds: { [TASK]: 'ui' }, experiment: 'toy-exp', pairs: [['N', 'P']] });
    assert.strictEqual(res.tasks.length, 1);
    assert.strictEqual(res.tasks[0].kind, 'ui');
    assert.match(res.tasks[0].decision.verdict, /descriptivo/);
    const textOut = formatSummary(res);
    assert.match(textOut, /interfaz: 1 corridas medidas/);
    assert.match(textOut, /sin verificar: browser_missing/);
    assert.ok(!/aceptación:/.test(textOut), 'una tarea ui no tiene aceptación');
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- uipack

async function twoScoredRuns(env, { seed } = {}) {
  const arms = ['N', 'P'];
  let cfg = null;
  for (const arm of arms) {
    const r = await runOne(env, arm);
    cfg = r.cfg;
    const { acceptRun } = await imp('accept.mjs');
    await acceptRun(cfg, { task: TASK, arm, rep: 1 }, fakeBrowserModule().deps);
  }
  if (seed !== undefined) cfg = { ...cfg, seed };
  return cfg;
}
const listFiles = (dir) => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath || e.path, e.name)).split(path.sep).join('/')).sort();

test('uipack: etiquetas neutras mezcladas con la semilla, la clave fuera del paquete, sin rastros del brazo en el HTML y con aviso de lo que encontró', async () => {
  const env = setup();
  try {
    const cfg = await twoScoredRuns(env);
    const { uiPack, uiPackDir, uiPackKeyFile } = await imp('uipack.mjs');
    const res = uiPack(cfg, { scenario: 'expense', reps: [1] });
    const pack = uiPackDir(cfg, 'expense');
    assert.strictEqual(res.packDir, pack);
    assert.deepStrictEqual(res.labels, ['A', 'B']);
    assert.strictEqual(path.dirname(path.dirname(uiPackKeyFile(cfg, 'expense'))), cfg.privateRoot);
    assert.ok(!uiPackKeyFile(cfg, 'expense').startsWith(pack), 'la clave está fuera del paquete');
    // la estructura y pack.json
    const index = readJson(path.join(pack, 'pack.json'));
    assert.deepStrictEqual(Object.keys(index).sort(), ['options', 'scenario', 'version']);
    assert.deepStrictEqual(index.options.map((o) => o.label), ['A', 'B']);
    for (const o of index.options) {
      assert.deepStrictEqual(Object.keys(o).sort(), ['label', 'screens']);
      assert.strictEqual(o.screens.length, 1);
      const s = o.screens[0];
      assert.deepStrictEqual(Object.keys(s).sort(), ['html', 'id', 'shots']);
      assert.strictEqual(s.id, 'screen-1');
      assert.strictEqual(s.html, `${o.label}/screens/screen-1/index.html`);
      assert.deepStrictEqual(s.shots.map((x) => x.width), [1280, 390]);
      for (const f of [s.html, ...s.shots.map((x) => x.file)]) assert.ok(fs.existsSync(path.join(pack, f)), f);
    }
    assert.deepStrictEqual(listFiles(pack), [
      'A/screens/screen-1/index.html', 'A/shots/screen-1-1280.png', 'A/shots/screen-1-390.png',
      'B/screens/screen-1/index.html', 'B/shots/screen-1-1280.png', 'B/shots/screen-1-390.png', 'pack.json',
    ]);
    // nada que nombre al brazo ni al plugin, ni en pack.json ni en los archivos
    for (const f of listFiles(pack).filter((x) => /\.(json|html)$/.test(x))) {
      const t = read(path.join(pack, f));
      assert.ok(!/pignolo|superpowers|\.pignolo|generator|<!--/i.test(t), `${f} conserva rastros: ${t.slice(0, 200)}`);
    }
    const html = read(path.join(pack, 'A', 'screens', 'screen-1', 'index.html'));
    assert.ok(html.includes('<h1>New expense</h1>'), 'el contenido de la pantalla se conserva');
    assert.ok(html.includes('.btn:hover'), 'y sus estilos');
    // lo que encontró y limpió se informa
    assert.strictEqual(res.leaksFound, true);
    const types = new Set(res.leaks.map((l) => l.type));
    for (const ty of ['comment', 'meta-generator', 'css-comment', 'text']) assert.ok(types.has(ty), `falta el aviso ${ty}: ${[...types].join()}`);
    assert.ok(res.leaks.every((l) => ['A', 'B'].includes(l.label) && l.screen === 'screen-1'));
    // la referencia relativa que sale de la carpeta de la pantalla se avisa
    assert.ok(res.externalRefs.some((r) => /\.\.\/\.\.\/\.\.\//.test(r.ref)));
    // la clave
    const key = readJson(uiPackKeyFile(cfg, 'expense'));
    assert.deepStrictEqual(Object.keys(key.labels).sort(), ['A', 'B']);
    assert.deepStrictEqual(Object.values(key.labels).map((l) => l.arm).sort(), ['N', 'P']);
    assert.deepStrictEqual(Object.values(key.labels).map((l) => `${l.task}/${l.rep}`), [`${TASK}/1`, `${TASK}/1`]);
    assert.strictEqual(key.labels.A.screens['screen-1'], 'expense');
    assert.strictEqual(key.leaks.length, res.leaks.length);
    // no se pisa sin --force
    assert.throws(() => uiPack(cfg, { scenario: 'expense', reps: [1] }), /usá --force/);
    uiPack(cfg, { scenario: 'expense', reps: [1], force: true });
  } finally { cleanup(env); }
});

test('uipack: el mismo seed da el mismo orden y el orden sale del seed; --arms limita; las corridas inválidas o sin puntuar se saltean y se dicen', async () => {
  const env = setup();
  try {
    const cfg = await twoScoredRuns(env);
    const { uiPack, uiPackKeyFile } = await imp('uipack.mjs');
    const mapping = (c, force) => { uiPack(c, { scenario: 'expense', reps: [1], force }); return Object.fromEntries(Object.entries(readJson(uiPackKeyFile(c, 'expense')).labels).map(([l, v]) => [l, v.arm])); };
    const first = mapping(cfg, false);
    assert.deepStrictEqual(mapping(cfg, true), first, 'reproducible');
    const orders = new Set();
    for (let seed = 1; seed <= 12; seed += 1) orders.add(JSON.stringify(mapping({ ...cfg, seed }, true)));
    assert.strictEqual(orders.size, 2, 'con semillas distintas salen los dos órdenes posibles');
    // solo un brazo
    const one = uiPack(cfg, { scenario: 'expense', reps: [1], arms: ['P'], force: true });
    assert.deepStrictEqual(one.labels, ['A']);
    // una corrida inválida se saltea y se informa
    const mp = path.join(runDir(env, 'N'), 'metrics.json');
    const m = readJson(mp);
    fs.writeFileSync(mp, JSON.stringify({ ...m, invalidReasons: ['crash'] }));
    const skipped = uiPack(cfg, { scenario: 'expense', reps: [1], force: true });
    assert.deepStrictEqual(skipped.labels, ['A']);
    assert.deepStrictEqual(skipped.skipped, [{ run: `${TASK}/N/1`, reason: 'inválida: crash' }]);
    // repetición sin corridas, escenario desconocido
    assert.throws(() => uiPack(cfg, { scenario: 'expense', reps: [5], force: true }), /no hay corridas/);
    assert.throws(() => uiPack(cfg, { scenario: 'otro' }), /ninguna tarea/);
  } finally { cleanup(env); }
});

test('sanitizeText: quita comentarios y meta generator, y reemplaza cualquier mención restante del plugin', async () => {
  const { sanitizeText, leakTerms } = await imp('uipack.mjs');
  const terms = leakTerms({ arms: { P: { pluginName: 'pignolo' }, S: { pluginName: 'superpowers' }, N: { pluginName: null } }, blindLeakTerms: ['brief-step'] });
  assert.ok(terms.includes('.pignolo') && terms.includes('superpowers') && terms.includes('brief-step'));
  const r = sanitizeText('<!-- Pignolo made this --><meta name="generator" content="x"><p class="pignolo-card">hi</p><img src=".pignolo/a.png"><style>/* keep */ a{color:red} /* superpowers note */</style>', terms);
  assert.ok(!/pignolo|superpowers|<!--|generator|note/i.test(r.text), r.text);
  assert.ok(r.text.includes('/* keep */'), 'un comentario de CSS sin el nombre se deja');
  assert.ok(r.text.includes('class="redacted-card"'), 'el reemplazo sigue siendo un nombre de clase válido');
  assert.deepStrictEqual(r.found.map((f) => f.type).sort(), ['comment', 'css-comment', 'meta-generator', 'text', 'text']);
  assert.deepStrictEqual(sanitizeText('<p>clean</p>', terms), { text: '<p>clean</p>', found: [] });
});

// ---------------------------------------------------------------- navegador real (si lo hay)

test('medidas con un navegador real: widgets nativos, estados forzados por el protocolo, botón principal y tamaños (se saltea sin navegador)', async (t) => {
  const { findBrowser } = await impLib('browser-find.mjs');
  const found = findBrowser();
  if (!found.path) { t.skip(`sin navegador: ${found.reason}`); return; }
  const { openBrowser } = await impLib('browser-session.mjs');
  const { measureScreen, designColorTokens } = await imp('uimeasure.mjs');
  const { splitFrontmatter } = await impLib('design-doc.mjs');
  const { parseYaml } = await impLib('yaml-subset.mjs');
  const { parseColor } = await impLib('color.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-ui-real-'));
  let browser = null;
  try {
    const page = `<!doctype html><html><head><meta charset="utf-8"><title>t</title><style>
body{margin:0;font-family:system-ui;background:#fff;color:#1D1D1F}
h1{font-size:32px;font-weight:600} p{font-size:17px} small{font-size:12px}
.btn{background:#0A6CD8;color:#fff;border:0;border-radius:12px;height:44px;padding:0 16px;transition:background .2s}
.btn:hover{background:#0A5EBB}
.btn2{background:#0A6CD8;color:#fff;border:0;height:30px}
a.link{color:#0A6CD8} select{height:30px}
input.nofocus{outline:none;border:1px solid #8E8E93;height:44px}
.ghost{background:transparent;border:1px solid #ff00aa;height:44px}
</style></head><body><main><h1>Title</h1><p>Body <a class="link" href="#">inline link</a> here.</p><small>small</small>
<div><button class="btn">Save</button> <button class="btn2">Other</button> <button class="ghost">Ghost</button>
<select><option>a</option></select> <input type="date"> <input class="nofocus" type="text"></div>
<div class="empty-state">No items yet</div><div class="skeleton"></div></main></body></html>`;
    fs.writeFileSync(path.join(tmp, 'screen.html'), page);
    const toks = designColorTokens(read(FIXTURE_DESIGN), { splitFrontmatter, parseYaml, parseColor });
    assert.ok(toks.tokens.length >= 10, 'los tokens de color del design.md se leen');
    try { browser = await openBrowser({ executable: found.path }); } catch (e) { t.skip(`el navegador no arrancó: ${e.message}`); return; }
    const tab = await browser.newPage();
    const r = await measureScreen({ browser, tab, url: pathToFileURL(path.join(tmp, 'screen.html')).href, slug: 's', shotsDir: path.join(tmp, 'shots'), tokens: toks.tokens });
    const m = r.measures;
    assert.deepStrictEqual(r.notVerified, {});
    assert.strictEqual(m.native_select, 1);
    assert.strictEqual(m.native_date_inputs, 1);
    assert.strictEqual(m.interactive, 7);
    assert.strictEqual(m.hover_style, 1, 'solo .btn tiene :hover');
    assert.strictEqual(m.focus_style, 6, 'todos menos el que apaga el contorno');
    assert.strictEqual(m.states_ok, 1);
    assert.strictEqual(m.buttons, 3);
    assert.strictEqual(m.primary_buttons, 2, 'dos botones comparten el relleno más prominente');
    assert.strictEqual(m.single_main_action, false);
    assert.strictEqual(m.has_heading, true);
    assert.ok(m.font_sizes >= 4 && m.size_ratio >= 2.6);
    assert.strictEqual(m.content_states.empty, 'found');
    assert.strictEqual(m.content_states.loading, 'found');
    assert.strictEqual(m.content_states.error, 'not found');
    assert.ok(m.off_token_colors >= 1, 'el borde #ff00aa no está en los tokens');
    assert.ok(m.min_target_px_390 < 44 && m.targets_below_44_390 >= 3);
    assert.deepStrictEqual(r.shots.map((s) => s.width), [1280, 390]);
    for (const s of r.shots) assert.ok(fs.statSync(path.join(tmp, 'shots', s.file)).size > 1000);
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
