'use strict';
// Confianza del mod (T5 y etapa 2): el mod solo lee y dibuja, más `prompt.suggest`/`prompt.fill`, un único `prompt.submit` (en
// `submitText`, al que llegan solo la respuesta de una decisión de "Te toca" y un atajo de la pestaña UI, cada uno desde un botón),
// `ui.copy` y una consulta a haiku (`model.complete`, solo al abrir la pestaña UI). Estático: no necesita Claude Code (salvo la lista
// de `calls:` de `claude plugin validate`, que se lee si `claude` existe; si no, se deduce del código y se dice).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PANEL = path.join(__dirname, '..', 'plugins', 'pignolo-panel');
const read = (p) => fs.readFileSync(p, 'utf8');
const hooksDir = path.join(PANEL, 'hooks');
const modFiles = () => fs.readdirSync(hooksDir).filter((f) => f.endsWith('.js')).map((f) => path.join(hooksDir, f));
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
const REGISTER = read(path.join(hooksDir, 'register.js'));

// Lo que el mod puede llamar (`$.<sustantivo>.<verbo>`). `ui.*` entra entero (dibujar, abrir, copiar, avisar).
const ALLOWED = new Set([
  'fs.read', 'fs.exists', 'fs.list', 'clock.now', 'clock.every', 'session.cwd', 'session.usage', 'plugin.root',
  'prompt.suggest', 'prompt.fill', 'prompt.submit',
  // pestaña UI (etapa 2): la consulta a haiku, la detección de pignolo-ui y la lectura de sus carpetas
  'model.complete', 'settings.read', 'command.list', 'fs.list',
  // el comando /pignolo-panel (sin él no hay forma de abrir el panel): se suma a la lista del plan
  'command.register',
]);
const allowed = (call) => call.startsWith('ui.') || ALLOWED.has(call);

test('trust: the mod sources never reference process, http, fetch, shell, spawn, tool.check, tool.approve or tool.deny', () => {
  const BAD = /\bprocess\b|\bhttps?\b|\bfetch\b|\bshell\b|(?<!agent\.)\bspawn\b|child_process|XMLHttpRequest|WebSocket|\bnet\.|\bdns\b|\beval\s*\(|new Function|require\s*\(|tool\.check|tool\.approve|tool\.deny|\$\.tool\b|\$\.agent\.|\$\.exec\b|\$\.fs\.(?:write|remove|mkdir|append)/;
  const files = modFiles();
  assert.ok(files.length >= 3);
  for (const f of files) assert.doesNotMatch(code(read(f)), BAD, path.basename(f));
});

test('trust: prompt.submit appears exactly once in the package, inside submitText', () => {
  const sites = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'tests') walk(p); } else if (/\.(js|mjs|ts|json)$/.test(e.name)) {
        const n = (code(read(p)).match(/prompt\.submit/g) || []).length;
        if (n) sites.push([path.relative(PANEL, p).replace(/\\/g, '/'), n]);
      }
    }
  };
  walk(PANEL);
  assert.deepStrictEqual(sites, [['hooks/register.js', 1]]);
  const start = REGISTER.indexOf('async function submitText(');
  const end = REGISTER.indexOf('\n}\n', start);
  assert.ok(start > 0 && end > start);
  assert.match(REGISTER.slice(start, end), /\$\.prompt\.submit\(/);
  assert.ok(!REGISTER.slice(0, start).includes('$.prompt.submit('));
  assert.ok(!REGISTER.slice(end).includes('$.prompt.submit('));
});

