'use strict';
// Confianza del mod (T5): el mod solo lee y dibuja, más `prompt.suggest`/`prompt.fill`, un único `prompt.submit` (la respuesta
// de una decisión de "Te toca", desde el botón de una opción) y `ui.copy`. Estático: no necesita Claude Code (salvo la lista
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

test('trust: prompt.submit appears exactly once in the package, inside submitAnswer', () => {
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
  const start = REGISTER.indexOf('async function submitAnswer(');
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

function declaredCalls() {
  const claude = spawnSync('claude', ['plugin', 'validate', PANEL], { encoding: 'utf8', timeout: 120000, shell: process.platform === 'win32' });
  const m = claude.status === 0 && /calls:\s*(.+)/.exec(claude.stdout || '');
  if (m) return { source: 'claude plugin validate', calls: [...m[1].matchAll(/\$\.([a-z]+\.[A-Za-z]+)/g)].map((x) => x[1]) };
  // sin Claude Code: se deducen del código
  const found = new Set();
  for (const f of modFiles()) for (const x of code(read(f)).matchAll(/\$\.([a-z]+)\.([A-Za-z]+)/g)) found.add(`${x[1]}.${x[2]}`);
  return { source: 'deducida del código (claude no está disponible)', calls: [...found] };
}

test('trust: the declared calls list is a subset of the allowed list', (t) => {
  const { source, calls } = declaredCalls();
  t.diagnostic(`lista de calls: ${source}`);
  assert.ok(calls.length >= 8, `calls: ${calls.join(', ')}`);
  const extra = calls.filter((c) => !allowed(c));
  assert.deepStrictEqual(extra, [], `llamadas fuera de la lista permitida (${source})`);
  for (const must of ['prompt.suggest', 'prompt.fill', 'prompt.submit', 'ui.copy']) assert.ok(calls.includes(must), must);
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
