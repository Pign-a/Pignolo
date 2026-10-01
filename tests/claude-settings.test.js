'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { makeRepo, makeTempDir, git } = require('./helpers');

const S = require('../plugins/pignolo/lib/claude-settings');

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const homeEnv = (extra = {}) => ({ ...process.env, PIGNOLO_HOME: makeTempDir('pignolo-shome-'), CLAUDE_CONFIG_DIR: makeTempDir('pignolo-scfg-'), ...extra });
const porcelain = (repo) => git(['status', '--porcelain', '--untracked-files=all'], repo);
const target = (repo) => path.join(repo, '.claude', 'settings.local.json');
const put = (repo, text) => { fs.mkdirSync(path.join(repo, '.claude'), { recursive: true }); fs.writeFileSync(target(repo), text); };
const listAll = (dir) => fs.readdirSync(dir, { recursive: true }).map(String).sort();

test('constants', () => {
  assert.equal(S.AUTO_MEMORY_KEY, 'autoMemoryEnabled');
  assert.equal(S.settingsLocalPath('/r'), path.join('/r', '.claude', 'settings.local.json'));
});

test('absent file: created with only the key, no backup, .claude created', () => {
  const repo = makeRepo();
  const r = S.applyAutoMemoryOff({ main: repo, env: homeEnv() });
  assert.equal(r.status, 'done');
  assert.equal(r.backup, undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(target(repo), 'utf8')), { autoMemoryEnabled: false });
});

test('keeps the rest of the JSON identical, backs up outside the repo', () => {
  const repo = makeRepo();
  const env = homeEnv();
  const original = JSON.stringify({ permissions: { deny: ['Bash(rm:*)'] }, env: { A: '1' } }, null, 4);
  put(repo, original);
  const r = S.applyAutoMemoryOff({ main: repo, env });
  assert.equal(r.status, 'done');
  const after = JSON.parse(fs.readFileSync(target(repo), 'utf8'));
  assert.deepEqual(after.permissions, { deny: ['Bash(rm:*)'] });
  assert.deepEqual(after.env, { A: '1' });
  assert.equal(after.autoMemoryEnabled, false);
  assert.deepEqual(Object.keys(after), ['permissions', 'env', 'autoMemoryEnabled']);
  assert.match(fs.readFileSync(target(repo), 'utf8'), /^ {4}"permissions"/m, 'indent kept');
  assert.ok(r.backup.startsWith(env.PIGNOLO_HOME));
  assert.equal(fs.readFileSync(r.backup, 'utf8'), original);
  assert.ok(!/init-backup|pignolo-bak|\.tmp/.test(porcelain(repo)));
});

test('already false: skipped without backup; true: changed and the backup keeps true', () => {
  const repo = makeRepo();
  const env = homeEnv();
  put(repo, '{ "autoMemoryEnabled": false }');
  const s = S.applyAutoMemoryOff({ main: repo, env });
  assert.equal(s.status, 'skipped');
  assert.equal(s.reason, 'already-set');
  assert.equal(s.backup, undefined);
  const repo2 = makeRepo();
  put(repo2, '{ "autoMemoryEnabled": true }');
  const d = S.applyAutoMemoryOff({ main: repo2, env });
  assert.equal(d.status, 'done');
  assert.equal(JSON.parse(fs.readFileSync(d.backup, 'utf8')).autoMemoryEnabled, true);
  assert.equal(JSON.parse(fs.readFileSync(target(repo2), 'utf8')).autoMemoryEnabled, false);
});