test('trust: submitAnswer is referenced only inside the press handler of a decision option button', () => {
  const c = code(REGISTER);
  const calls = [...c.matchAll(/submitAnswer\(/g)].map((m) => m.index);
  const decl = c.indexOf('async function submitAnswer(');
  const sites = calls.filter((i) => i !== decl + 'async function '.length);
  assert.strictEqual(sites.length, 1, 'una sola llamada');
  // la llamada está entre las marcas del manejador de pulsación del botón de una opción
  const open = REGISTER.indexOf('// <press-handler:answer>');
  const close = REGISTER.indexOf('// </press-handler:answer>');
  const callAt = REGISTER.indexOf('await submitAnswer(');
  assert.ok(open > 0 && close > open && callAt > open && callAt < close);
  const region = REGISTER.slice(open, close);
  assert.match(region, /function optionButton\(/);
  assert.match(region, /key: 'ans-' \+ d\.id/);
  assert.match(region, /onPress: async \(\) => \{/);
  // ... y esa región queda antes de register(): ni un evento, ni clock.every, ni prompt.suggest, ni el refresco, ni el siguiente paso
  assert.ok(close < REGISTER.indexOf('export function register('));
  for (const name of ['syncSuggest', 'checkNewDecisions', 'stepButtons', 'fillPrompt', 'readSnapshot', 'copySelected', 'otherButton', 'postponeFirst']) {
    const s = REGISTER.indexOf(`function ${name}(`);
    assert.ok(s > 0, name);
    const e = REGISTER.indexOf('\n}\n', s);
    assert.ok(!REGISTER.slice(s, e).includes('submitAnswer'), `${name} no envía`);
  }
  const reg = REGISTER.slice(REGISTER.indexOf('export function register('));
  assert.ok(!reg.includes('submitAnswer'), 'ningún evento ni temporizador envía');
});

// Funcion de nivel superior que contiene la posicion `at` de un texto (para saber desde donde se llama a algo).
function enclosing(text, at) {
  let name = null;
  for (const m of text.matchAll(/^(?:export )?(?:async )?function\s+(\w+)\(/gm)) if (m.index <= at) name = m[1];
  return name;
}
const sitesOf = (text, re) => [...code(text).matchAll(re)].map((m) => m.index);

test('trust: submitText is called only by submitAnswer and submitUiRequest', () => {
  const c = code(REGISTER);
  const callers = sitesOf(REGISTER, /submitText\(/g)
    .filter((i) => c.slice(i - 15, i) !== 'async function ')
    .map((i) => enclosing(c, i));
  assert.deepStrictEqual(callers.sort(), ['submitAnswer', 'submitUiRequest']);
});

test('trust: submitUiRequest is referenced only inside the press handler of a UI tab button', () => {
  const c = code(REGISTER);
  const decl = c.indexOf('async function submitUiRequest(');
  const sites = [...c.matchAll(/submitUiRequest\(/g)].map((m) => m.index).filter((i) => i !== decl + 'async function '.length);
  assert.strictEqual(sites.length, 1, 'una sola llamada');
  const open = REGISTER.indexOf('// <press-handler:ui>');
  const close = REGISTER.indexOf('// </press-handler:ui>');
  const callAt = REGISTER.indexOf('await submitUiRequest(');
  assert.ok(open > 0 && close > open && callAt > open && callAt < close);
  const region = REGISTER.slice(open, close);
  assert.match(region, /function uiButton\(/);
  assert.match(region, /onPress: async \(\) => \{/);
  assert.ok(close < REGISTER.indexOf('export function register('));
  const reg = REGISTER.slice(REGISTER.indexOf('export function register('));
  assert.ok(!reg.includes('submitUiRequest'), 'ningun evento ni temporizador envia');
  // nadie mas de la pestaña UI envia
  for (const name of ['enterUiTab', 'refreshUiDetect', 'readUiNow', 'uiBody', 'openPaneByUser', 'uiReader', 'uiRoot']) {
    const s = REGISTER.indexOf(`function ${name}(`);
    assert.ok(s > 0, name);
    assert.ok(!REGISTER.slice(s, REGISTER.indexOf('\n}\n', s)).includes('submitUiRequest'), `${name} no envia`);
  }
});

test('trust: model.complete appears only in register.js, inside enterUiTab, and the pure UI modules never touch $', () => {
  const sites = [];
  for (const f of modFiles()) for (const m of code(read(f)).matchAll(/model\.complete/g)) sites.push([path.basename(f), enclosing(code(read(f)), m.index)]);
  assert.deepStrictEqual(sites, [['register.js', 'enterUiTab']]);
  for (const name of ['ui-input.js', 'ui-rules.js', 'ui-prompt.js', 'ui-recs.js', 'ui-tab.js', 'ui-detect.js', 'ui-request.js']) {
    assert.doesNotMatch(code(read(path.join(hooksDir, name))), /\$\./, `${name} no usa $`);
  }
});

test('trust: ui-recs get is called only from the tab-open and tab-return handlers', () => {
  const c = code(REGISTER);
  const gets = [...c.matchAll(/recommender\.get\(/g)].map((m) => enclosing(c, m.index));
  assert.deepStrictEqual(gets, ['enterUiTab']);
  // enterUiTab: desde el boton de la pestaña (paneTree), la tecla r (uiBody) y abrir por una accion del usuario (openPaneByUser)
  const callers = [...c.matchAll(/enterUiTab\(/g)].map((m) => m.index).filter((i) => c.slice(i - 15, i) !== 'async function ').map((i) => enclosing(c, i));
  assert.deepStrictEqual(callers.sort(), ['openPaneByUser', 'paneTree', 'uiBody']);
  // desde paneTree (que dibuja) solo la pulsacion del boton de la pestaña, nunca el dibujo mismo
  const pane = REGISTER.slice(REGISTER.indexOf('async function paneTree('));
  const inPane = [...pane.slice(0, pane.indexOf('\n}\n')).matchAll(/enterUiTab\(/g)];
  assert.strictEqual(inPane.length, 1);
  assert.match(pane, /onPress: \(\) => \{ tab = id; redraw\(\); if \(id === 'ui'\) enterUiTab\(\$\) \}/);
  // y openPaneByUser lo llaman solo el comando y el boton de la banda: ni el refresco ni el abrir solo
  const opens = [...c.matchAll(/openPaneByUser\(/g)].map((m) => m.index).filter((i) => c.slice(i - 15, i) !== 'async function ');
  assert.deepStrictEqual(opens.map((i) => enclosing(c, i)).sort(), ['bandTree', 'register']);
  const reg = REGISTER.slice(REGISTER.indexOf('export function register('));
  const at = reg.indexOf('openPaneByUser(');
  const handlerStart = reg.lastIndexOf("\n  on('", at);
  assert.match(reg.slice(handlerStart, handlerStart + 40), /on\('command\.run'/);
  // ni un temporizador, un turno, un agente, la sesion, el dibujo o lo clasico llega a la consulta
  for (const name of ['checkNewDecisions', 'syncSuggest', 'readSnapshot', 'bandTree', 'nowBody', 'branchesBody', 'costBody', 'decisionsBlock', 'inProgressBlock', 'workingBlock']) {
    const s = REGISTER.indexOf(`function ${name}(`);
    assert.ok(s > 0, name);
    const body = REGISTER.slice(s, REGISTER.indexOf('\n}\n', s));
    assert.ok(!/enterUiTab|recommender/.test(body), `${name} no consulta`);
  }
  for (const handler of ["on('turn.start'", "on('agent.spawn'", "on('turn.step'", "on('turn.complete'", "on('classic.SubagentStop'", "on('prompt.suggest'"]) {
    const s = reg.indexOf(handler);
    assert.ok(s > 0, handler);
    const e = reg.indexOf("\n  on('", s + 5);
    assert.ok(!/enterUiTab|recommender|openPaneByUser/.test(reg.slice(s, e < 0 ? undefined : e)), `${handler} no consulta`);
  }
  const every = reg.slice(reg.indexOf('$.clock.every('));
  assert.ok(!/enterUiTab|recommender|openPaneByUser/.test(every.slice(0, every.indexOf('\n    }\n'))), 'el temporizador no consulta');
});

test('trust: model.fork, model.classify, tool.register, tool.call, process and http are never referenced', () => {
  for (const f of modFiles()) assert.doesNotMatch(code(read(f)), /model\.(?:fork|classify)|tool\.(?:register|call)|\bprocess\b|\bhttps?\b/, path.basename(f));
});

test('trust: the model call has no tools and no conversation: the options object only has model, system, prompt, maxTokens and timeoutMs', () => {
  const recs = code(read(path.join(hooksDir, 'ui-recs.js')));
  const m = /io\.complete\(\{([^}]*)\}\)/.exec(recs);
  assert.ok(m, 'una sola llamada a io.complete con un objeto literal');
  assert.deepStrictEqual(m[1].split(',').map((x) => x.trim().split(':')[0]).sort(), ['maxTokens', 'model', 'prompt', 'system', 'timeoutMs']);
  assert.strictEqual((recs.match(/io\.complete\(/g) || []).length, 1);
  // en register.js la consulta pasa tal cual lo que arma el recomendador
  assert.match(code(REGISTER), /complete: \(o\) => \$\.model\.complete\(o\)/);
});

function declaredCalls() {
  const claude = spawnSync('claude', ['plugin', 'validate', PANEL], { encoding: 'utf8', timeout: 120000, shell: process.platform === 'win32' });
  const m = claude.status === 0 && /calls:\s*(.+)/.exec(claude.stdout || '');
  if (m) return { source: 'claude plugin validate', calls: [...m[1].matchAll(/\$\.([a-z]+\.[A-Za-z]+)/g)].map((x) => x[1]) };
  // sin Claude Code: se deducen del código
  const found = new Set();
  for (const f of modFiles()) for (const x of code(read(f)).matchAll(/\$\.([a-z]+)\.([A-Za-z]+)/g)) found.add(`${x[1]}.${x[2]}`);
  return { source: 'deducida del código (claude no está disponible)', calls: [...found] };
}

test('trust: the declared calls list is a subset of the allowed list with model.complete, settings.read and command.list added', (t) => {
  const { source, calls } = declaredCalls();
  t.diagnostic(`lista de calls: ${source}`);
  assert.ok(calls.length >= 8, `calls: ${calls.join(', ')}`);
  const extra = calls.filter((c) => !allowed(c));
  assert.deepStrictEqual(extra, [], `llamadas fuera de la lista permitida (${source})`);
  for (const must of ['prompt.suggest', 'prompt.fill', 'prompt.submit', 'ui.copy', 'model.complete', 'settings.read', 'command.list']) assert.ok(calls.includes(must), must);
  for (const never of ['model.fork', 'model.classify']) assert.ok(!calls.includes(never), never);
  // y la deducción del código coincide en lo que importa
  const deduced = new Set();
  for (const f of modFiles()) for (const x of code(read(f)).matchAll(/\$\.([a-z]+)\.([A-Za-z]+)/g)) deduced.add(`${x[1]}.${x[2]}`);
  for (const c of deduced) assert.ok(allowed(c), `deducida: ${c}`);
});

test('trust: the package has no network access and no dependencies', () => {
  assert.ok(!fs.existsSync(path.join(PANEL, 'package.json')));
  assert.ok(!fs.existsSync(path.join(PANEL, 'node_modules')));
  const pj = JSON.parse(read(path.join(PANEL, '.claude-plugin', 'plugin.json')));
  assert.strictEqual(pj.dependencies, undefined);
  for (const f of modFiles()) {
    // los únicos imports son archivos del mismo paquete
    for (const m of read(f).matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)) assert.match(m[1], /^\.\//, `${path.basename(f)}: ${m[1]}`);
  }
});
