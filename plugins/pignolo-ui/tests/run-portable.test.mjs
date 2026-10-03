// RL-01: ningún archivo de una corrida (bajo .pignolo-ui/, que un `git add -f` puede meter al historial) guarda la ruta
// absoluta del proyecto, la carpeta personal ni el usuario del sistema: todo es relativo al proyecto.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree, runScript, BROWSER_SKIP } from './helpers.mjs';
import { portable } from '../lib/portable.mjs';

const PAGE = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Inicio</title></head><body><main><h1>Inicio</h1><p>Texto</p></main></body></html>';

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f)); else out.push(f);
  }
  return out;
}

function forbidden(project) {
  const abs = path.resolve(project);
  const user = os.userInfo().username;
  const list = [abs, abs.split(path.sep).join('/'), JSON.stringify(abs).slice(1, -1), pathToFileURL(abs).href, os.homedir(), JSON.stringify(os.homedir()).slice(1, -1)];
  if (user.length >= 3) list.push(user);
  return list;
}

function assertClean(project) {
  const root = path.join(project, '.pignolo-ui');
  const bad = forbidden(project);
  for (const f of walk(root)) {
    if (/\.(png|jpe?g|woff2?)$/i.test(f)) continue;
    const text = fs.readFileSync(f, 'utf8');
    const lower = text.toLowerCase();
    for (const b of bad) assert.ok(!lower.includes(b.toLowerCase()), `${path.relative(root, f)} guarda ${b}`);
  }
}

test('RL-01: una corrida completa (init, ui-check, browser, context) no deja rutas absolutas ni el usuario bajo .pignolo-ui/', () => {
  const project = writeTree(makeTempDir(), { 'index.html': PAGE, 'DESIGN.md': '# d\n' });
  execFileSync('git', ['init', '-q'], { cwd: project });
  const init = runScript('run.mjs', ['init', '--project', project, '--command', 'audit', '--slug', 'x', '--file', path.join(project, 'index.html')]);
  assert.equal(init.status, 0, init.stderr);
  const run = init.json.run;
  const runJson = JSON.parse(fs.readFileSync(path.join(run, 'run.json'), 'utf8'));
  assert.equal(runJson.project, '.');
  assert.equal(runJson.file, './index.html');
  const ui = runScript('ui-check.mjs', ['--project', project, '--run', run, '--files', 'index.html'], { cwd: project });
  assert.ok([0, 1].includes(ui.status), ui.stderr);
  const ctx = runScript('run.mjs', ['context', '--project', project, '--run', run]);
  assert.ok([0, 1].includes(ctx.status), ctx.stderr);
  assertClean(project);
});

test('RL-01: browser.json, captures.json y dom.json con --file guardan la ruta relativa, no el file:// absoluto', { skip: BROWSER_SKIP }, () => {
  const project = writeTree(makeTempDir(), { 'index.html': PAGE });
  const run = path.join(project, '.pignolo-ui', 'runs', 'r1');
  for (const command of ['measure', 'capture', 'dom']) {
    const r = runScript('browser.mjs', [command, '--project', project, '--run', run, '--file', 'index.html'], { cwd: project });
    assert.ok(r.status === 0 || r.status === 1, `${command}: ${r.stderr}`);
  }
  assertClean(project);
});

test('portable: relativiza el proyecto y su file://, el home pasa a ~ y una ruta absoluta ajena queda en su último nombre', () => {
  const project = path.resolve(makeTempDir());
  const out = portable({
    a: path.join(project, 'src', 'a.css'),
    u: `${pathToFileURL(project).href}/index.html`,
    h: path.join(os.homedir(), 'otra', 'cosa.txt'),
    p: path.join(path.dirname(makeTempDir()), 'claude-profile-123'),
    n: ['texto normal', 4, null],
  }, project);
  assert.equal(out.a, './src/a.css');
  assert.equal(out.u, './index.html');
  assert.equal(out.p, 'claude-profile-123');
  assert.deepEqual(out.n, ['texto normal', 4, null]);
  assert.ok(!out.h.includes(os.homedir()));
});

test('portable: si el proyecto es carpeta madre del home, el home pasa a ~ antes de relativizar (sin ./<usuario>/...)', () => {
  const project = path.resolve(makeTempDir());
  const home = path.join(project, 'usuario-prueba');
  const out = portable({
    a: path.join(home, 'Documentos', 'x.txt'),
    u: `${pathToFileURL(home).href}/y.txt`,
    s: path.join(project, 'src', 'a.css'),
  }, project, { home });
  assert.equal(out.a, '~/Documentos/x.txt');
  assert.equal(out.u, '~/y.txt');
  assert.equal(out.s, './src/a.css');
  assert.ok(!JSON.stringify(out).includes('usuario-prueba'));
});
