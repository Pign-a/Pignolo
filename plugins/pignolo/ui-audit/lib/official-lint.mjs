// Official DESIGN.md linter, only when it is already installed (spec §4.2, A-09). Never
// downloads anything: it looks for the package in PIGNOLO_UI_DESIGNMD (package folder or its
// dist/index.js) or in <project>/node_modules/@google/design.md, and runs it with node
// (no shell, so it behaves the same on Windows). No JSON output = unverified, never approved.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const PINNED_VERSION = '0.4.0';

export function findOfficialLinter({ projectRoot, env = process.env } = {}) {
  const candidates = [];
  if (env.PIGNOLO_UI_DESIGNMD) candidates.push(env.PIGNOLO_UI_DESIGNMD);
  if (projectRoot) candidates.push(path.join(projectRoot, 'node_modules', '@google', 'design.md'));
  for (const c of candidates) {
    const dir = /\.m?js$/.test(c) ? path.dirname(path.dirname(c)) : c;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name !== '@google/design.md') continue;
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && (pkg.bin.designmd || pkg.bin['design.md']);
      const entry = path.join(dir, bin || path.join('dist', 'index.js'));
      if (fs.existsSync(entry)) return { entry, version: pkg.version, dir };
    } catch {
      // not this candidate
    }
  }
  return null;
}

export function runOfficialLint(file, { projectRoot, env = process.env, timeoutMs = 30000 } = {}) {
  const found = findOfficialLinter({ projectRoot, env });
  if (!found) return { status: 'unverified', reason: 'official linter not installed (@google/design.md)' };
  const res = spawnSync(process.execPath, [found.entry, 'lint', '--format', 'json', file], { encoding: 'utf8', timeout: timeoutMs });
  let json;
  try {
    json = JSON.parse(res.stdout);
  } catch {
    return { status: 'unverified', reason: `official linter gave no JSON output (exit ${res.status})`, version: found.version };
  }
  const s = json.summary || {};
  return {
    status: 'ran',
    version: found.version,
    pinned: found.version === PINNED_VERSION,
    errors: s.errors ?? 0,
    warnings: s.warnings ?? 0,
    infos: s.infos ?? 0,
    findings: Array.isArray(json.findings) ? json.findings : [],
  };
}
