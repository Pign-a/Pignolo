// Verification of one generated option (spec §7.4): the main thread, not the subagent, checks
// the files it wrote. An option with a problem FAILS: it is not a result.
//
// gitState(project) -> string        sorted `git status --porcelain --untracked-files=all` lines
// checkOption({ dir, expected, project, gitBefore, ignoreUnder }) -> { ok, problems: [{ file, problem }] }
//   problems: the ones of checkScreens (subfolder, not-html, bad-name, empty, no-charset, script,
//   remote-resource, broken-link) plus missing, empty-file, unexpected-file, repo-changed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkScreens } from './approved.mjs';

export function gitState(project) {
  const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: project, encoding: 'utf8', timeout: 60000, windowsHide: true,
  });
  return out.split('\n').map((l) => l.replace(/\r$/, '')).filter(Boolean).sort().join('\n');
}

const pathOf = (line) => line.slice(3).replace(/^"|"$/g, '').replace(/\\/g, '/');

function withoutIgnored(state, ignoreUnder) {
  const prefixes = [].concat(ignoreUnder || []).map((p) => p.replace(/\\/g, '/'));
  return String(state).split('\n').filter(Boolean).filter((l) => !prefixes.some((p) => pathOf(l).startsWith(p)));
}

export function checkOption({ dir, expected = [], project, gitBefore, ignoreUnder = ['.pignolo-ui/'] }) {
  const problems = [];
  let present = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    for (const f of expected) problems.push({ file: f, problem: 'missing' });
  } else {
    problems.push(...checkScreens(dir).problems);
    present = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
    for (const f of expected) {
      if (!present.includes(f)) problems.push({ file: f, problem: 'missing' });
      else if (fs.statSync(path.join(dir, f)).size === 0) problems.push({ file: f, problem: 'empty-file' });
    }
    for (const f of present) {
      if (f.toLowerCase().endsWith('.html') && !expected.includes(f)) problems.push({ file: f, problem: 'unexpected-file' });
    }
  }
  if (typeof gitBefore === 'string' && project) {
    const before = withoutIgnored(gitBefore, ignoreUnder);
    const now = withoutIgnored(gitState(project), ignoreUnder);
    if (before.join('\n') !== now.join('\n')) problems.push({ file: '', problem: 'repo-changed' });
  }
  return { ok: problems.length === 0, problems };
}
