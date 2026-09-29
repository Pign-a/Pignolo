'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git, PLUGIN_ROOT, runLauncher } = require('./helpers');
const ss = require('../plugins/pignolo/hooks/handlers/session-start');
const { seedShadow } = require('../plugins/pignolo/lib/git-backup');

const backups = (repo) => git(['for-each-ref', '--format=%(refname)', 'refs/pignolo/backup'], repo);

function withTempHandler(name, source, fn) {
  const file = path.join(PLUGIN_ROOT, 'hooks', 'handlers', `${name}.js`);
  fs.writeFileSync(file, source);
  try { return fn(); } finally { fs.rmSync(file, { force: true }); }
}

test('healthy guard: no canary warning; startup backs up refs', () => {
  const repo = makeRepo();
  const r = ss.run({ source: 'startup', cwd: repo }, { env: { PIGNOLO_HOME: makeTempDir() } });
  assert.strictEqual(r.exit, 0);
  const out = JSON.parse(r.stdout);
  assert.doesNotMatch(out.systemMessage, /guardia NO bloqueó/);
  assert.doesNotMatch(out.systemMessage, /respaldo de/);
  assert.ok(backups(repo).length > 0);
});

// Protects: spec §8.3, callados en el éxito (G12, auditoría 3) · Breaks if: un arranque
// sano, con la sombra ya sembrada, agrega systemMessage o additionalContext.
test('a healthy startup with the shadow already seeded says nothing', () => {
  const repo = makeRepo();
  const env = { PIGNOLO_HOME: makeTempDir() };
  seedShadow({ cwd: repo, env: { ...process.env, ...env }, sessionId: 's' });
  const r = ss.run({ source: 'startup', cwd: repo, session_id: 's' }, { env });
  assert.deepStrictEqual([r.exit, r.stdout], [0, '']);
  assert.ok(backups(repo).length > 0);
});

test('fork also backs up refs (H17)', () => {
  const repo = makeRepo();
  ss.run({ source: 'fork', cwd: repo }, { env: { PIGNOLO_HOME: makeTempDir() } });
  assert.ok(backups(repo).length > 0);
});

test('a handler that exits 0 is reported by the canary', () => {
  withTempHandler('_tmp-open-guard', 'exports.run = () => ({ exit: 0 });', () => {
    const r = ss.run({ source: 'resume', cwd: makeTempDir() }, { env: { PIGNOLO_HOME: makeTempDir() }, canaryHandler: '_tmp-open-guard' });
    assert.match(JSON.parse(r.stdout).systemMessage, /guardia NO bloqueó/);
  });
});

// H8: el launcher sale con 2 si no encuentra el handler; eso NO es una guardia sana.
test('a missing guard handler is reported by the canary', () => {
  const r = ss.run({ source: 'resume', cwd: makeTempDir() }, { env: { PIGNOLO_HOME: makeTempDir() }, canaryHandler: 'no-existe' });
  assert.match(JSON.parse(r.stdout).systemMessage, /guardia NO bloqueó/);
});

test('a handler that exits 2 without the guard message is reported by the canary', () => {
  withTempHandler('_tmp-mute-guard', 'exports.run = () => ({ exit: 2, stderr: "otra cosa" });', () => {
    const r = ss.run({ source: 'resume', cwd: makeTempDir() }, { env: { PIGNOLO_HOME: makeTempDir() }, canaryHandler: '_tmp-mute-guard' });
    assert.match(JSON.parse(r.stdout).systemMessage, /guardia NO bloqueó/);
  });
});

// Protects: canario §8.4, una prueba por familia · Breaks if: SessionStart prueba solo git reset --hard
// o no dice qué familia está caída.
test('the canary runs one planted command per family and names the family that is down (spec §8.4)', () => {
  withTempHandler('_tmp-open-paths', 'exports.run = () => ({ exit: 0 });', () => {
    const r = ss.run({ source: 'status', cwd: makeTempDir() },
      { env: { PIGNOLO_HOME: makeTempDir() }, canaryHandlers: { 'protect-paths': '_tmp-open-paths' } });
    const msg = JSON.parse(r.stdout).systemMessage;
    assert.match(msg, /^⚠ pignolo: la guardia NO bloqueó el comando de prueba de: Edit\/Write protegido\./m);
    assert.match(msg, /canario FALLÓ \(Edit\/Write protegido\)/);
  });
});

// Protects: canario §8.4 · Breaks if: una familia de la guardia (no solo git) cae sin aviso.
test('each family of CANARIES is exercised: a guard that only blocks git reset is reported', () => {
  withTempHandler('_tmp-git-only-guard', "exports.run = (i) => (/git reset/.test(i.tool_input.command) ? { exit: 2, stderr: 'pignolo bloqueó el comando: x' } : { exit: 0 });", () => {
    const r = ss.run({ source: 'resume', cwd: makeTempDir() },
      { env: { PIGNOLO_HOME: makeTempDir() }, canaryHandler: '_tmp-git-only-guard' });
    const msg = JSON.parse(r.stdout).systemMessage;
    assert.match(msg, /NO bloqueó el comando de prueba de: catastrófico, ejecución no literal, PowerShell por AST\./);
    assert.doesNotMatch(msg, /git destructivo|Edit\/Write/);
  });
});

test('PIGNOLO_DISABLED=1 is reported in red and no backup is taken', () => {
  const repo = makeRepo();
  const r = ss.run({ source: 'startup', cwd: repo }, { env: { PIGNOLO_HOME: makeTempDir(), PIGNOLO_DISABLED: '1' } });
  assert.match(JSON.parse(r.stdout).systemMessage, /PIGNOLO_DISABLED=1/);
  assert.strictEqual(backups(repo), '');
});

test('/pignolo:off is reported, guard still on', () => {
  const cwd = makeTempDir();
  fs.mkdirSync(path.join(cwd, '.pignolo'));
  fs.writeFileSync(path.join(cwd, '.pignolo', '.disabled'), 'x');
  const r = ss.run({ source: 'resume', cwd }, { env: { PIGNOLO_HOME: makeTempDir() } });
  assert.match(JSON.parse(r.stdout).systemMessage, /apagado.*siguen activos/);
});

test('resume in a healthy state outside a repo prints nothing', () => {
  const r = ss.run({ source: 'resume', cwd: makeTempDir() }, { env: { PIGNOLO_HOME: makeTempDir() } });
  assert.strictEqual(r.exit, 0);
  assert.strictEqual(r.stdout, '');
});

test('source status always prints a status line (H16)', () => {
  const r = ss.run({ source: 'status', cwd: makeTempDir() }, { env: { PIGNOLO_HOME: makeTempDir() } });
  assert.match(JSON.parse(r.stdout).systemMessage, /^pignolo: hooks encendidos; guardia de git activa; canario OK\.$/);
});

test('works through the launcher', () => {
  const r = runLauncher('session-start', { source: 'startup', cwd: makeRepo() });
  assert.strictEqual(r.status, 0);
  assert.ok(JSON.parse(r.stdout).systemMessage);
});

test('SessionStart is registered for every source, fork included (H17)', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const entry = (hooks.SessionStart || []).find((m) => m.hooks.some((x) => x.args[1] === 'session-start'));
  assert.ok(entry);
  for (const source of ['startup', 'resume', 'clear', 'compact', 'fork']) assert.ok(entry.matcher.split('|').includes(source), source);
});
