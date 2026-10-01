'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir, git } = require('./helpers');

const { detectProject, isInstallerPlaceholder, STACKS } = require('../plugins/pignolo/lib/init-detect');

function proj(files) {
  const dir = makeTempDir('pignolo-detect-');
  for (const [rel, content] of Object.entries(files)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  }
  return dir;
}
const pkg = (o) => JSON.stringify(o);
const NODE = { scripts: { test: 'vitest run', lint: 'eslint .', typecheck: 'tsc --noEmit' }, devDependencies: { vitest: '^1' } };

test('STACKS lists the seven stacks', () => {
  assert.deepEqual([...STACKS], ['node', 'python', 'go', 'rust', 'flutter', 'docs', 'script']);
});

test('node + vitest + npm lock: tested, gates, install and sources', () => {
  const d = detectProject({ root: proj({ 'package.json': pkg(NODE), 'package-lock.json': '{}', 'src/a.test.ts': '' }) });
  assert.equal(d.type, 'code-tested');
  assert.equal(d.packageManager, 'npm');
  assert.equal(d.gates['on-done'], 'npm run test && npm run typecheck');
  assert.equal(d.gates['pre-merge'], 'npm run test && npm run typecheck && npm run lint');
  assert.equal(d.gates['on-edit'], 'npm run typecheck');
  assert.equal(d.depsInstall, 'npm ci');
  assert.ok(d.runners.includes('vitest'));
  assert.match(d.sources.type, /package\.json/);
});

test('package managers by lockfile (table)', () => {
  const cases = [
    ['pnpm-lock.yaml', 'pnpm run test && pnpm run typecheck', 'pnpm install --frozen-lockfile', 'pnpm'],
    ['yarn.lock', 'yarn run test && yarn run typecheck', 'yarn install --frozen-lockfile', 'yarn'],
    ['bun.lock', 'bun run test && bun run typecheck', 'bun install --frozen-lockfile', 'bun'],
  ];
  for (const [lock, onDone, install, pm] of cases) {
    const d = detectProject({ root: proj({ 'package.json': pkg(NODE), [lock]: '', 'src/a.test.ts': '' }) });
    assert.equal(d.gates['on-done'], onDone, lock);
    assert.equal(d.depsInstall, install, lock);
    assert.equal(d.packageManager, pm);
  }
  const none = detectProject({ root: proj({ 'package.json': pkg(NODE), 'src/a.test.ts': '' }) });
  assert.equal(none.depsInstall, null);
  assert.equal(none.packageManager, 'npm');
});

test('installer placeholder is not a gate, even with a test file present', () => {
  const p = { scripts: { test: 'echo "Error: no test specified" && exit 1' } };
  assert.equal(isInstallerPlaceholder(p.scripts.test), true);
  for (const files of [{ 'package.json': pkg(p) }, { 'package.json': pkg(p), 'src/a.test.ts': '' }]) {
    const d = detectProject({ root: proj(files) });
    assert.equal(d.type, 'code-untested');
    assert.equal(d.gates['on-done'], undefined);
    assert.ok(d.warnings.some((w) => /placeholder/.test(w)));
  }
});

test('real test script but no test file: code-untested with a warning', () => {
  const d = detectProject({ root: proj({ 'package.json': pkg(NODE) }) });
  assert.equal(d.type, 'code-untested');
  assert.equal(d.gates['on-done'], undefined);
  assert.ok(d.warnings.some((w) => /ningún test/.test(w)));
});

test('python, go, rust and flutter/dart', () => {
  const py = detectProject({ root: proj({ 'pyproject.toml': '[project]\nname="a"\n', 'tests/test_a.py': '', 'uv.lock': '' }) });
  assert.equal(py.type, 'code-tested');
  assert.equal(py.gates['on-done'], 'python -m pytest -q');
  assert.equal(py.depsInstall, 'uv sync --frozen');
  assert.ok(py.testPaths.includes('tests/'));
  assert.ok(!py.testPaths.includes('conftest.py'));
  const go = detectProject({ root: proj({ 'go.mod': 'module a\n', 'a_test.go': '' }) });
  assert.equal(go.gates['on-done'], 'go test ./...');
  assert.ok(go.testPaths.includes('*_test.go'));
  assert.ok(!go.testPaths.includes('testdata/'));
  const rs = detectProject({ root: proj({ 'Cargo.toml': '[package]\n', 'tests/it.rs': '' }) });
  assert.equal(rs.gates['on-done'], 'cargo test');
  const fl = detectProject({ root: proj({ 'pubspec.yaml': 'name: a\nflutter:\n  uses-material-design: true\n', 'test/a_test.dart': '' }) });
  assert.equal(fl.gates['on-done'], 'flutter test');
  assert.equal(fl.depsInstall, 'flutter pub get');
  const dart = detectProject({ root: proj({ 'pubspec.yaml': 'name: a\n', 'test/a_test.dart': '' }) });
  assert.equal(dart.gates['on-done'], 'dart test');
});

test('docs, script and empty directory', () => {
  assert.equal(detectProject({ root: proj({ 'README.md': '#', 'docs/a.md': '#' }) }).type, 'docs');
  assert.deepEqual(detectProject({ root: proj({ 'README.md': '#' }) }).gates, {});
  assert.equal(detectProject({ root: proj({ 'run.sh': 'echo' }) }).type, 'script');
  const e = detectProject({ root: proj({}) });
  assert.equal(e.type, null);
  assert.deepEqual(e.stacks, []);
  assert.ok(e.warnings.some((w) => /sin manifiesto reconocido/.test(w)));
});

