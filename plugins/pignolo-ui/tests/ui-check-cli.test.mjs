// ui-check CLI (scripts/ui-check.mjs) in a subprocess, inside a temporary git repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { makeTempDir, writeTree, runScript, serveRoutes, PLUGIN_ROOT } from './helpers.mjs';
import { loadCatalog } from '../lib/catalog.mjs';

const CSS = '.a { display: block; }\n';
const DESIGN = '---\npignolo:\n  schema: 1\n---\n';

function makeRepo() {
  const repo = writeTree(makeTempDir(), { 'src/a.css': CSS, 'DESIGN.md': DESIGN });
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe', timeout: 10000 });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  return repo;
}
const porcelain = (repo) => execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8', timeout: 10000 });

test('usage errors exit 2 with a Spanish message and no stack', async (t) => {
  const repo = makeRepo();
  const run = path.join(repo, '.pignolo-ui', 'runs', 'r1');
  const outsideDesign = path.join(writeTree(makeTempDir(), { 'DESIGN.md': DESIGN }), 'DESIGN.md');
  const CASES = [
    ['no --run', ['--project', repo, '--files', 'src/a.css'], /falta --run/],
    ['--run outside .pignolo-ui', ['--project', repo, '--run', path.join(repo, 'out'), '--files', 'src/a.css'], /--run debe estar dentro de \.pignolo-ui/],
    ['unknown option', ['--project', repo, '--run', run, '--files', 'src/a.css', '--fast'], /opción desconocida --fast/],
    ['missing file', ['--project', repo, '--run', run, '--files', 'src/missing.css'], /no existe/],
    ['no --files, --dom, --design or --measures', ['--project', repo, '--run', run], /falta --files, --dom, --design o --measures/],
    ['--design outside the project', ['--project', repo, '--run', run, '--design', outsideDesign], /--design está fuera del proyecto/],
  ];
  for (const [name, args, message] of CASES) {
    await t.test(name, () => {
      const r = runScript('ui-check.mjs', args, { cwd: repo });
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, message);
      assert.doesNotMatch(r.stderr, /\n\s+at /);
      assert.equal(r.stdout, '');
    });
  }
  assert.equal(fs.existsSync(run), false);
});

test('a healthy run writes ui-check.json inside an ignored run folder', () => {
  const repo = makeRepo();
  const run = path.join(repo, '.pignolo-ui', 'runs', 'r1');
  const r = runScript('ui-check.mjs', ['--project', repo, '--run', run, '--files', 'src/a.css'], { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
  const out = path.join(run, 'ui-check.json');
  assert.equal(path.resolve(r.json.out), path.resolve(out));
  assert.equal(r.json.exitCode, 0);
  assert.deepEqual(Object.keys(r.json.counts).sort(), ['blockingNew', 'fail', 'pass', 'unverified']);
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(Object.keys(report).sort(), ['base', 'catalogVersion', 'entries', 'inputs']);
  assert.equal(report.catalogVersion, loadCatalog().catalogVersion);
  assert.equal(report.base, null);
  assert.deepEqual(report.inputs[0], { file: 'src/a.css', sha256: crypto.createHash('sha256').update(CSS).digest('hex') });
  assert.ok(report.entries.length > 0);
  for (const e of report.entries) {
    assert.ok(['pass', 'fail', 'unverified'].includes(e.status), e.id);
    assert.equal(typeof e.fingerprint, 'string');
    assert.ok(['new', 'debt'].includes(e.scope));
  }
  assert.equal(fs.readFileSync(path.join(repo, '.pignolo-ui', '.gitignore'), 'utf8'), '*\n');
  assert.equal(porcelain(repo), '');
});

test('without --project the project is the git toplevel, or the cwd without git', () => {
  const repo = makeRepo();
  const r = runScript('ui-check.mjs', ['--run', path.join('..', '.pignolo-ui', 'runs', 'r2'), '--files', 'a.css'], { cwd: path.join(repo, 'src') });
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(repo, '.pignolo-ui', 'runs', 'r2', 'ui-check.json'), 'utf8'));
  assert.equal(report.inputs[0].file, 'src/a.css');

  const outer = makeTempDir();
  const plain = writeTree(path.join(outer, 'plain'), { 'a.css': CSS });
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: outer };
  const r2 = runScript('ui-check.mjs', ['--run', path.join('.pignolo-ui', 'runs', 'r1'), '--files', 'a.css'], { cwd: plain, env });
  assert.equal(r2.status, 0, r2.stderr);
  const report2 = JSON.parse(fs.readFileSync(path.join(plain, '.pignolo-ui', 'runs', 'r1', 'ui-check.json'), 'utf8'));
  assert.equal(report2.inputs[0].file, 'a.css');
});

