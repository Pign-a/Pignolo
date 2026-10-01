// Values the leak check must not find in an option (spec §7.4): git user.name and user.email of
// the project, the session email, the OS user and the home directory. exec and os are injectable.
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
