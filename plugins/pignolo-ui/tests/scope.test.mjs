// Scope of ui-check (lib/scope.mjs): --base, multiset debt/new. Each case runs in a temporary
// git repo, with injected rules (the real ones are covered again by Task 12).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree, runScript } from './helpers.mjs';
import { runCheck } from '../lib/ui-check.mjs';
import { fail } from '../lib/rules/api.mjs';
import { parseColor, contrastRatio } from '../lib/color.mjs';
import { classifyScope, materializeBase, scopeRun } from '../lib/scope.mjs';

// STATE-04: fails on every `outline: none`; the key is the selector.
const outlineRule = {
  id: 'STATE-04',
  checkFile(ctx) {
    const out = [];
    const re = /([^{}]+)\{[^{}]*outline:\s*none/g;
    let m;
    while ((m = re.exec(ctx.text))) {
      const selector = m[1].trim();
      const start = m.index + m[1].search(/\S/);
      out.push(fail(selector, { line: ctx.text.slice(0, start).split('\n').length, selector }));
    }
    return out;
  },
};

const rgba = (s) => {
  const c = parseColor(s);
  return c.rgba ?? c;
};

// COLOR-03: on-surface over surface < 4.5 fails; key = pair and theme, never the values.
// Reads DESIGN.md (pctx.design) and globals.css (a token source) of the evaluated folder.
const contrastRule = {
  id: 'COLOR-03',
  checkProject(pctx) {
    const out = [];
    const test1 = (fg, bg, file) => {
      if (fg && bg && contrastRatio(rgba(fg), rgba(bg)) < 4.5) out.push(fail('on-surface/surface/light', { file }));
    };
    const colors = pctx.design && pctx.design.data && pctx.design.data.colors;
    if (colors) test1(colors['on-surface'], colors.surface, pctx.design.rel);
    const css = path.join(pctx.project, 'globals.css');
    if (fs.existsSync(css)) {
      const t = fs.readFileSync(css, 'utf8');
      const get = (n) => (t.match(new RegExp('--' + n + ':\\s*([^;]+);')) || [])[1];
      test1(get('on-surface'), get('surface'), 'globals.css');
    }
    return out;
  },
};
const RULES = [outlineRule, contrastRule];

function git(repo, ...args) {
  return execFileSync('git', args, { cwd: repo, stdio: 'pipe', timeout: 10000 });
}
function makeRepo(tree) {
  const repo = writeTree(makeTempDir(), tree);
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'core.autocrlf', 'false');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
}
const commitAll = (repo, msg = 'next') => { git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', msg); };

async function check(repo, { files, design, base = 'HEAD' } = {}) {
  return runCheck({
    project: repo,
    files,
    design: design ? path.join(repo, design) : null,
    base,
    dom: [],
    inject: { rules: RULES },
  });
}
const fails = (r, id) => r.entries.filter((e) => e.id === id && e.status === 'fail');
const sig = (es) => es.map((e) => [e.selector ?? e.file, e.scope, e.severity, e.line]);

const OUT_A = '.a { outline: none; }\n';
const OUT_B = '.b { outline: none; }\n';
const designWith = (onSurface) => '---\npignolo:\n  schema: 1\ncolors:\n  surface: "#FFFFFF"\n  on-surface: "' + onSurface + '"\n---\n';

test('1. an added defect is new and blocks; the old one is debt (alto)', async () => {
  const repo = makeRepo({ 'app.css': OUT_A });
  fs.writeFileSync(path.join(repo, 'app.css'), OUT_A + OUT_B);
  const r = await check(repo, { files: ['app.css'] });
  assert.deepEqual(sig(fails(r, 'STATE-04')), [['.a', 'debt', 'alto', 1], ['.b', 'new', 'bloquea', 2]]);
  assert.equal(r.exitCode, 1);
});

test('2. a moved line stays debt', async () => {
  const repo = makeRepo({ 'app.css': OUT_A });
  fs.writeFileSync(path.join(repo, 'app.css'), '/* x */\n'.repeat(10) + OUT_A);
  const r = await check(repo, { files: ['app.css'] });
  assert.deepEqual(sig(fails(r, 'STATE-04')), [['.a', 'debt', 'alto', 11]]);
  assert.equal(r.exitCode, 0);
});

test('3. multiset: one in the base, two now -> one debt and one new', async () => {
  const repo = makeRepo({ 'app.css': OUT_A });
  fs.writeFileSync(path.join(repo, 'app.css'), OUT_A + OUT_A);
  const r = await check(repo, { files: ['app.css'] });
  assert.deepEqual(sig(fails(r, 'STATE-04')), [['.a', 'debt', 'alto', 1], ['.a', 'new', 'bloquea', 2]]);
  assert.equal(r.exitCode, 1);
});

test('4. what was committed before fixing the base is debt', async () => {
  const repo = makeRepo({ 'app.css': '.z { color: red; }\n' });
  fs.writeFileSync(path.join(repo, 'app.css'), OUT_A);
  commitAll(repo);
  const r = await check(repo, { files: ['app.css'], base: 'HEAD' });
  assert.deepEqual(sig(fails(r, 'STATE-04')), [['.a', 'debt', 'alto', 1]]);
  assert.equal(r.exitCode, 0);
});

test('5. a file that does not exist in the base is all new', async () => {
  const repo = makeRepo({ 'other.css': '.z { color: red; }\n' });
  fs.writeFileSync(path.join(repo, 'app.css'), OUT_A);
  const r = await check(repo, { files: ['app.css'] });
  assert.deepEqual(sig(fails(r, 'STATE-04')), [['.a', 'new', 'bloquea', 1]]);
  assert.equal(r.exitCode, 1);
});

test('6. --base nope: exit 2, Spanish stderr, no ui-check.json', () => {
  const repo = makeRepo({ 'app.css': OUT_A });
  const run = path.join(repo, '.pignolo-ui', 'runs', 'r1');
  const r = runScript('ui-check.mjs', ['--project', repo, '--run', run, '--files', 'app.css', '--base', 'nope'], { cwd: repo });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /--base no es una ref válida: nope/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
  assert.equal(fs.existsSync(path.join(run, 'ui-check.json')), false);
});

test('7. without --base everything is new', async () => {
  const repo = makeRepo({ 'app.css': OUT_A });
  const r = await check(repo, { files: ['app.css'], base: null });
  assert.deepEqual(sig(fails(r, 'STATE-04')), [['.a', 'new', 'bloquea', 1]]);
  assert.equal(r.exitCode, 1);
});

test('8. CRLF in the base and LF now with the same content: nothing new', async () => {
  const repo = makeRepo({ 'app.css': '.a {\r\n  outline: none;\r\n}\r\n' });
  fs.writeFileSync(path.join(repo, 'app.css'), '.a {\n  outline: none;\n}\n');
  const r = await check(repo, { files: ['app.css'] });
  assert.deepEqual(fails(r, 'STATE-04').map((e) => e.scope), ['debt']);
  assert.equal(r.exitCode, 0);
});

test('9. tokens: broken in both -> debt; healthy in the base and broken now -> new', async () => {
  const a = makeRepo({ 'DESIGN.md': designWith('#8A8A8A') });
  fs.writeFileSync(path.join(a, 'DESIGN.md'), designWith('#949494'));
  const ra = await check(a, { files: [], design: 'DESIGN.md' });
  assert.deepEqual(sig(fails(ra, 'COLOR-03')), [['DESIGN.md', 'debt', 'alto', undefined]]);
  assert.equal(ra.exitCode, 0);

  const b = makeRepo({ 'DESIGN.md': designWith('#595959') });
  fs.writeFileSync(path.join(b, 'DESIGN.md'), designWith('#949494'));
  const rb = await check(b, { files: [], design: 'DESIGN.md' });
  assert.deepEqual(sig(fails(rb, 'COLOR-03')), [['DESIGN.md', 'new', 'bloquea', undefined]]);
  assert.equal(rb.exitCode, 1);
});

test('10. untouched sources: both runs see the same source list', async () => {
  const css = ':root { --surface: #ffffff; --on-surface: #8a8a8a; }\n';
  const repo = makeRepo({ 'globals.css': css, 'page.tsx': 'export const P = () => <p>a</p>;\n' });
  fs.writeFileSync(path.join(repo, 'page.tsx'), 'export const P = () => <p>b</p>;\n');
  const r = await check(repo, { files: ['page.tsx'] });
  assert.deepEqual(sig(fails(r, 'COLOR-03')), [['globals.css', 'debt', 'alto', undefined]]);
  assert.equal(r.exitCode, 0);
});

test('11. scopeRun evaluates the base with the injected evaluate and project-relative paths', async () => {
  const repo = makeRepo({ 'src/app.css': OUT_A });
  const seen = [];
  const evaluate = (dir, rels) => {
    seen.push([dir, rels, fs.readFileSync(path.join(dir, 'src/app.css'), 'utf8')]);
    return [{ id: 'STATE-04', status: 'fail', file: 'src/app.css', fingerprint: 'STATE-04|src/app.css|.a' }];
  };
  fs.writeFileSync(path.join(repo, 'src/app.css'), OUT_A + OUT_B);
  const base = await scopeRun({ project: repo, base: 'HEAD', relFiles: ['src/app.css'], sourceFiles: ['src/app.css', 'gone.css'], designRel: null, evaluate });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0][1], ['src/app.css']);
  assert.equal(seen[0][2], OUT_A);
  assert.equal(fs.existsSync(seen[0][0]), false, 'the temporary folder is removed');
  assert.deepEqual(base.map((e) => e.fingerprint), ['STATE-04|src/app.css|.a']);

  // through runCheck the base fingerprints are project-relative, so the current one matches
  const r = await check(repo, { files: ['src/app.css'] });
  assert.deepEqual(sig(fails(r, 'STATE-04')), [['.a', 'debt', 'alto', 1], ['.b', 'new', 'bloquea', 2]]);
});

