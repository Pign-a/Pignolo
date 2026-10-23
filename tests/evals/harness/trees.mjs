// Where the code of a run lives. A method may work in the run folder, in a git worktree or on a branch:
// the measured tree is the candidate with the largest change against the base commit.
import fs from 'node:fs';
import path from 'node:path';
import { git } from './prepare.mjs';

const slash = (p) => String(p).replace(/\\/g, '/');
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const inside = (child, parent) => {
  const c = path.resolve(child).toLowerCase();
  const p = path.resolve(parent).toLowerCase();
  return c !== p && c.startsWith(p + path.sep);
};

// Config entries to git pathspec excludes. "dir/" is a folder, a name without "/" matches at any depth.
// Pathspecs (not regexes on diff text) so names with spaces or odd characters work.
export function excludeSpecs(entries) {
  const out = [];
  for (const e of entries || []) {
    const isDir = e.endsWith('/');
    const name = slash(e).replace(/\/+$/, '');
    if (!name) continue;
    const single = !name.includes('/');
    if (single) out.push(isDir ? `:(exclude,glob,icase)**/${name}/**` : `:(exclude,glob,icase)**/${name}`);
    else out.push(`:(exclude,icase)${name}`);
  }
  return out;
}

export function listWorktrees(repo) {
  const out = git(repo, ['worktree', 'list', '--porcelain']);
  const trees = [];
  for (const block of out.split(/\r?\n\r?\n/)) {
    const t = {};
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) t.path = path.resolve(line.slice(9));
      else if (line.startsWith('HEAD ')) t.head = line.slice(5);
      else if (line.startsWith('branch ')) t.branch = line.slice(7).replace(/^refs\/heads\//, '');
      else if (line === 'detached') t.branch = null;
    }
    if (t.path) trees.push({ path: t.path, head: t.head || null, branch: t.branch ?? null });
  }
  return trees;
}

function parseNumstat(text) {
  let added = 0;
  let removed = 0;
  const files = [];
  for (const l of text.split('\n').filter(Boolean)) {
    const [a, d, ...rest] = l.split('\t');
    if (a !== '-') added += Number(a);
    if (d !== '-') removed += Number(d);
    files.push(rest.join('\t'));
  }
  return { added, removed, files };
}

const q = (cwd, args) => git(cwd, ['-c', 'core.quotepath=false', ...args]);

// Stages everything in a tree and counts its change against `base`, code only (excludes applied).
function treeChanges(tree, others, excludes) {
  const nested = others.filter((o) => inside(o, tree)).map((o) => `:(exclude)${slash(path.relative(tree, o))}`);
  q(tree, ['add', '-A', '--', '.', ...nested]);
  const specs = ['--', '.', ...nested, ...excludeSpecs(excludes)];
  const code = parseNumstat(q(tree, ['diff', '--cached', '--numstat', '--no-renames', 'base', ...specs]));
  const raw = parseNumstat(q(tree, ['diff', '--cached', '--numstat', '--no-renames', 'base', '--', '.', ...nested]));
  return { code, raw, nested };
}

// Candidates: the run folder, every other worktree and every branch ahead of base that no worktree has checked out.
export function measureTrees(repo, excludes) {
  // A worktree whose folder is gone (the agent removed it) is dropped from git's list first; a path that still does not exist is skipped.
  try { git(repo, ['worktree', 'prune']); } catch { /* nothing to prune */ }
  const worktrees = listWorktrees(repo).filter((w) => fs.existsSync(w.path));
  const main = worktrees.find((w) => same(w.path, repo)) || { path: path.resolve(repo), head: null, branch: null };
  const others = worktrees.filter((w) => !same(w.path, repo)).map((w) => w.path);
  const candidates = [];
  for (const w of [main, ...worktrees.filter((x) => !same(x.path, repo))]) {
    const { code, raw } = treeChanges(w.path, [...others, main.path].filter((o) => !same(o, w.path)), excludes);
    candidates.push({
      kind: same(w.path, repo) ? 'main' : 'worktree', path: w.path, branch: w.branch, head: w.head,
      filesChanged: code.files.length, files: code.files, linesAdded: code.added, linesRemoved: code.removed,
      rawFilesChanged: raw.files.length, rawLines: raw.added + raw.removed,
    });
  }
  const branchesAhead = [];
  const checkedOut = new Set(worktrees.map((w) => w.branch).filter(Boolean));
  for (const b of q(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter(Boolean)) {
    const ahead = Number(q(repo, ['rev-list', '--count', `base..${b}`]));
    if (ahead > 0) branchesAhead.push({ branch: b, ahead });
    if (ahead > 0 && !checkedOut.has(b)) {
      const code = parseNumstat(q(repo, ['diff', '--numstat', '--no-renames', 'base', b, '--', '.', ...excludeSpecs(excludes)]));
      const raw = parseNumstat(q(repo, ['diff', '--numstat', '--no-renames', 'base', b]));
      candidates.push({
        kind: 'branch', path: null, branch: b, head: null,
        filesChanged: code.files.length, files: code.files, linesAdded: code.added, linesRemoved: code.removed,
        rawFilesChanged: raw.files.length, rawLines: raw.added + raw.removed,
      });
    }
  }
  // The measured tree has the largest CODE change (excluded names left out); ties fall back to the raw change, then to the run folder.
  // Whether the run produced changes at all looks at the raw change: a task whose target is an excluded name is not "no changes".
  const size = (c) => c.linesAdded + c.linesRemoved + c.filesChanged;
  const rawSize = (c) => c.rawLines + c.rawFilesChanged;
  let measured = candidates[0];
  for (const c of candidates) if (size(c) > size(measured) || (size(c) === size(measured) && rawSize(c) > rawSize(measured))) measured = c;
  const withChanges = candidates.filter((c) => size(c) > 0);
  return {
    worktrees: worktrees.map((w) => ({ path: w.path, branch: w.branch, head: w.head })),
    branchesAhead,
    candidates,
    measured,
    noChanges: rawSize(measured) === 0,
    flags: withChanges.length > 1 ? ['multiple_trees'] : [],
  };
}

// Code-only and raw diffs of a measured tree (already staged by measureTrees).
export function treePatches(tree, others, excludes) {
  const nested = others.filter((o) => inside(o, tree)).map((o) => `:(exclude)${slash(path.relative(tree, o))}`);
  const common = ['diff', '--cached', '--no-renames', 'base'];
  return {
    raw: q(tree, [...common, '--binary', '--', '.', ...nested]),
    blind: q(tree, [...common, '--', '.', ...nested, ...excludeSpecs(excludes)]),
    shortstat: q(tree, [...common, '--shortstat', '--', '.', ...nested, ...excludeSpecs(excludes)]),
  };
}
