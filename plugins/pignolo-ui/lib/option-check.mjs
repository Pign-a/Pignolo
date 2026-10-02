// Verification of one generated option (spec §7.4): the main thread, not the subagent, checks
// the files it wrote. An option with a problem FAILS: it is not a result.
//
// gitState(project) -> string        sorted `git status --porcelain --untracked-files=all` lines
// checkOption({ dir, expected, project, gitBefore, ignoreUnder, kind, destination }) -> { ok, problems: [{ file, problem }], warnings }
//   problems: the ones of checkScreens (subfolder, not-html, bad-name, empty, no-charset, script,
//   remote-resource, broken-link) plus missing, empty-file, unexpected-file, repo-changed and, only for
//   mockups (kind 'option', R-5): malformed, braces, control-in-link, reserved-tag; for the fonts (R-19):
//   remote-font-local (a Google Fonts <link> with destination local, or in a style tile) and bad-font-link
//   (any other form). destination 'canvas' + kind 'option' is the only place the allowed <link> is fine.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkScreens } from './approved.mjs';
import { scanMarkup } from './canvas-html.mjs';
import { parseFontLinks } from './remote-fonts.mjs';

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

export function checkOption({ dir, expected = [], project, gitBefore, ignoreUnder = ['.pignolo-ui/'], kind = 'option', destination = 'local' }) {
  const problems = [];
  const warnings = [];
  const fontsOk = kind === 'option' && destination === 'canvas';
  let present = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    for (const f of expected) problems.push({ file: f, problem: 'missing' });
  } else {
    // the allowed font <link> is not a remote resource; where it is not welcome it is reported as remote-font-local below
    problems.push(...checkScreens(dir, { allowFonts: true }).problems);
    present = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
    for (const f of expected) {
      if (!present.includes(f)) problems.push({ file: f, problem: 'missing' });
      else if (fs.statSync(path.join(dir, f)).size === 0) problems.push({ file: f, problem: 'empty-file' });
    }
    for (const f of present) {
      if (f.toLowerCase().endsWith('.html') && !expected.includes(f)) problems.push({ file: f, problem: 'unexpected-file' });
    }
    for (const f of present.filter((n) => n.toLowerCase().endsWith('.html')).sort()) {
      let html;
      try { html = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
      const fonts = parseFontLinks(html, { requireHead: true });
      for (let i = 0; i < fonts.problems.length; i++) problems.push({ file: f, problem: 'bad-font-link' });
      if (fonts.links.length && !fontsOk) problems.push({ file: f, problem: 'remote-font-local' });
      if (kind === 'option') {
        const scan = scanMarkup(html);
        const names = { malformed: 'malformed', 'unquoted-attr': 'malformed', braces: 'braces', 'control-in-link': 'control-in-link', 'reserved-tag': 'reserved-tag' };
        const seen = new Set();
        for (const p of scan.problems) {
          const name = names[p.code];
          if (name && !seen.has(name)) { seen.add(name); problems.push({ file: f, problem: name }); }
        }
        for (const w of scan.warnings) warnings.push({ file: f, warning: w.code });
      }
    }
  }
  if (typeof gitBefore === 'string' && project) {
    const before = withoutIgnored(gitBefore, ignoreUnder);
    const now = withoutIgnored(gitState(project), ignoreUnder);
    if (before.join('\n') !== now.join('\n')) problems.push({ file: '', problem: 'repo-changed' });
  }
  return { ok: problems.length === 0, problems, warnings };
}
