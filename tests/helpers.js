'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const PLUGIN_ROOT = path.join(__dirname, '..', 'plugins', 'pignolo');
const LAUNCHER = path.join(PLUGIN_ROOT, 'hooks', 'launcher.js');

function makeTempDir(prefix = 'pignolo-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function makeRepo() {
  const dir = makeTempDir('pignolo-repo-');
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.name', 'pignolo-test'], dir);
  git(['config', 'user.email', 'test@example.invalid'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  git(['config', 'core.autocrlf', 'false'], dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'uno\n');
  git(['add', 'a.txt'], dir);
  git(['commit', '-q', '-m', 'inicial'], dir);
  return dir;
}

function runLauncher(handler, payload, env = {}) {
  const home = env.PIGNOLO_HOME || makeTempDir('pignolo-home-');
  const res = spawnSync(process.execPath, [LAUNCHER, handler], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, PIGNOLO_DISABLED: '', ...env, PIGNOLO_HOME: home },
    timeout: 20000,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

module.exports = { PLUGIN_ROOT, LAUNCHER, makeTempDir, makeRepo, runLauncher, git };