test('invalid JSON and non-objects are refused untouched; a BOM is read and kept', () => {
  const env = homeEnv();
  const bad = makeRepo();
  put(bad, '{ "a": ');
  const h = sha(target(bad));
  const r = S.applyAutoMemoryOff({ main: bad, env });
  assert.equal(r.status, 'refused');
  assert.equal(r.reason, 'invalid-json');
  assert.equal(sha(target(bad)), h);
  assert.equal(r.backup, undefined);
  const arr = makeRepo();
  put(arr, '[]');
  assert.equal(S.applyAutoMemoryOff({ main: arr, env }).reason, 'not-an-object');
  const bom = makeRepo();
  put(bom, '﻿{ "a": 1 }');
  const b = S.applyAutoMemoryOff({ main: bom, env });
  assert.equal(b.status, 'done');
  const out = fs.readFileSync(target(bom), 'utf8');
  assert.equal(out.charCodeAt(0), 0xFEFF);
  assert.equal(JSON.parse(out.slice(1)).a, 1);
});

test('atomic write: a failing rename leaves the original byte-identical and no .tmp behind (A8-12)', () => {
  const repo = makeRepo();
  put(repo, '{ "keep": 1 }');
  const h = sha(target(repo));
  const failing = { ...fs, renameSync: () => { throw new Error('rename forzado'); } };
  const r = S.applyAutoMemoryOff({ main: repo, env: homeEnv(), fs: failing });
  assert.equal(r.status, 'refused');
  assert.match(r.reason, /write-failed/);
  assert.equal(sha(target(repo)), h);
  assert.deepEqual(listAll(path.join(repo, '.claude')), ['settings.local.json']);
});

test('planAutoMemoryOff notes env-forces-on only with the variable explicitly false', () => {
  const repo = makeRepo();
  assert.ok(S.planAutoMemoryOff({ main: repo, env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: 'false' } }).notes.includes('env-forces-on'));
  assert.deepEqual(S.planAutoMemoryOff({ main: repo, env: {} }).notes, []);
  assert.equal(S.planAutoMemoryOff({ main: repo, env: {} }).change, 'set');
});

test('gitIgnoredStatus: true when ignored, false in a fresh repo, unknown without git', () => {
  const a = makeRepo();
  fs.writeFileSync(path.join(a, '.gitignore'), '.claude/settings.local.json\n');
  assert.equal(S.gitIgnoredStatus({ main: a }).ignored, true);
  assert.equal(S.gitIgnoredStatus({ main: makeRepo() }).ignored, false);
  assert.equal(S.gitIgnoredStatus({ main: makeTempDir('pignolo-norepo-') }).ignored, 'unknown');
  assert.equal(S.gitIgnoredStatus({ main: a, run: () => { throw new Error('sin git'); } }).ignored, 'unknown');
});

test('only <main>/.claude/settings.local.json changes; the user config dir is untouched', () => {
  const repo = makeRepo();
  const env = homeEnv();
  fs.writeFileSync(path.join(env.CLAUDE_CONFIG_DIR, 'settings.json'), '{"x":1}');
  const beforeCfg = listAll(env.CLAUDE_CONFIG_DIR);
  const beforeCfgHash = sha(path.join(env.CLAUDE_CONFIG_DIR, 'settings.json'));
  const beforeRepo = listAll(repo).filter((f) => !f.startsWith('.git'));
  S.applyAutoMemoryOff({ main: repo, env });
  assert.deepEqual(listAll(env.CLAUDE_CONFIG_DIR), beforeCfg);
  assert.equal(sha(path.join(env.CLAUDE_CONFIG_DIR, 'settings.json')), beforeCfgHash);
  const afterRepo = listAll(repo).filter((f) => !f.startsWith('.git'));
  assert.deepEqual(afterRepo.filter((f) => !beforeRepo.includes(f)), ['.claude', path.join('.claude', 'settings.local.json')]);
});

test('dry run reports would-do and writes nothing', () => {
  const repo = makeRepo();
  assert.equal(S.applyAutoMemoryOff({ main: repo, env: homeEnv(), dry: true }).status, 'would-do');
  assert.equal(fs.existsSync(target(repo)), false);
});

