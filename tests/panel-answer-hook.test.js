'use strict';
// UserPromptSubmit `panel-answer` (R-P4): marca la respuesta de una decisión; falla abierto, nunca niega ni reescribe.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, runLauncher, makeRepo } = require('./helpers');
const panel = require(path.join(PLUGIN_ROOT, 'lib', 'panel-state.js'));

function project() {
  const dir = makeRepo();
  fs.mkdirSync(path.join(dir, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pignolo', 'project.md'), '# p\n');
  panel.ask(dir, { question: '¿El PDF usa la plantilla corta?', options: ['plantilla corta', 'plantilla completa'], recommended: 'plantilla corta' });
  return dir;
}
const submit = (dir, prompt) => runLauncher('panel-answer', { hook_event_name: 'UserPromptSubmit', cwd: dir, prompt });
const status = (dir) => { const d = panel.read(dir).state.decisions[0]; return [d.status, d.answer, d.answeredAt]; };
const GOOD = 'Respuesta a la decisión Q-1 ("¿El PDF usa la plantilla corta?"): plantilla corta.';

test('panel-answer hook: a prompt that matches the format marks the decision answered with answer and answeredAt', () => {
  const dir = project();
  const r = submit(dir, GOOD);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, ''); // no reescribe el prompt ni agrega contexto
  const [st, answer, at] = status(dir);
  assert.deepEqual([st, answer], ['answered', 'plantilla corta']);
  assert.ok(Number.isFinite(Date.parse(at)));
});

test('panel-answer hook: an unknown id, an answer that is not an option or text that only looks similar leaves the state untouched', () => {
  const dir = project();
  const before = fs.readFileSync(panel.fileOf(dir), 'utf8');
  for (const prompt of [
    GOOD.replace('Q-1', 'Q-7'),
    GOOD.replace('plantilla corta.', 'otra cosa.'),
    GOOD.replace('plantilla corta.', 'plantilla corta'), // sin el punto final
    `por favor ${GOOD}`,
    GOOD.replace('Respuesta a la decisión', 'Respuesta a la decision'),
    `${GOOD}\nextra`,
  ]) {
    const r = submit(dir, prompt);
    assert.equal(r.status, 0, prompt);
    assert.equal(fs.readFileSync(panel.fileOf(dir), 'utf8'), before, prompt);
  }
});

test('panel-answer hook: it never denies, never rewrites the prompt and exits 0 on any input', () => {
  const dir = project();
  const before = fs.readFileSync(panel.fileOf(dir), 'utf8');
  const inputs = ['', '{no es json', '[]', '{"prompt": 5}', '{}', Buffer.from([0xff, 0xfe, 0x00]).toString('latin1'), '{"prompt":"Respuesta a la decisión Q-1 (\\"x\\"): plantilla corta.","cwd":"Z:\\\\no\\\\existe"}'];
  for (const input of inputs) {
    const r = runLauncher('panel-answer', input);
    assert.equal(r.status, 0, JSON.stringify(input));
    assert.ok(!/deny|block/i.test(r.stdout), r.stdout);
  }
  assert.equal(fs.readFileSync(panel.fileOf(dir), 'utf8'), before);
  // y con el registro roto o sin lock disponible, sigue saliendo 0
  fs.writeFileSync(panel.fileOf(dir), Buffer.from([0xff, 0xfe]));
  assert.equal(submit(dir, GOOD).status, 0);
  fs.mkdirSync(path.join(dir, '.pignolo', 'tmp'), { recursive: true });
  fs.writeFileSync(panel.lockOf(dir), '1\n');
  assert.equal(submit(dir, GOOD).status, 0);
});

test('panel-answer hook: the free option Otra is not an option, so it does not mark the decision (falla cerrado, RP-02)', () => {
  const dir = project();
  const r = submit(dir, 'Respuesta a la decisión Q-1 ("¿El PDF usa la plantilla corta?"): Otra.');
  assert.equal(r.status, 0);
  assert.equal(status(dir)[0], 'open');
});
