// Environment report (spec §0, §12): plugin version, Node and Claude Code version.
// R-5: `claude --version` by execFileSync; on Windows a failed first try (ENOENT/EINVAL: the npm
// .cmd shim) is retried through cmd.exe with fixed arguments. Fails closed: unreadable -> ok false.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const defaultExec = (file, args) => execFileSync(file, args, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });

export function claudeVersion({ exec = defaultExec, platform = process.platform } = {}) {
  const parse = (out) => {
    const m = /\d+\.\d+\.\d+/.exec(String(out));
    return m ? m[0] : null;
  };
  try {
    return parse(exec('claude', ['--version']));
  } catch (e) {
    if (platform !== 'win32' || !['ENOENT', 'EINVAL'].includes(e && e.code)) return null;
  }
  try {
    return parse(exec('cmd.exe', ['/d', '/s', '/c', 'claude --version']));
  } catch {
    return null;
  }
}

const PLUGIN_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function envReport({ pluginRoot = PLUGIN_ROOT, minClaude = '2.1.271', exec, platform } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
  const version = claudeVersion({ exec, platform });
  const claude = { version, ok: false };
  if (!version) claude.reason = 'no se pudo leer la versión de Claude Code (claude --version)';
  else if (compareVersions(version, minClaude) >= 0) claude.ok = true;
  else claude.reason = `Claude Code ${version} es anterior a ${minClaude}`;
  return { pluginVersion: manifest.version, node: process.versions.node, claude };
}
