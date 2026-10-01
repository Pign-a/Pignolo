'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeTempDir } = require('./helpers');
const store = require(path.join(PLUGIN_ROOT, 'lib', 'state-store.js'));
const idx = require(path.join(PLUGIN_ROOT, 'lib', 'state-index.js'));
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));
const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'state-index.js');

const HEADER = '<!-- generado por pignolo state-index; no editar a mano -->';
function seed(main) {
  const w = (kind, id, status, body, extra = {}) => assert.ok(store.writeEntry({ main, kind, id, fields: { status, created: '2026-09-30', ...extra }, body }).ok);
  w('work', '2026-09-30-b', 'open', '# Segundo\n\nlínea b\n');
  w('work', '2026-09-29-a', 'closed', '# Primero\n\nlínea a\n');
  w('issues', '2026-09-30-i', 'open', '# Un issue\n\ndetalle\n', { priority: 'high' });
  w('decisions', '2026-09-30-d', 'decided', '# Una decisión\n\npor qué\n');
}
const runCli = (args, cwd) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', env: { ...process.env } });

test('buildIndex: 4 entries of 3 kinds give 3 sections in stable order with the exact header', () => {
  const main = makeTempDir('pignolo-idx-');
  seed(main);
  const { text, errors } = idx.buildIndex({ main });
  assert.deepStrictEqual(errors, []);
  assert.ok(text.startsWith(`${HEADER}\n`));
  assert.ok(!text.includes('\r'));
  const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepStrictEqual(sections, ['work', 'decisions', 'issues']);
  const work = text.slice(text.indexOf('## work'), text.indexOf('## decisions'));
  assert.ok(work.indexOf('2026-09-29-a — Primero: línea a [closed]') < work.indexOf('2026-09-30-b — Segundo: línea b [open]'));
  assert.ok(text.includes('- 2026-09-30-i — Un issue: detalle [open]'));
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:/.test(text), 'sin fecha de generación');
});

test('writeIndex: the second run says changed: false and leaves the mtime; a status change touches only that line', () => {
  const main = makeTempDir('pignolo-idx-');
  seed(main);
  const first = idx.writeIndex({ main });
  assert.deepStrictEqual([first.ok, first.changed], [true, true]);
  const before = fs.readFileSync(first.file, 'utf8');
  const mtime = fs.statSync(first.file).mtimeMs;
  fs.utimesSync(first.file, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  const old = fs.statSync(first.file).mtimeMs;
  assert.notStrictEqual(old, mtime);
  const second = idx.writeIndex({ main });
  assert.strictEqual(second.changed, false);
  assert.strictEqual(fs.statSync(first.file).mtimeMs, old);
  assert.ok(store.setStatus({ main, kind: 'work', id: '2026-09-30-b', status: 'closed' }).ok);
  const third = idx.writeIndex({ main });
  assert.strictEqual(third.changed, true);
  const after = fs.readFileSync(first.file, 'utf8');
  const a = before.split('\n');
  const b = after.split('\n');
  assert.strictEqual(a.length, b.length);
  const diff = a.map((l, i) => (l === b[i] ? null : i)).filter((i) => i !== null);
  assert.strictEqual(diff.length, 1, JSON.stringify(diff));
  assert.ok(b[diff[0]].includes('2026-09-30-b') && b[diff[0]].includes('[closed]'));
});

test('a truncated entry appears in errors and in the index as "ilegible"; nothing is lost', () => {
  const main = makeTempDir('pignolo-idx-');
  seed(main);
  fs.writeFileSync(path.join(store.stateDir(main, 'work'), '2026-09-30-z.md'), '---\nid: 2026-09-30-z\nstatus: op');
  const { text, errors } = idx.buildIndex({ main });
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0].file, /2026-09-30-z\.md$/);
  assert.ok(text.includes('- 2026-09-30-z.md — ilegible:'));
  assert.ok(text.includes('2026-09-30-b — Segundo'));
});

test('a plan of hito 5 is listed with its stage; a truncated plan.json is "registro ilegible"', () => {
  const main = makeTempDir('pignolo-idx-');
  seed(main);
  assert.ok(ps.newPlan({ main, plan: 'p1', request: 'Quiero algo claro.', spec: 'docs/s.md', now: '2026-09-30T00:00:00.000Z' }).ok);
  let { text } = idx.buildIndex({ main });
  assert.ok(text.includes('## plans\n\n- plan p1 — etapa spec'), text);
  fs.writeFileSync(path.join(main, '.pignolo', 'state', 'plans', 'p1', 'plan.json'), '{"v":1,"plan":"p1"');
  const r = idx.buildIndex({ main });
  text = r.text;
  assert.ok(text.includes('- plan p1 — registro ilegible'));
  assert.strictEqual(r.errors.length, 1);
});

test('archive is only a counter in the index', () => {
  const main = makeTempDir('pignolo-idx-');
  assert.ok(store.writeEntry({ main, kind: 'archive', id: '2026-08-01-old', fields: { status: 'closed' }, body: '# Viejo\n' }).ok);
  const { text } = idx.buildIndex({ main });
  assert.ok(text.includes('## archive\n\n- 1 entradas archivadas'));
  assert.ok(!text.includes('Viejo'));
});

test('CLI: writes the index, then --check passes; an INDEX.md edited by hand makes --check exit 1 with stale-index', () => {
  const main = makeTempDir('pignolo-idx-');
  seed(main);
  const w = runCli(['--cwd', main], main);
  assert.strictEqual(w.status, 0, w.stderr);
  const out = JSON.parse(w.stdout);
  assert.deepStrictEqual([out.ok, out.changed], [true, true]);
  const c = runCli(['--cwd', main, '--check'], main);
  assert.strictEqual(c.status, 0, c.stdout);
  fs.appendFileSync(out.file, '- editado a mano\n');
  const stale = runCli(['--check', '--cwd', main], makeTempDir('pignolo-elsewhere-'));
  assert.strictEqual(stale.status, 1);
  const j = JSON.parse(stale.stdout);
  assert.deepStrictEqual([j.ok, j.refused], [false, 'stale-index']);
  assert.ok(fs.readFileSync(out.file, 'utf8').endsWith('- editado a mano\n'), '--check no escribe');
  assert.strictEqual(runCli(['--bogus'], main).status, 2);
});
