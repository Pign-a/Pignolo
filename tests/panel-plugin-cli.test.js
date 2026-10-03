'use strict';
// Envoltorio de `claude plugin validate` y `claude plugin test` sobre plugins/pignolo-panel (T6). `npm test` NO exige Claude
// Code: sin `claude` en el PATH, o con una versión menor a 2.1.287, estas pruebas se saltan con el motivo a la vista.
// Ambos comandos corren sin sesión, sin red y sin gastar tokens (sondas S2 del 2026-10-03).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir } = require('./helpers');

const PANEL = path.join(__dirname, '..', 'plugins', 'pignolo-panel');
const MIN = [2, 1, 287];
const run = (args) => spawnSync('claude', args, { encoding: 'utf8', timeout: 240000, shell: process.platform === 'win32' });

function claudeVersion() {
  const r = run(['--version']);
  const m = r.status === 0 && /(\d+)\.(\d+)\.(\d+)/.exec(r.stdout || '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
const older = (v) => { for (let i = 0; i < 3; i += 1) { if (v[i] !== MIN[i]) return v[i] < MIN[i]; } return false; };
const V = claudeVersion();
const SKIP = !V ? 'claude no está en el PATH' : older(V) ? `Claude Code ${V.join('.')} es anterior a 2.1.287` : false;

test('plugin cli: validate and test pass for plugins/pignolo-panel or skip with a reason', { skip: SKIP }, () => {
  const v = run(['plugin', 'validate', PANEL]);
  assert.strictEqual(v.status, 0, v.stdout + v.stderr);
  assert.match(v.stdout, /Validation passed/);
  const t = run(['plugin', 'test', PANEL]);
  assert.strictEqual(t.status, 0, (t.stdout + t.stderr).slice(-3000));
  assert.match(t.stdout, /\b0 fail\b/);
  const pass = Number((/(\d+) pass/.exec(t.stdout) || [])[1]);
  assert.ok(pass >= 40, `pasaron ${pass} pruebas`);
});

test('plugin cli: the wrapper fails on a broken .ts test (it does not always pass)', { skip: SKIP }, () => {
  // sobre una copia: nunca se toca el paquete real
  const copy = path.join(makeTempDir('pignolo-panelcopy-'), 'pignolo-panel');
  fs.cpSync(PANEL, copy, { recursive: true });
  const file = path.join(copy, 'tests', 'panel.test.ts');
  fs.writeFileSync(file, `${fs.readFileSync(file, 'utf8')}\ntest('rota a proposito', async () => { expect(1).toBe(2) })\n`);
  const t = run(['plugin', 'test', copy]);
  assert.notStrictEqual(t.status, 0, 'una prueba rota debe hacer fallar el comando');
  assert.match(t.stdout + t.stderr, /rota a proposito/);
});

test('plugin cli: the test:panel script runs the layout, trust and cli files', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const s = pkg.scripts['test:panel'];
  assert.ok(s, 'falta test:panel');
  for (const f of ['panel-plugin-layout', 'panel-trust', 'panel-plugin-cli']) assert.ok(s.includes(`tests/${f}.test.js`), f);
  assert.ok(!pkg.dependencies && !pkg.devDependencies);
  assert.ok((fs.readFileSync(path.join(PANEL, 'tests', 'panel.test.ts'), 'utf8').match(/^test\(/gm) || []).length >= 40);
});
