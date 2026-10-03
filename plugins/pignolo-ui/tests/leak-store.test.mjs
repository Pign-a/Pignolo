// Fuga de leak-values: los valores personales nunca bajo el proyecto (docs/plans/2026-10-03-fuga-leak-values.md, T1).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree, runScript, PLUGIN_ROOT } from './helpers.mjs';
import { repoId, leakDirFor, writeLeakFiles, findLegacyLeakFiles } from '../lib/leak-store.mjs';

const run = (args, home) => runScript('run.mjs', args, { env: { ...process.env, PIGNOLO_HOME: home } });

function makeRepo(tree = {}) {
  const dir = makeTempDir();
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'ana.ejemplo@example.test'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Ana Ejemplo'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  writeTree(dir, tree);
  return dir;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}

test('1: leak-values writes outside the project (under <home>/ui-leaks/) and warns not to commit them', () => {
  const project = makeRepo({ '.pignolo-ui/runs/r1/run.json': '{}' });
  const home = makeTempDir();
  const r = run(['leak-values', '--project', project, '--run', path.join(project, '.pignolo-ui', 'runs', 'r1'), '--email', 'cuenta@example.test'], home);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(path.resolve(r.json.out).startsWith(path.join(home, 'ui-leaks') + path.sep), r.json.out);
  assert.ok(fs.existsSync(r.json.out));
  assert.ok(fs.existsSync(path.join(path.dirname(r.json.out), 'leak-origins.json')));
  assert.ok(JSON.parse(fs.readFileSync(r.json.out, 'utf8')).includes('ana.ejemplo@example.test'));
  const names = walk(project).map((f) => path.basename(f));
  assert.ok(!names.includes('leak-values.json') && !names.includes('leak-origins.json'), 'a leak file sits under the project');
  assert.match(r.stdout + r.stderr, /nunca los agregues a git/);
  assert.equal(r.json.legacy, 0);
});

test('2: a PIGNOLO_HOME inside the project is refused and nothing is written (D2)', () => {
  const project = makeRepo();
  const r = run(['leak-values', '--project', project, '--run', 'r1'], path.join(project, '.pignolo-home'));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /dentro del proyecto/);
  assert.ok(!fs.existsSync(path.join(project, '.pignolo-home')));
  assert.ok(!walk(project).some((f) => /leak-(values|origins)\.json$/.test(f)));
});

test('3: repoId differs per project and is the same through a junction or another capitalization', () => {
  const a = makeRepo();
  const b = makeRepo();
  assert.notEqual(repoId(a), repoId(b));
  assert.match(repoId(a), /^[0-9a-f]{12}$/);
  const link = path.join(makeTempDir(), 'enlace');
  fs.symlinkSync(a, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(repoId(link), repoId(a));
  if (process.platform === 'win32') assert.equal(repoId(a.toUpperCase()), repoId(a));
  const home = makeTempDir();
  assert.equal(leakDirFor({ project: link, run: 'r1', env: { PIGNOLO_HOME: home } }), leakDirFor({ project: a, run: 'r1', env: { PIGNOLO_HOME: home } }));
});

test('3b: the run id is validated (no traversal), and a home that resolves inside the project through a link is refused', () => {
  const project = makeRepo();
  const env = { PIGNOLO_HOME: makeTempDir() };
  for (const bad of ['..', 'a/../b', 'x y', '', '.', '..\\..', 'r1/..']) assert.throws(() => leakDirFor({ project, run: bad, env }), /leak-store/, bad);
  const inside = path.join(project, 'dentro');
  fs.mkdirSync(inside);
  const link = path.join(makeTempDir(), 'home-link');
  fs.symlinkSync(inside, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => leakDirFor({ project, run: 'r1', env: { PIGNOLO_HOME: link } }), /dentro del proyecto/);
  assert.throws(() => writeLeakFiles({ project, run: 'r1', values: [], origins: {}, env: { PIGNOLO_HOME: link } }), /dentro del proyecto/);
});

test('3c: runs of this project older than 14 days are pruned from ui-leaks; the current one and other projects are not', () => {
  const project = makeRepo();
  const other = makeRepo();
  const env = { PIGNOLO_HOME: makeTempDir() };
  const old = writeLeakFiles({ project, run: 'viejo', values: ['x'], origins: {}, env }).dir;
  const otherOld = writeLeakFiles({ project: other, run: 'viejo', values: ['x'], origins: {}, env }).dir;
  const past = new Date(Date.now() - 20 * 24 * 3600 * 1000);
  fs.utimesSync(old, past, past);
  fs.utimesSync(otherOld, past, past);
  const w = writeLeakFiles({ project, run: 'nuevo', values: ['x'], origins: {}, env });
  assert.deepEqual(w.pruned, ['viejo']);
  assert.ok(!fs.existsSync(old) && fs.existsSync(w.dir) && fs.existsSync(otherOld));
});

test('4: --out is refused with the fixed text', () => {
  const project = makeRepo();
  const r = run(['leak-values', '--project', project, '--out', path.join(makeTempDir(), 'x.json')], makeTempDir());
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--out ya no existe: los valores se guardan fuera del proyecto \(--run\)/);
});

