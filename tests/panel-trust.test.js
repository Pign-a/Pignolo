'use strict';
// Confianza del mod (T5, etapa 2 y etapa 3): el mod solo lee y dibuja, más `prompt.suggest`/`prompt.fill`, un único `prompt.submit` (en
// `submitText`, al que llegan solo la respuesta de una decisión de "Te toca", un atajo de la pestaña UI y las elecciones del asistente de
// inicio, cada uno desde un botón),
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

test('trust: submitText is called only by submitAnswer, submitUiRequest and submitWizard', () => {
  const c = code(REGISTER);
  const callers = sitesOf(REGISTER, /submitText\(/g)
    .filter((i) => c.slice(i - 15, i) !== 'async function ')
    .map((i) => enclosing(c, i));
  assert.deepStrictEqual(callers.sort(), ['submitAnswer', 'submitUiRequest', 'submitWizard']);
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

// ---- etapa 3: el asistente de inicio -----------------------------------------------------------------------------------------------

// La lista de `calls:` de 0.2.0 (la pestaña UI): el asistente no suma ninguna llamada al mod.
const CALLS_0_2_0 = [
  'clock.every', 'clock.now', 'command.list', 'command.register', 'fs.exists', 'fs.list', 'fs.read', 'model.complete', 'prompt.fill', 'prompt.submit',
  'prompt.suggest', 'session.cwd', 'session.usage', 'settings.read', 'ui.copy', 'ui.invalidate', 'ui.open', 'ui.resolve', 'ui.toast',
];

test('trust: the wizard adds no call to the mod: the declared calls list equals the one of 0.2.0', (t) => {
  const { source, calls } = declaredCalls();
  t.diagnostic(`lista de calls: ${source}`);
  assert.deepStrictEqual([...new Set(calls)].sort(), [...CALLS_0_2_0].sort());
  // y en el código: ni una llamada `$.noun.verb` fuera de esa lista
  const deduced = new Set();
  for (const file of modFiles()) for (const x of code(read(file)).matchAll(/\$\.([a-z]+)\.([A-Za-z]+)/g)) deduced.add(`${x[1]}.${x[2]}`);
  assert.deepStrictEqual([...deduced].filter((c) => c !== 'plugin.root' && !CALLS_0_2_0.includes(c)), []);
});

test('trust: the new mod files never reference fs.write, fs.remove, fs.mkdir, fs.append, process, spawn or exec and never touch $', () => {
  const BAD = /\bprocess\b|\bspawn\b|\bexec\b|child_process|\$\.exec\b|fs\.(?:write|remove|mkdir|append|rename|copy)|writeFile|appendFile|mkdirSync/;
  const names = modFiles().map((f) => path.basename(f));
  for (const n of ['wizard-model.js', 'wizard-view.js']) {
    assert.ok(names.includes(n), n);
    const c = code(read(path.join(hooksDir, n)));
    assert.doesNotMatch(c, BAD, n);
    assert.doesNotMatch(c, /\$\./, `${n} no usa $ (no cruza imports)`);
  }
  // register.js: lo del asistente tampoco escribe ni ejecuta
  const start = REGISTER.indexOf('// ---- asistente de inicio');
  const end = REGISTER.indexOf('async function paneTree(');
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(code(REGISTER.slice(start, end)), BAD);
});

test('trust: submitWizard is called from one button handler only and never from an event, a timer or the refresh', () => {
  const c = code(REGISTER);
  const decl = c.indexOf('async function submitWizard(');
  const sites = [...c.matchAll(/submitWizard\(/g)].map((m) => m.index).filter((i) => i !== decl + 'async function '.length);
  assert.strictEqual(sites.length, 1, 'una sola llamada');
  const open = REGISTER.indexOf('// <press-handler:wizard>');
  const close = REGISTER.indexOf('// </press-handler:wizard>');
  const callAt = REGISTER.indexOf('await submitWizard(');
  assert.ok(open > 0 && close > open && callAt > open && callAt < close);
  assert.match(REGISTER.slice(open, close), /async function wizardPress\(/);
  assert.ok(close < REGISTER.indexOf('export function register('));
  // a wizardPress solo llegan los botones del asistente (los manejadores que arma wizardBody)
  const presses = [...c.matchAll(/wizardPress\(/g)].map((m) => enclosing(c, m.index)).filter((n) => n !== 'wizardPress');
  assert.deepStrictEqual(presses, ['wizardBody', 'wizardBody', 'wizardBody']);
  const reg = REGISTER.slice(REGISTER.indexOf('export function register('));
  assert.ok(!/submitWizard|wizardPress/.test(reg), 'ningún evento ni temporizador envía');
  for (const name of ['checkWizard', 'openWizardByUser', 'readWizard', 'findWizardRoot', 'startWizard', 'closeWizard', 'syncSuggest', 'checkNewDecisions', 'readSnapshot', 'bandTree']) {
    const s = REGISTER.indexOf(`function ${name}(`);
    assert.ok(s > 0, name);
    assert.ok(!REGISTER.slice(s, REGISTER.indexOf('\n}\n', s)).includes('submitWizard'), `${name} no envía`);
  }
  // el abrir solo (temporizador y session.start) nunca llama a nada que envíe: checkWizard no llama a submitText ni a prompt.*
  const cw = REGISTER.slice(REGISTER.indexOf('async function checkWizard('));
  assert.doesNotMatch(cw.slice(0, cw.indexOf('\n}\n')), /submitText|prompt\./);
});

test('trust: the wizard message goes through submitText and is checked for line breaks and hidden characters before sending', () => {
  const sw = REGISTER.slice(REGISTER.indexOf('async function submitWizard('));
  const body = sw.slice(0, sw.indexOf('\n}\n'));
  assert.match(body, /await submitText\(\$, msg\)/);
  assert.match(body, /choicesMessage\(choicesOf\(/);
  assert.match(body, /msg === null/);
  // submitText rechaza saltos de línea (U+2028 y U+2029 incluidos) y caracteres invisibles
  const st = REGISTER.slice(REGISTER.indexOf('async function submitText('));
  assert.match(st.slice(0, st.indexOf('\n}\n')), /hasHiddenChars\(text\)/);
  assert.match(st.slice(0, st.indexOf('\n}\n')), /\\r\\n/);
  // y el modelo, antes de armar el mensaje, hace la misma comprobación
  const model = code(read(path.join(hooksDir, 'wizard-model.js')));
  assert.match(model, /hasHiddenChars\(msg\)/);
  assert.match(model, /\\r\\n/);
  // el demo no envía: solo llena el prompt
  assert.match(body, /if \(wizard\.demo\) \{\s*await fillPrompt\(\$, msg\)/);
});

test('trust: the core hook and wizard-detect write only under .git/pignolo', () => {
  const core = path.join(__dirname, '..', 'plugins', 'pignolo');
  const hook = code(read(path.join(core, 'hooks', 'handlers', 'session-start.js')));
  const s = hook.indexOf('function spawnWizard(');
  const e = hook.indexOf('exports.run');
  assert.ok(s > 0 && e > s);
  const mine = hook.slice(s, e);
  // el hook no escribe nada por su cuenta: lanza el verbo de init, que es quien escribe (y solo bajo .git/pignolo)
  assert.doesNotMatch(mine, /writeFile|mkdirSync|rmSync|unlinkSync|renameSync|appendFile|copyFile/);
  assert.match(mine, /'wizard-detect', '--write'/);
  // el verbo solo escribe por writeFor / removeStale
  const init = code(read(path.join(core, 'scripts', 'init.js')));
  const v = init.indexOf("if (o.verb === 'wizard-detect')");
  const ve = init.indexOf("if (o.verb === 'choices')");
  assert.ok(v > 0 && ve > v);
  assert.doesNotMatch(init.slice(v, ve), /writeFile|mkdirSync|rmSync|unlinkSync|renameSync|appendFile|atomicWrite/);
  // y en lib/wizard-detect.js todo destino de escritura sale de la carpeta segura (bajo <main>/.git/pignolo)
  const lib = code(read(path.join(core, 'lib', 'wizard-detect.js')));
  const dests = [...lib.matchAll(/\b(?:fs\.)?(writeFileSync|mkdirSync|renameSync|rmSync)\(\s*([^,)]+)/g)].map((m) => m[2].trim());
  assert.ok(dests.length >= 5);
  for (const d of dests) assert.match(d, /^(safe\.dir|file|tmp|path\.join\(safe\.dir)/, d);
  assert.match(lib, /path\.join\(git, 'pignolo'\)/);
});

test('trust: plugins/pignolo/hooks/hooks.json has no new event and no modules key', () => {
  const h = JSON.parse(read(path.join(__dirname, '..', 'plugins', 'pignolo', 'hooks', 'hooks.json')));
  assert.ok(!('modules' in h));
  assert.deepStrictEqual(Object.keys(h).sort(), ['description', 'hooks']);
  assert.deepStrictEqual(Object.keys(h.hooks), ['PreToolUse', 'SubagentStart', 'PostToolUse', 'PostToolUseFailure', 'SubagentStop', 'UserPromptSubmit', 'UserPromptExpansion', 'SessionStart']);
  // el asistente se cuelga del SessionStart que ya existía: el mismo handler, el mismo evento
  const starts = h.hooks.SessionStart.flatMap((m) => m.hooks.map((x) => x.args.join(' ')));
  assert.ok(starts.every((a) => /session-start/.test(a)), starts.join(' | '));
});

test('versions: pignolo-panel is 0.3.0 and the core version is higher than on main, and both CHANGELOGs have the entry', () => {
  const root = path.join(__dirname, '..');
  const panel = JSON.parse(read(path.join(PANEL, '.claude-plugin', 'plugin.json'))).version;
  const coreV = JSON.parse(read(path.join(root, 'plugins', 'pignolo', '.claude-plugin', 'plugin.json'))).version;
  assert.strictEqual(panel, '0.3.0');
  const num = (v) => v.split('.').map(Number);
  const [a, b, c] = num(coreV);
  assert.ok(a > 0 || b > 18 || (b === 18 && c > 0), `el núcleo (${coreV}) sube sobre el 0.18.0 de main`);
  assert.match(read(path.join(PANEL, 'CHANGELOG.md')), new RegExp(`^## ${panel.replace(/\./g, '\\.')}\\b`, 'm'));
  assert.match(read(path.join(root, 'CHANGELOG.md')), new RegExp(`^## ${coreV.replace(/\./g, '\\.')}\\b`, 'm'));
  assert.match(read(path.join(PANEL, 'CHANGELOG.md')), /asistente de inicio/i);
  assert.match(read(path.join(root, 'CHANGELOG.md')), /wizard-detect/);
});