// Protects: m-3 · Breaks if: un settings.local.json CRLF o sin salto final se reescribe a LF con salto final.
test('keeps CRLF endings and a missing final newline', () => {
  const repo = makeRepo();
  put(repo, '{\r\n  "a": 1\r\n}');
  const r = S.applyAutoMemoryOff({ main: repo, env: homeEnv() });
  assert.equal(r.status, 'done');
  assert.equal(fs.readFileSync(target(repo), 'utf8'), '{\r\n  "a": 1,\r\n  "autoMemoryEnabled": false\r\n}');
  const lf = makeRepo();
  put(lf, '{\n  "a": 1\n}\n');
  S.applyAutoMemoryOff({ main: lf, env: homeEnv() });
  assert.equal(fs.readFileSync(target(lf), 'utf8'), '{\n  "a": 1,\n  "autoMemoryEnabled": false\n}\n');
});

// --- G31 (decisión del autor, 2026-10-01): el archivo se agrega a .git/info/exclude ---
const excludeFile = (repo) => path.join(repo, '.git', 'info', 'exclude');
const excludeText = (repo) => { try { return fs.readFileSync(excludeFile(repo), 'utf8'); } catch (_) { return ''; } };
const LINE = '/.claude/settings.local.json';
const countLine = (repo) => excludeText(repo).split(/\r?\n/).filter((l) => l === LINE).length;
// Protects: G31 · Breaks if: auto-memory-off escribe settings.local.json sin ignorarlo y el tripwire claude-config sube el primer flujo.
test('G31: writing settings.local.json adds it to .git/info/exclude, once; preview shows it and writes nothing', () => {
  const repo = makeRepo();
  const env = homeEnv();
  const dry = S.applyAutoMemoryOff({ main: repo, env, dry: true });
  assert.equal(dry.status, 'would-do');
  assert.equal(dry.exclude, true);
  assert.equal(countLine(repo), 0);
  assert.ok(!fs.existsSync(target(repo)));
  const r = S.applyAutoMemoryOff({ main: repo, env });
  assert.equal(r.status, 'done');
  assert.equal(r.exclude, true);
  assert.equal(countLine(repo), 1);
  assert.equal(porcelain(repo), '', 'git ya no lo ve');
  assert.equal(S.gitIgnoredStatus({ main: repo }).ignored, true);
  assert.equal(S.applyAutoMemoryOff({ main: repo, env }).status, 'skipped');
  assert.equal(countLine(repo), 1, 'idempotente');
});

test('G31: already ignored -> no duplicate line; tracked -> untouched and reported; existing exclude lines are kept', () => {
  const ign = makeRepo();
  fs.writeFileSync(path.join(ign, '.gitignore'), '.claude/settings.local.json\n');
  const r1 = S.applyAutoMemoryOff({ main: ign, env: homeEnv() });
  assert.equal(r1.status, 'done');
  assert.equal(r1.exclude, false);
  assert.equal(countLine(ign), 0);

  const tr = makeRepo();
  put(tr, '{"a":1}');
  git(['add', '-f', '.claude/settings.local.json'], tr);
  git(['commit', '-q', '-m', 'tracked'], tr);
  const r2 = S.applyAutoMemoryOff({ main: tr, env: homeEnv() });
  assert.equal(r2.exclude, false);
  assert.equal(r2.excludeSkipped, 'tracked');
  assert.equal(countLine(tr), 0);

  const keep = makeRepo();
  fs.mkdirSync(path.dirname(excludeFile(keep)), { recursive: true });
  fs.writeFileSync(excludeFile(keep), '# mío\r\n*.log');
  S.applyAutoMemoryOff({ main: keep, env: homeEnv() });
  assert.equal(excludeText(keep), `# mío\r\n*.log\r\n${LINE}\r\n`);
});

test('G31: the exclude is the common one, so it also holds from a linked worktree', () => {
  const repo = makeRepo();
  S.applyAutoMemoryOff({ main: repo, env: homeEnv() });
  const wt = path.join(makeTempDir('pignolo-wtx-'), 'wt');
  git(['worktree', 'add', '-q', wt, '-b', 'wtx'], repo);
  assert.equal(git(['check-ignore', '.claude/settings.local.json'], wt), '.claude/settings.local.json');
});
