'use strict';
// RR-01: caracteres de formato, de uso privado y sin asignar no viajan como palabras del usuario (núcleo, hook y mod).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, runLauncher, makeRepo, git } = require('./helpers');
const panel = require(path.join(PLUGIN_ROOT, 'lib', 'panel-state.js'));

const ENV = { ...process.env };
delete ENV.NODE_TEST_CONTEXT;
const cli = (args, cwd) => spawnSync(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', 'panel.js'), ...args], { cwd, encoding: 'utf8', env: ENV, timeout: 120000 });
const last = (r) => JSON.parse(r.stdout.trim().split('\n').pop());

// Un carácter de cada rango pedido: cuatro rangos Cf, FEFF, tags, uso privado (BMP y planos 15/16) y sin asignar.
const RANGES = {
  'U+200B..200F': '\u200B', 'U+200F': '\u200F', 'U+202A..202E': '\u202E', 'U+202A': '\u202A',
  'U+2060..2064': '\u2060', 'U+2064': '\u2064', 'U+2066..2069': '\u2066', 'U+2069': '\u2069',
  'U+FEFF': '\uFEFF', 'tag U+E0000': '\u{E0000}', 'tag U+E0049': '\u{E0049}', 'tag U+E007F': '\u{E007F}',
  'Co U+E000': '\uE000', 'Co U+F8FF': '\uF8FF', 'Co U+F0000': '\u{F0000}', 'Cn U+0378': '\u0378', 'Cn U+FFFF': '\uFFFF', 'Cn U+E0080': '\u{E0080}',
};

function project() {
  const dir = makeRepo();
  fs.mkdirSync(path.join(dir, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pignolo', 'project.md'), '# p\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.pignolo/\n');
  git(['add', '-A'], dir);
  git(['commit', '-m', 'init'], dir);
  return dir;
}
const decisions = (dir) => (fs.existsSync(panel.fileOf(dir)) ? JSON.parse(fs.readFileSync(panel.fileOf(dir), 'utf8')).decisions : []);

for (const [name, ch] of Object.entries(RANGES)) {
  test(`RR-01 panel.js ask refuses ${name} in the question and in an option, and writes nothing`, () => {
    const dir = project();
    for (const args of [['--question', `¿Seguimos${ch}?`, '--option', 'a'], ['--question', '¿Seguimos?', '--option', `se${ch}guir`]]) {
      const o = last(cli(['ask', ...args], dir));
      assert.equal(o.ok, false, JSON.stringify(args));
      assert.match(o.error, /invisibles/);
    }
    assert.equal(decisions(dir).length, 0);
  });
}

test('RR-01 the hook does not mark answered a decision whose registry carries invisible characters', () => {
  const dir = project();
  panel.ask(dir, { question: '¿Seguimos?', options: ['seguir', 'parar'] });
  const file = panel.fileOf(dir);
  const st = JSON.parse(fs.readFileSync(file, 'utf8'));
  st.decisions[0].options[0].label = 'seguir\u202E';
  fs.writeFileSync(file, JSON.stringify(st));
  const r = runLauncher('panel-answer', { hook_event_name: 'UserPromptSubmit', cwd: dir, prompt: 'Respuesta a la decisión Q-1 ("¿Seguimos?"): seguir\u202E.' });
  assert.equal(r.status, 0);
  assert.notEqual(decisions(dir)[0].status, 'answered');
});

test('RR-01 the mod marks as bad (and draws as ?) every hidden range, and leaves ordinary text alone', async () => {
  const mod = await import(require('node:url').pathToFileURL(path.join(PLUGIN_ROOT, '..', 'pignolo-panel', 'hooks', 'state.js')).href);
  for (const [name, ch] of Object.entries(RANGES)) {
    assert.equal(mod.hasHiddenChars(`se${ch}guir`), true, name);
    assert.equal(mod.oneLine(`se${ch}guir`), 'se?guir', name);
  }
  for (const ok of ['seguir', 'Sí, ¿qué más?', 'línea\ndos', 'ñandú — 日本語 😀']) assert.equal(mod.hasHiddenChars(ok), false, ok);
});