test('only --design runs the project rules', () => {
  const repo = makeRepo();
  const run = path.join(repo, '.pignolo-ui', 'runs', 'r1');
  const r = runScript('ui-check.mjs', ['--project', repo, '--run', run, '--design', path.join(repo, 'DESIGN.md')], { cwd: repo });
  assert.ok([0, 1].includes(r.status), r.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(run, 'ui-check.json'), 'utf8'));
  assert.deepEqual(report.inputs.map((i) => i.file), ['DESIGN.md']);
  assert.ok(report.entries.every((e) => e.file === undefined || e.file === 'DESIGN.md'));
});

test('--gate prints nothing on stdout and one summary line on stderr', () => {
  const repo = makeRepo();
  const run = path.join(repo, '.pignolo-ui', 'runs', 'r1');
  const r = runScript('ui-check.mjs', ['--project', repo, '--run', run, '--files', 'src/a.css', '--gate'], { cwd: repo });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr.trimEnd().split('\n').length, 1);
  assert.match(r.stderr, /^ui-check: /);
  assert.ok(fs.existsSync(path.join(run, 'ui-check.json')));
});

test('an invalid --base prints its Spanish message without "error interno" or a stack', () => {
  const repo = makeRepo();
  const run = path.join(repo, '.pignolo-ui', 'runs', 'r1');
  const r = runScript('ui-check.mjs', ['--project', repo, '--run', run, '--files', 'src/a.css', '--base', 'nope'], { cwd: repo });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /^ui-check: --base no es una ref válida: nope\n$/);
  assert.equal(r.stdout, '');
  assert.equal(fs.existsSync(path.join(run, 'ui-check.json')), false);
});

test('an invalid --base is a usage error checked before any rule runs', async () => {
  const { main } = await import('../scripts/ui-check.mjs');
  const repo = makeRepo();
  const run = path.join(repo, '.pignolo-ui', 'runs', 'r1');
  let checked = 0;
  const check = async () => { checked++; return { entries: [], inputs: [], exitCode: 0 }; };
  const errors = [];
  const write = process.stderr.write;
  process.stderr.write = (s) => { errors.push(String(s)); return true; };
  let code;
  try {
    code = await main(['--project', repo, '--run', run, '--files', 'src/a.css', '--base', 'nope'], { cwd: repo, check });
  } finally {
    process.stderr.write = write;
  }
  assert.equal(code, 2);
  assert.equal(checked, 0, 'runCheck must not run with an invalid --base');
  assert.deepEqual(errors, ['ui-check: --base no es una ref válida: nope\n']);
});

test('--url: loopback only, one origin, at most 20, needs --design; fetched pages go to inputs', async (t) => {
  const repo = makeRepo();
  const run = path.join(repo, '.pignolo-ui', 'runs', 'r1');
  const base = ['--project', repo, '--run', run, '--design', 'DESIGN.md'];
  const many = Array.from({ length: 21 }, (_, i) => ['--url', `http://127.0.0.1:1/${i}`]).flat();
  const CASES = [
    ['remote URL', [...base, '--url', 'https://example.com/'], /--url solo acepta direcciones locales/],
    ['two origins', [...base, '--url', 'http://127.0.0.1:1/', '--url', 'http://localhost:2/'], /mismo origen/],
    ['more than 20', [...base, ...many], /como mucho 20/],
    ['without --design', ['--project', repo, '--run', run, '--url', 'http://127.0.0.1:1/'], /--url necesita --design/],
  ];
  for (const [name, args, message] of CASES) {
    await t.test(name, () => {
      const r = runScript('ui-check.mjs', args, { cwd: repo });
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, message);
      assert.doesNotMatch(r.stderr, /\n\s+at /);
    });
  }
  const srv = await serveRoutes({ '/': { headers: { 'content-type': 'text/html' }, body: '<!doctype html><html lang="es"><head><title>A</title></head><body></body></html>' } });
  try {
    const r = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', 'ui-check.mjs'), ...base, '--url', `${srv.base}/`], { cwd: repo });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.on('close', (status) => resolve({ status, out }));
    });
    assert.equal(r.status, 0, r.out);
    const report = JSON.parse(fs.readFileSync(path.join(run, 'ui-check.json'), 'utf8'));
    assert.ok(report.inputs.some((i) => i.url === `${srv.base}/` && /^[0-9a-f]{64}$/.test(i.sha256)), JSON.stringify(report.inputs));
  } finally {
    await srv.close();
  }
});