test('materializeBase: files at the ref, missing ones listed, invalid ref throws', () => {
  const repo = makeRepo({ 'a/x.css': 'x\n' });
  fs.writeFileSync(path.join(repo, 'a/x.css'), 'changed\n');
  const { dir, missing } = materializeBase({ project: repo, ref: 'HEAD', relPaths: ['a/x.css', 'nope.css', '../escape.css'] });
  try {
    assert.equal(fs.readFileSync(path.join(dir, 'a', 'x.css'), 'utf8'), 'x\n');
    assert.deepEqual([...missing].sort(), ['../escape.css', 'nope.css']);
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())) || fs.realpathSync(dir).startsWith(fs.realpathSync(os.tmpdir())));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.throws(() => materializeBase({ project: repo, ref: 'nope', relPaths: [] }), /--base no es una ref válida: nope/);
  assert.throws(() => materializeBase({ project: repo, ref: '--output=x', relPaths: [] }), /--base no es una ref válida/);
});

test('classifyScope: only fails are classified, in line order', () => {
  const e = (status, line, fp = 'F') => ({ id: 'X', status, line, fingerprint: fp });
  const out = classifyScope(
    [e('fail', 9), e('fail', 3), e('pass', 1, 'P'), e('unverified', 2, 'U')],
    [e('fail', 1), e('pass', 1, 'P'), e('fail', 1, 'other')],
  );
  assert.deepEqual(out.map((x) => [x.status, x.line, x.scope]), [['fail', 9, 'new'], ['fail', 3, 'debt'], ['pass', 1, 'new'], ['unverified', 2, 'new']]);
  assert.deepEqual(classifyScope([e('fail', 1)], null).map((x) => x.scope), ['new']);
});