test('risk paths and contracts only when they exist', () => {
  const d = detectProject({ root: proj({ 'prisma/schema.prisma': '', '.github/workflows/ci.yml': '', 'openapi.yaml': '' }) });
  assert.ok(d.highRiskPaths.includes('prisma/'));
  assert.ok(d.highRiskPaths.includes('.github/workflows/'));
  assert.ok(d.contracts.includes('prisma/schema.prisma'));
  assert.ok(d.contracts.includes('openapi.yaml'));
  const none = detectProject({ root: proj({ 'a.txt': 'x' }) });
  assert.deepEqual([none.highRiskPaths, none.contracts, none.costPaths, none.visiblePaths, none.serialPaths], [[], [], [], [], []]);
});

test('protectedTestConfig: runner configs, package.json only with a real test script', () => {
  const d = detectProject({ root: proj({ 'package.json': pkg(NODE), 'vitest.config.ts': '', 'stryker.conf.json': '{}' }) });
  for (const f of ['vitest.config.ts', 'package.json', 'stryker.conf.json']) assert.ok(d.protectedTestConfig.includes(f), f);
  const ph = detectProject({ root: proj({ 'package.json': pkg({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) }) });
  assert.ok(!ph.protectedTestConfig.includes('package.json'));
});

test('domainRules lists paths without reading them and drops links leaving the repo', (t) => {
  const outside = proj({ 'secret.md': 'afuera' });
  const root = proj({ 'package.json': pkg(NODE), 'CLAUDE.md': 'TOKEN', '.claude/rules/a.md': 'x', 'docs/sessions/2026-01-01.md': 'y' });
  let linked = true;
  try { fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'AGENTS.md')); } catch (_) { linked = false; }
  const reads = [];
  const spy = { ...fs, readFileSync: (f, ...r) => { reads.push(String(f)); return fs.readFileSync(f, ...r); } };
  const d = detectProject({ root, fs: spy });
  assert.deepEqual(d.domainRules.sort(), ['.claude/rules/a.md', 'CLAUDE.md', 'docs/sessions/2026-01-01.md']);
  assert.ok(reads.some((f) => f.endsWith('package.json')), 'the spy saw other reads');
  assert.ok(!reads.some((f) => /CLAUDE\.md|rules|sessions/.test(f)), 'domain rules are not read');
  if (!linked) t.diagnostic('symlinks not permitted here: outside-link case not exercised');
});

test('runnerExcludes per runner', () => {
  const v = detectProject({ root: proj({ 'package.json': pkg(NODE) }) });
  const vi = v.runnerExcludes.find((r) => r.runner === 'vitest');
  assert.equal(vi.walksDotDirs, 'yes');
  assert.ok(vi.snippet.includes('.pignolo/**'));
  const j = detectProject({ root: proj({ 'package.json': pkg({ scripts: { test: 'jest' }, devDependencies: { jest: '1' } }) }) });
  assert.ok(j.runnerExcludes.find((r) => r.runner === 'jest').snippet.includes('/.pignolo/'));
  assert.equal(detectProject({ root: proj({ 'go.mod': 'module a\n' }) }).runnerExcludes[0].walksDotDirs, 'no');
  const n = detectProject({ root: proj({ 'package.json': pkg({ scripts: { test: 'node --test' } }) }) });
  assert.equal(n.runnerExcludes.find((r) => r.runner === 'node-test').walksDotDirs, 'unknown');
});

test('mutation only when the tool is already declared', () => {
  const d = detectProject({ root: proj({ 'package.json': pkg({ scripts: { test: 'vitest run' }, devDependencies: { '@stryker-mutator/core': '8', vitest: '1' } }), 'stryker.conf.json': '{}' }) });
  assert.equal(d.mutation.tool, 'stryker');
  assert.ok(d.mutation.configSnippet.includes('PIGNOLO_MUTATE_FILES'));
  assert.equal(d.mutation.thresholdFile, 'stryker.conf.json');
  assert.equal(detectProject({ root: proj({ 'package.json': pkg(NODE) }) }).mutation, null);
});

test('detect runs nothing from the project; git is only read-only', () => {
  const root = proj({ 'package.json': pkg({ scripts: { postinstall: 'node boom.js', test: 'vitest run' } }), 'boom.js': "require('fs').writeFileSync('MARK','x')" });
  git(['init', '-q', '-b', 'main'], root);
  const calls = [];
  const run = (args, opts) => { calls.push(args); return git(args, opts.cwd); };
  detectProject({ root, run });
  assert.ok(calls.length > 0);
  assert.ok(calls.every((a) => ['ls-files', 'check-ignore'].includes(a[0])), JSON.stringify(calls));
  assert.equal(fs.existsSync(path.join(root, 'MARK')), false);
});

test('unreadable package.json: warning, no node stack, no throw', () => {
  const d = detectProject({ root: proj({ 'package.json': '{"scripts": {' }) });
  assert.ok(d.warnings.some((w) => /package\.json ilegible/.test(w)));
  assert.ok(!d.stacks.includes('node'));
});
