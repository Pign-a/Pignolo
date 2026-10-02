// Values the leak check must not find in an option (spec §7.4): git user.name and user.email of
// the project, the session email, the OS user and the home directory. exec and os are injectable.
//
// collectLeakOrigins({ project, email, exec, os }) -> { 'os-user', home, 'git-name', 'git-email', 'account-email', git }
//   which origins produced a usable value, and how git behaved: ok (at least one value), unset (git answered
//   "no value": no user.name or user.email configured, not a failure) or failed (git did not run: the user
//   name and email are unknown, so canvas-index plan refuses, A4C2-16).
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { MIN_VALUE_LENGTH } from './leak-check.mjs';

const defaultExec = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });

export function collectLeakValues({ project, email, exec = defaultExec, os: osLike = os } = {}) {
  const values = [];
  for (const key of ['user.name', 'user.email']) {
    try { values.push(String(exec(['config', key], project)).trim()); } catch { /* no git or no value */ }
  }
  values.push(email);
  try { values.push(osLike.userInfo().username); } catch { /* no user info */ }
  try { values.push(osLike.homedir()); } catch { /* no home */ }
  const out = [];
  for (const v of values) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s.length >= MIN_VALUE_LENGTH && !out.includes(s)) out.push(s);
  }
  return out;
}

export function collectLeakOrigins({ project, email, exec = defaultExec, os: osLike = os } = {}) {
  const has = (v) => typeof v === 'string' && v.trim().length >= MIN_VALUE_LENGTH;
  const origins = { 'os-user': false, home: false, 'git-name': false, 'git-email': false, 'account-email': has(email), git: 'unset' };
  let failed = false;
  for (const [key, origin] of [['user.name', 'git-name'], ['user.email', 'git-email']]) {
    try {
      origins[origin] = has(String(exec(['config', key], project)));
    } catch (e) {
      // "git config" answers exit 1 with no output when the key is not set; anything else is a failure
      if (e && e.status !== 1) failed = true;
    }
  }
  try { origins['os-user'] = has(osLike.userInfo().username); } catch { /* no user info */ }
  try { origins.home = has(osLike.homedir()); } catch { /* no home */ }
  if (failed) origins.git = 'failed';
  else if (origins['git-name'] || origins['git-email']) origins.git = 'ok';
  return origins;
}
