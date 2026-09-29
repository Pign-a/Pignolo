'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeTempDir } = require('./helpers');

const SETUP = path.join(PLUGIN_ROOT, 'scripts', 'setup.js');
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'permissions.json'), 'utf8'));

// Entorno aislado: home, config y cwd temporales; ejecutables falsos por PIGNOLO_SETUP_BIN_*.
function sandbox(extraEnv = {}) {
  const home = makeTempDir('pignolo-setup-home-');
  const cwd = makeTempDir('pignolo-setup-cwd-');
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    PIGNOLO_HOME: path.join(home, '.pignolo'),
    CLAUDE_CONFIG_DIR: '',
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '',
    CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '',
    ...extraEnv,
  };
  return { home, cwd, env };
}

function fakeBin(dir, name, body) {
  const file = path.join(dir, `${name}.js`);
  fs.writeFileSync(file, body);
  return file;
}

function run(args, { env, cwd }) {
  const r = spawnSync(process.execPath, [SETUP, ...args], { env, cwd, encoding: 'utf8', timeout: 30000 });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { /* sin JSON */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

function withGit(sb, v) {
  const bin = fakeBin(sb.home, `git-${v}`, `console.log('git version ${v}');`);
  return { ...sb.env, PIGNOLO_SETUP_BIN_GIT: bin };
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

test('check: hooksOk según la versión de git', () => {
  for (const [v, ok] of [['2.30.1', false], ['2.45.0', true]]) {
    const sb = sandbox();
    const r = run(['check'], { env: withGit(sb, v), cwd: sb.cwd });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.git.version, v);
    assert.equal(r.json.git.hooksOk, ok, v);
  }
});

test('check: un powershell inexistente da false', () => {
  const sb = sandbox();
  const env = { ...withGit(sb, '2.45.0'), PIGNOLO_SETUP_BIN_POWERSHELL: path.join(sb.home, 'no-existe.exe') };
  const r = run(['check'], { env, cwd: sb.cwd });
  assert.equal(r.json.powershell, false);
});

test('check: gh y powershell falsos que arrancan dan true', () => {
  const sb = sandbox();
  const ok = fakeBin(sb.home, 'ok', "console.log('1.0');");
  const env = { ...withGit(sb, '2.45.0'), PIGNOLO_SETUP_BIN_GH: ok, PIGNOLO_SETUP_BIN_POWERSHELL: ok };
  const r = run(['check'], { env, cwd: sb.cwd });
  assert.equal(r.json.gh, true);
  assert.equal(r.json.powershell, true);
});

test('check: superpowers presente bajo plugins/cache/*/', () => {
  const sb = sandbox();
  const before = run(['check'], { env: withGit(sb, '2.45.0'), cwd: sb.cwd });
  assert.equal(before.json.superpowers, false);
  fs.mkdirSync(path.join(sb.home, '.claude', 'plugins', 'cache', 'x', 'superpowers'), { recursive: true });
  const after = run(['check'], { env: withGit(sb, '2.45.0'), cwd: sb.cwd });
  assert.equal(after.json.superpowers, true);
});

test('check: agentTeams desde el settings del usuario', () => {
  const sb = sandbox();
  writeJson(path.join(sb.home, '.claude', 'settings.json'), { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' } });
  const r = run(['check'], { env: withGit(sb, '2.45.0'), cwd: sb.cwd });
  assert.equal(r.json.agentTeams, true);
});

test('check: el 0 del settings del usuario pisa el 1 del entorno', () => {
  const sb = sandbox();
  writeJson(path.join(sb.home, '.claude', 'settings.json'), { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '0' } });
  const env = { ...withGit(sb, '2.45.0'), CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' };
  const r = run(['check'], { env, cwd: sb.cwd });
  assert.equal(r.json.agentTeams, false);
});

test('check: el settings local del proyecto pisa al del usuario', () => {
  const sb = sandbox();
  writeJson(path.join(sb.home, '.claude', 'settings.json'), { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '0' } });
  writeJson(path.join(sb.cwd, '.claude', 'settings.local.json'), { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' } });
  const r = run(['check'], { env: withGit(sb, '2.45.0'), cwd: sb.cwd });
  assert.equal(r.json.agentTeams, true);
});

test('check: subagentModelForce desde el entorno y desde un settings', () => {
  const sb = sandbox();
  const viaEnv = run(['check'], { env: { ...withGit(sb, '2.45.0'), CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1' }, cwd: sb.cwd });
  assert.equal(viaEnv.json.subagentModelForce, true);
  const none = run(['check'], { env: withGit(sb, '2.45.0'), cwd: sb.cwd });
  assert.equal(none.json.subagentModelForce, false);
  writeJson(path.join(sb.cwd, '.claude', 'settings.json'), { env: { CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1' } });
  const viaSettings = run(['check'], { env: withGit(sb, '2.45.0'), cwd: sb.cwd });
  assert.equal(viaSettings.json.subagentModelForce, true);
});

test('check: availableModels de los settings', () => {
  const sb = sandbox();
  writeJson(path.join(sb.home, '.claude', 'settings.json'), { availableModels: ['sonnet'] });
  const r = run(['check'], { env: withGit(sb, '2.45.0'), cwd: sb.cwd });
  assert.deepEqual(r.json.availableModels, ['sonnet']);
});

test('check: devuelve la config con sus valores por defecto', () => {
  const sb = sandbox();
  const r = run(['check'], { env: withGit(sb, '2.45.0'), cwd: sb.cwd });
  assert.equal(r.json.config.profile, 'balanced');
  assert.equal(typeof r.json.node, 'string');
});

function userSettings(sb) { return path.join(sb.home, '.claude', 'settings.json'); }

test('permissions: solo lista lo que falta y cuenta lo que ya está', () => {
  const sb = sandbox();
  const shared = TEMPLATE.permissions.deny[0];
  writeJson(userSettings(sb), { permissions: { deny: ['Bash(mio1)', shared], ask: ['Bash(mio2)'] } });
  const before = fs.readFileSync(userSettings(sb), 'utf8');
  const r = run(['permissions', '--target', 'user'], { env: sb.env, cwd: sb.cwd });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!r.json.add.deny.includes(shared));
  assert.equal(r.json.add.deny.length, TEMPLATE.permissions.deny.length - 1);
  assert.equal(r.json.add.ask.length, TEMPLATE.permissions.ask.length);
  assert.equal(r.json.already, 1);
  assert.equal(fs.readFileSync(userSettings(sb), 'utf8'), before, 'sin --apply no escribe');
});

test('permissions --apply: conserva reglas propias, orden, claves ajenas y deja respaldo', () => {
  const sb = sandbox();
  const shared = TEMPLATE.permissions.deny[0];
  const original = { model: 'opus', env: { X: '1' }, permissions: { allow: ['Bash(ls)'], deny: ['Bash(mio1)', 'Bash(mio3)', shared], ask: ['Bash(mio2)'] } };
  writeJson(userSettings(sb), original);
  const before = fs.readFileSync(userSettings(sb), 'utf8');
  const r = run(['permissions', '--target', 'user', '--apply'], { env: sb.env, cwd: sb.cwd });
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(fs.readFileSync(userSettings(sb), 'utf8'));
  assert.deepEqual(after.permissions.deny.slice(0, 3), ['Bash(mio1)', 'Bash(mio3)', shared]);
  assert.deepEqual(after.permissions.ask[0], 'Bash(mio2)');
  assert.deepEqual(after.permissions.allow, ['Bash(ls)']);
  assert.equal(after.model, 'opus');
  assert.deepEqual(after.env, { X: '1' });
  assert.deepEqual(Object.keys(after), Object.keys(original));
  for (const rule of TEMPLATE.permissions.deny) assert.ok(after.permissions.deny.includes(rule));
  for (const rule of TEMPLATE.permissions.ask) assert.ok(after.permissions.ask.includes(rule));
  assert.equal(new Set(after.permissions.deny).size, after.permissions.deny.length);
  const dir = path.dirname(userSettings(sb));
  const baks = fs.readdirSync(dir).filter((f) => f.startsWith('settings.json.pignolo-bak-'));
  assert.equal(baks.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, baks[0]), 'utf8'), before);
  // idempotente: una segunda aplicación no agrega nada
  const again = run(['permissions', '--target', 'user', '--apply'], { env: sb.env, cwd: sb.cwd });
  assert.equal(again.json.add.deny.length, 0);
  assert.equal(again.json.add.ask.length, 0);
});

test('permissions --apply: un settings inválido aborta sin escribir', () => {
  const sb = sandbox();
  fs.mkdirSync(path.dirname(userSettings(sb)), { recursive: true });
  const bad = '{ "permissions": { "deny": [ ';
  fs.writeFileSync(userSettings(sb), bad);
  const r = run(['permissions', '--target', 'user', '--apply'], { env: sb.env, cwd: sb.cwd });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /settings inválido/);
  assert.equal(fs.readFileSync(userSettings(sb), 'utf8'), bad);
  assert.deepEqual(fs.readdirSync(path.dirname(userSettings(sb))), ['settings.json']);
});

test('permissions --apply: un settings ausente se crea solo con permissions', () => {
  const sb = sandbox();
  const r = run(['permissions', '--target', 'project', '--apply'], { env: sb.env, cwd: sb.cwd });
  assert.equal(r.status, 0, r.stderr);
  const file = path.join(sb.cwd, '.claude', 'settings.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(data), ['permissions']);
  assert.deepEqual(data.permissions.deny, TEMPLATE.permissions.deny);
  assert.deepEqual(data.permissions.ask, TEMPLATE.permissions.ask);
});

test('permissions: un target inválido sale con exit 1', () => {
  const sb = sandbox();
  const r = run(['permissions', '--target', 'nube'], { env: sb.env, cwd: sb.cwd });
  assert.equal(r.status, 1);
});

test('config --profile economy deja presentation text', () => {
  const sb = sandbox();
  const r = run(['config', '--profile', 'economy'], { env: sb.env, cwd: sb.cwd });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.profile, 'economy');
  assert.equal(r.json.presentation, 'text');
});

test('config: opciones presentation y language', () => {
  const sb = sandbox();
  const r = run(['config', '--profile', 'max', '--presentation', 'artifact', '--language', 'es'], { env: sb.env, cwd: sb.cwd });
  assert.equal(r.json.presentation, 'artifact');
  assert.equal(r.json.language, 'es');
});

test('config --profile turbo: exit 1 y no escribe', () => {
  const sb = sandbox();
  const r = run(['config', '--profile', 'turbo'], { env: sb.env, cwd: sb.cwd });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /perfil inválido/);
  assert.equal(fs.existsSync(path.join(sb.env.PIGNOLO_HOME, 'config.json')), false);
});

test('SKILL.md: solo humano y nombra scripts/setup.js', () => {
  const text = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', 'setup', 'SKILL.md'), 'utf8');
  const front = text.match(/^---\n([\s\S]*?)\n---/)[1];
  assert.match(front, /^disable-model-invocation: true$/m);
  assert.match(front, /^description: .+$/m);
  assert.match(text, /scripts\/setup\.js/);
});
