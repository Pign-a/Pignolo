import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoIdFor, readConfig, writeConfig, ConfigError } from '../lib/project-config.mjs';
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
  writeConfig({ data, project: repo, key: 'routes', value: ['index.html', 'a/b'] });
  writeConfig({ data, project: repo, key: 'referencePath', value: 'design/ref.png' });
  const cfg = readConfig({ data, project: repo }).config;
  assert.deepEqual(cfg.routes, ['index.html', 'a/b']);
  assert.equal(cfg.referencePath, 'design/ref.png');
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
  // the keys of publishing to a canvas are not the audit's: refused, not stored
  for (const key of ['publish', 'canvas', 'canvasConsent', 'presentation']) bad(key, 'never');
  bad('referencePath', '../out');
});

test('a broken project.json makes readConfig throw, never return {}', () => {
  const repo = makeRepo();
  const data = makeTempDir();
  const { file } = readConfig({ data, project: repo });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ nope');
  assert.throws(() => readConfig({ data, project: repo }), ConfigError);
  assert.throws(() => writeConfig({ data, project: repo, key: 'devUrl', value: 'http://localhost:3000' }), ConfigError);
});

function seed(repo, data, config) {
  const { file } = readConfig({ data, project: repo });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config));
  return file;
}

test('keys that another version wrote (publish, canvas, canvasConsent) are read as they are and survive a write of an audit key', () => {
  const repo = makeRepo();
  const data = makeTempDir();
  const old = { publish: 'never', canvasConsent: false, canvas: { url: 'https://claude.ai/artifact/x', state: 'created' }, devUrl: 'http://localhost:3000' };
  const file = seed(repo, data, old);
  assert.deepEqual(readConfig({ data, project: repo }).config, old);
  assert.equal('optOut' in readConfig({ data, project: repo }), false);
  writeConfig({ data, project: repo, key: 'routes', value: ['a'] });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { ...old, routes: ['a'] });
});
