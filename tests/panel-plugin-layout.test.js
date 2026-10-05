'use strict';
// Forma del plugin `pignolo-panel` (T4): plugin aparte, solo lee `.pignolo/panel-state.json`, sin hooks de settings,
// y el núcleo no comparte archivo con el mod. Estático: no necesita Claude Code.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');

const REPO = path.join(__dirname, '..');
const PANEL = path.join(REPO, 'plugins', 'pignolo-panel');
const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
const modFiles = () => fs.readdirSync(path.join(PANEL, 'hooks')).filter((f) => f.endsWith('.js')).map((f) => path.join(PANEL, 'hooks', f));
// El código sin comentarios de línea ni de bloque (las notas pueden nombrar lo que el mod NO hace).
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

test('layout: plugin.json has name, version 0.4.0 and no settings hooks', () => {
  const pj = json(path.join(PANEL, '.claude-plugin', 'plugin.json'));
  assert.strictEqual(pj.name, 'pignolo-panel');
  assert.strictEqual(pj.version, '0.4.0');
  assert.strictEqual(pj.userConfig.uiRecommendations.default, true);
  assert.strictEqual(pj.userConfig.uiRecommendations.type, 'boolean');
  assert.strictEqual(pj.license, 'MIT');
  assert.strictEqual(pj.hooks, undefined);
  assert.strictEqual(pj.dependencies, undefined);
  assert.strictEqual(pj.userConfig.autoOpen.default, true);
  assert.strictEqual(pj.userConfig.demo.default, false);
  assert.match(pj.description, /2\.1\.287/); // versión mínima declarada donde Claude Code lo permite
  // hooks/hooks.json solo tiene `modules` (y su descripción): ningún hook de settings
  const h = json(path.join(PANEL, 'hooks', 'hooks.json'));
  assert.deepStrictEqual(Object.keys(h).sort(), ['description', 'modules']);
  assert.deepStrictEqual(h.modules, ['./register.js']);
  const mk = json(path.join(REPO, '.claude-plugin', 'marketplace.json'));
  const entry = mk.plugins.find((p) => p.name === 'pignolo-panel');
  assert.ok(entry, 'falta la entrada del marketplace (D-P4)');
  assert.strictEqual(entry.source, './plugins/pignolo-panel');
});

test('layout: the core hooks.json has no modules key', () => {
  const core = json(path.join(PLUGIN_ROOT, 'hooks', 'hooks.json'));
  assert.ok(!('modules' in core), 'la guardia no comparte archivo con el mod');
  assert.ok(core.hooks.PreToolUse.some((m) => m.hooks.some((x) => x.args[1] === 'guard')));
  assert.ok(!fs.existsSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'types')));
});

test('layout: the mod reads panel-state.json and, for the UI tab, only the files of pignolo-ui through one reader', () => {
  for (const f of modFiles()) {
    const c = code(read(f));
    // `.git` solo aparece en la ruta del archivo de deteccion del asistente (`/.git/pignolo/wizard-detect.json`), que deja el hook de arranque del nucleo
    assert.doesNotMatch(c.replace(/\/\.git\/pignolo\/wizard-detect\.json/g, ''), /\.git\b/, `${path.basename(f)} lee .git`);
    assert.doesNotMatch(c, /run\.json/, `${path.basename(f)} lee run.json`);
    assert.doesNotMatch(c, /plan\.json/, `${path.basename(f)} lee plan.json`);
    assert.doesNotMatch(c, /state\/plans/, `${path.basename(f)} lee los planes`);
    // recorrer carpetas solo lo hace el lector de la pestaña UI (uiReader en register.js; el resto de ui-input.js usa el lector que le pasan)
    if (path.basename(f) !== 'register.js') assert.doesNotMatch(c, /\$?\.?fs\.list/, `${path.basename(f)} recorre carpetas`);
  }
  const reg = code(read(path.join(PANEL, 'hooks', 'register.js')));
  const reads = [...reg.matchAll(/\$\.fs\.(?:read|exists)\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(reads.length >= 2);
  // `dir + rel` es findUp: sus unicos llamadores pasan `/.pignolo/panel-state.json` y `/.pignolo/project.md`
  for (const r of reads) assert.match(r, /panel-state\.json|wizard-detect\.json|WIZARD_FILE|\.pignolo\/project\.md|\$\.plugin\.root \+ '\/sample\/panel-state\.json'|file|^dir [+] rel$|^p$|root \+ '\/' \+ name/, r);
  assert.strictEqual((reg.match(/\$\.fs\.list\(/g) || []).length, 1, 'un solo lugar recorre carpetas');
  assert.match(reg, /function uiReader\(\$\) \{[\s\S]*?list: \(p\) => \$\.fs\.list\(p\)/);
});

test('layout: the mod has no rule of its own for the next step', () => {
  assert.ok(!fs.existsSync(path.join(PANEL, 'hooks', 'next-rules.js')));
  for (const f of modFiles()) {
    const c = code(read(f));
    assert.doesNotMatch(c, /next-rules|nextSteps\s*\(|deriveGit|parseReflog|parsePackedRefs/, path.basename(f));
  }
});

test('layout: the sample is the synthetic fixture, valid for the core and without private data', () => {
  const sample = read(path.join(PANEL, 'sample', 'panel-state.json'));
  const fixture = read(path.join(__dirname, 'fixtures', 'panel-state.sample.json'));
  assert.strictEqual(sample, fixture);
  const panel = require(path.join(PLUGIN_ROOT, 'lib', 'panel-state.js'));
  const r = panel.normalize(JSON.parse(sample));
  assert.deepStrictEqual(r.problems, []);
  assert.ok(r.state.decisions.length >= 2 && r.state.branches.length >= 3 && r.state.cards.length >= 4);
  assert.strictEqual(r.state.decisions[0].options[0].pros_contras.length > 0, true);
  assert.doesNotMatch(sample, /[A-Za-z]:[\\/]|\/Users\/|\/home\//);
  assert.ok(Buffer.byteLength(sample) < panel.MAX_BYTES);
});

test('layout: README and manual checklist exist and the README states the minimum version and that it is optional and read-only', () => {
  const readme = read(path.join(PANEL, 'README.md'));
  assert.match(readme, /2\.1\.287/);
  assert.match(readme, /opcional/i);
  assert.match(readme, /solo lee|de solo lectura/i);
  assert.match(readme, /Sin resolver/);
  assert.ok(fs.existsSync(path.join(PANEL, 'tests', 'manual', 'panel.md')));
  assert.doesNotMatch(readme, /[A-Za-z]:[\\/]Users|\/Users\/[a-z]/i);
});