test('5: leak-check reads the values from the new place', () => {
  const project = makeRepo({ '.pignolo-ui/runs/r1/run.json': '{}' });
  const lv = run(['leak-values', '--project', project, '--run', 'r1'], makeTempDir());
  assert.equal(lv.status, 0, lv.stderr);
  const dir = writeTree(makeTempDir(), { 'a.html': '<p>contacto ana.ejemplo@example.test</p>' });
  assert.equal(runScript('leak-check.mjs', ['--dir', dir, '--values-file', lv.json.out]).status, 1);
  const missing = runScript('leak-check.mjs', ['--dir', dir, '--values-file', path.join(path.dirname(lv.json.out), 'nope.json')]);
  assert.equal(missing.status, 2);
});

test('6: leak-migrate lists, never prints contents, deletes only the leak files and says what is tracked', () => {
  const project = makeRepo({
    '.pignolo-ui/runs/r0/leak-values.json': '["SECRETO-XYZ"]\n',
    '.pignolo-ui/runs/r0/run.json': '{}',
    '.pignolo-ui/runs/r0/sub/leak-origins.json': '{"SECRETO-XYZ":true}\n',
  });
  const home = makeTempDir();
  assert.deepEqual(findLegacyLeakFiles(project), ['.pignolo-ui/runs/r0/leak-values.json', '.pignolo-ui/runs/r0/sub/leak-origins.json']);
  const l = run(['leak-migrate', '--project', project], home);
  assert.equal(l.status, 0, l.stderr);
  assert.deepEqual(l.json.found, ['.pignolo-ui/runs/r0/leak-values.json', '.pignolo-ui/runs/r0/sub/leak-origins.json']);
  assert.deepEqual(l.json.tracked, []);
  assert.ok(fs.existsSync(path.join(project, '.pignolo-ui/runs/r0/leak-values.json')));
  assert.ok(!(l.stdout + l.stderr).includes('SECRETO-XYZ'));
  execFileSync('git', ['add', '-f', '.pignolo-ui/runs/r0/leak-values.json'], { cwd: project });
  const d = run(['leak-migrate', '--project', project, '--delete'], home);
  assert.equal(d.status, 0, d.stderr);
  assert.deepEqual(d.json.tracked, ['.pignolo-ui/runs/r0/leak-values.json']);
  assert.equal(d.json.deleted.length, 2);
  assert.ok(fs.existsSync(path.join(project, '.pignolo-ui/runs/r0/run.json')));
  assert.ok(!fs.existsSync(path.join(project, '.pignolo-ui/runs/r0/leak-values.json')));
  assert.match(d.stdout + d.stderr, /docs\/fuga-leak-values\.md/);
  assert.ok(!(d.stdout + d.stderr).includes('SECRETO-XYZ'));
  // the index is untouched
  assert.match(execFileSync('git', ['ls-files'], { cwd: project, encoding: 'utf8' }), /leak-values\.json/);
});

test('8: no skill or reference names <run>/leak-values.json; context.md has exactly one NO-GIT-UI line and the <values> marker', () => {
  const files = [];
  for (const d of ['skills', 'reference']) for (const f of walk(path.join(PLUGIN_ROOT, d))) if (f.endsWith('.md')) files.push(f);
  for (const f of files) assert.ok(!/<run>[\\/]leak-(values|origins)\.json/.test(fs.readFileSync(f, 'utf8')), `${path.basename(f)} names the old path`);
  const ctx = fs.readFileSync(path.join(PLUGIN_ROOT, 'reference', 'context.md'), 'utf8');
  assert.equal(ctx.split('\n').filter((l) => l.includes('NO-GIT-UI:')).length, 1);
  assert.match(ctx, /`<values>`/);
});
