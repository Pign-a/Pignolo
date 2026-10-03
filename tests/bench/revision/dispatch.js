'use strict';
// The dispatch text of the cards (lentes-reales section 5, identical in every run: only the
// values between <> change) and, for stage B, the full prompt of a general-purpose agent: the
// body of the lens card at the commit the card fixes, followed by the dispatch text.
//
//   node tests/bench/revision/dispatch.js --snapshot <id> --dir <snapshot dir> [--lens <lens> --card-commit 7cc2f03]
// Prints the dispatch text; with --lens, the lens card body first (stage B prompt).
const path = require('node:path');
const { git, loadCases, snapshotById, parseArgs, DEFAULT_REPO } = require('./lib');

function dispatchText({ sha, base, dir }) {
  const d = String(dir).replace(/\\/g, '/').replace(/\/+$/, '');
  return [
    'Review this change through your lens.',
    `Frozen SHA: ${sha}. Worktree (its files are that SHA): ${d}/tree`,
    'Risk level: high.',
    `Task-card: ${d}/brief/task-card.md`,
    `Changed files: ${d}/brief/files.txt`,
    `Diff ${base}..${sha} of the non-test source files: ${d}/brief/diff.patch`,
    `Read only inside ${d}. There is no git history here.`,
  ].join('\n');
}

// The agent card without its frontmatter: the lens instructions as the product gives them.
function lensBody(repo, commit, lens) {
  const text = git(repo, ['show', `${commit}:plugins/pignolo/agents/review-${lens}.md`]);
  return text.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.snapshot || !a.dir) {
    process.stderr.write('uso: node dispatch.js --snapshot <id> --dir <snapshot dir> [--lens <lens> --card-commit <sha>] [--repo <path>]\n');
    process.exit(2);
  }
  try {
    const repo = a.repo ? path.resolve(a.repo) : DEFAULT_REPO;
    const s = snapshotById(loadCases(), a.snapshot);
    const sha = git(repo, ['rev-parse', s.commit]).trim();
    const base = git(repo, ['rev-parse', s.parent]).trim();
    const text = dispatchText({ sha, base, dir: path.resolve(a.dir) });
    process.stdout.write(`${a.lens ? `${lensBody(repo, a['card-commit'] || '7cc2f03', a.lens)}\n\n` : ''}${text}\n`);
  } catch (e) {
    process.stderr.write(`dispatch: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { dispatchText, lensBody };
