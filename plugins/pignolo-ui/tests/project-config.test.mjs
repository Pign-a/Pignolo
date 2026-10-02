import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoIdFor, readConfig, writeConfig, canvasOf, firstByState, ConfigError } from '../lib/project-config.mjs';
import { makeTempDir } from './helpers.mjs';

function makeRepo() {
  const dir = makeTempDir();
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

function expectedId(repo) {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repo, encoding: 'utf8' }).trim();
  let r = path.resolve(common).replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') r = r.toLowerCase();
  return crypto.createHash('sha256').update(r).digest('hex').slice(0, 16);
}

test('repoIdFor matches the core formula and is stable across subdirectories', () => {
  const repo = makeRepo();
  const id = repoIdFor(repo);
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.equal(id, expectedId(repo));
  fs.mkdirSync(path.join(repo, 'sub'));
  assert.equal(repoIdFor(path.join(repo, 'sub')), id);
  assert.notEqual(repoIdFor(makeRepo()), id);
});

test('repoIdFor without git falls back to <project>/.git', () => {
  const dir = makeTempDir();
  const id = repoIdFor(dir, { run: () => { throw new Error('no git'); } });
  let r = path.resolve(dir, '.git').replace(/\\/g, '/');
  if (process.platform === 'win32') r = r.toLowerCase();
  assert.equal(id, crypto.createHash('sha256').update(r).digest('hex').slice(0, 16));
});

test('writeConfig stores closed keys and reads them back; no tmp file is left', () => {
  const repo = makeRepo();
  const data = makeTempDir();
  const w = writeConfig({ data, project: repo, key: 'devUrl', value: 'http://localhost:3000' });
  assert.equal(readConfig({ data, project: repo }).config.devUrl, 'http://localhost:3000');
  writeConfig({ data, project: repo, key: 'publish', value: 'never' });
  writeConfig({ data, project: repo, key: 'routes', value: ['index.html', 'a/b'] });
  const cfg = readConfig({ data, project: repo }).config;
  assert.equal(cfg.publish, 'never');
  assert.equal(cfg.devUrl, 'http://localhost:3000');
  assert.deepEqual(fs.readdirSync(path.dirname(w.file)).filter((n) => n.endsWith('.tmp')), []);
});

test('writeConfig rejects bad keys and values with ConfigError', () => {
  const repo = makeRepo();
  const data = makeTempDir();
  const bad = (key, value) => assert.throws(() => writeConfig({ data, project: repo, key, value }), ConfigError);
  bad('devUrl', 'https://example.com');
  bad('routes', ['../x']);
  bad('routes', ['/abs']);
  bad('foo', 'x');
  bad('publish', 'maybe');
  bad('canvasConsent', true);
  bad('presentation', 'local');
  bad('referencePath', '../out');
});

test('a broken project.json makes readConfig throw, never return {}', () => {
  const repo = makeRepo();
  const data = makeTempDir();
  const { file } = readConfig({ data, project: repo });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ nope');
  assert.throws(() => readConfig({ data, project: repo }), ConfigError);
  assert.throws(() => writeConfig({ data, project: repo, key: 'publish', value: 'never' }), ConfigError);
});

function seed(repo, data, config) {
  const { file } = readConfig({ data, project: repo });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config));
  return file;
}

test('publish: auto and never read back; readConfig reports the opt-out (A4C-01)', () => {
  const repo = makeRepo();
  const data = makeTempDir();
  assert.equal(readConfig({ data, project: repo }).optOut, null);
  writeConfig({ data, project: repo, key: 'publish', value: 'auto' });
  assert.equal(readConfig({ data, project: repo }).optOut, null);
  writeConfig({ data, project: repo, key: 'publish', value: 'never' });
  assert.equal(readConfig({ data, project: repo }).optOut, 'project-opt-out');
  seed(repo, data, { publish: 'maybe' });
  assert.equal(readConfig({ data, project: repo }).optOut, 'project-opt-out', 'a hand-edited value fails closed');
});

test('a legacy canvasConsent is read without error and is dropped by any writeConfig (A4C-17 a)', () => {
  const repo = makeRepo();
  const data = makeTempDir();
  const file = seed(repo, data, { canvasConsent: true, devUrl: 'http://localhost:3000' });
  assert.equal(readConfig({ data, project: repo }).optOut, null);
  writeConfig({ data, project: repo, key: 'routes', value: ['a'] });
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal('canvasConsent' in stored, false);
  assert.equal(stored.devUrl, 'http://localhost:3000');
  assert.equal('publish' in stored, false, 'a true is only dropped');
});

test('a legacy canvasConsent: false counts as a no and survives as publish: never (A4C2-17)', () => {
  const repo = makeRepo();
  const data = makeTempDir();
  const file = seed(repo, data, { canvasConsent: false });
  assert.equal(readConfig({ data, project: repo }).optOut, 'legacy-consent-declined');
  writeConfig({ data, project: repo, key: 'devUrl', value: 'http://localhost:3000' });
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual([stored.publish, 'canvasConsent' in stored], ['never', false]);
  assert.equal(readConfig({ data, project: repo }).optOut, 'project-opt-out');
  // an explicit publish wins over the legacy no
  const file2 = seed(repo, data, { canvasConsent: false, publish: 'auto' });
  writeConfig({ data, project: repo, key: 'routes', value: ['a'] });
  assert.equal(JSON.parse(fs.readFileSync(file2, 'utf8')).publish, 'auto');
});

const CANVAS = { url: 'https://claude.ai/artifact/abc123-DEF_456', state: 'published', pages: 2, files: 14, bytes: 40000, notes: 6, dsInstalledSha256: 'a'.repeat(64), launchPage: 'r-202610011800-a1b2c3' };

test('T4b: canvas is a closed key: it reads back, the address loses query and fragment, and anything else is a ConfigError', () => {
  const repo = makeRepo();
  const data = makeTempDir();
  writeConfig({ data, project: repo, key: 'canvas', value: CANVAS });
  assert.deepEqual(readConfig({ data, project: repo }).config.canvas, CANVAS);
  writeConfig({ data, project: repo, key: 'canvas', value: { ...CANVAS, url: 'https://claude.ai/code/artifact/abcd-1234?x=1#frag' } });
  assert.equal(readConfig({ data, project: repo }).config.canvas.url, 'https://claude.ai/code/artifact/abcd-1234');
  const { dsInstalledSha256, launchPage, ...minimal } = CANVAS;
  writeConfig({ data, project: repo, key: 'canvas', value: minimal });
  const bad = (value) => assert.throws(() => writeConfig({ data, project: repo, key: 'canvas', value }), ConfigError);
  bad({ ...CANVAS, url: 'https://example.com/artifact/abc' });
  bad({ ...CANVAS, url: 'http://claude.ai/artifact/abc' });
  bad({ ...CANVAS, url: 'https://claude.ai/artifact/' });
  bad({ ...CANVAS, state: 'draft' });
  bad({ ...CANVAS, pages: -1 });
  bad({ ...CANVAS, files: 1.5 });
  bad({ ...CANVAS, bytes: '10' });
  bad({ ...CANVAS, notes: null });
  bad({ ...CANVAS, dsInstalledSha256: 'xyz' });
  bad({ ...CANVAS, launchPage: 'a b' });
  bad({ ...CANVAS, extra: 1 });
  bad('https://claude.ai/artifact/abc');
  bad(null);
  bad([]);
});

test('T4b: canvasOf and firstByState: no canvas, created and zero pages open the canvas; a stored value that is not valid fails closed', () => {
  assert.deepEqual(canvasOf({}), { canvas: null, problem: null });
  assert.deepEqual(canvasOf({ canvas: CANVAS }), { canvas: CANVAS, problem: null });
  assert.deepEqual(canvasOf({ canvas: { ...CANVAS, pages: -1 } }), { canvas: null, problem: 'canvas-state-invalid' });
  assert.deepEqual(canvasOf({ canvas: 'x' }), { canvas: null, problem: 'canvas-state-invalid' });
  assert.deepEqual(canvasOf({ canvas: { ...CANVAS, url: 'https://claude.ai/artifact/abc?x=1' } }).problem, 'canvas-state-invalid', 'a hand-edited address with a query is not trusted');
  assert.equal(firstByState(null), true);
  assert.equal(firstByState({ ...CANVAS, state: 'created' }), true);
  assert.equal(firstByState({ ...CANVAS, pages: 0 }), true);
  assert.equal(firstByState(CANVAS), false);
});
