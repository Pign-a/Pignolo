---
name: validate
description: "Use when the user asks to validate the work at a milestone, in Spanish or English: 'validá', 'validá el hito', 'revisá todo antes de seguir', 'validate this', 'validate the milestone'. Picks the review fronts the project's evidence justifies and runs only those."
---

# validate: review only what the project gives evidence for

Run when the author says "validá" or at a roadmap milestone, never per task, because per-task review costs more than it finds. Nothing here blocks.

## 1. Read before choosing

Read `security.md`, the diff and the repo's evidence (schema, dependencies, forms, authentication, files present). Read `security.md` for its meaning, not its headings (it is written in Spanish and its sections may vary): look for what it declares (the data handled, who the users are, the exposed surface, what must be protected). If it is missing, rely on the evidence alone and offer to create a minimal one.

## 2. The base of the diff

Review base..working tree since the last validation: uncommitted changes and untracked files (`git status --porcelain`) are part of the diff. Use the first usable base:

1. Search `docs/sessions/*.md` newest-first (by the date in the filename) and take the first line matching `^Validado: ([0-9a-f]{7,40})`. The sha must pass `git merge-base --is-ancestor <sha> HEAD`; if not (rebased away, wrong), fall back. If the sha equals HEAD and the working tree is clean ignoring `docs/sessions/` and `docs/research/`, print "nada nuevo desde <sha>" and stop: no fallback re-review.
2. The merge-base of HEAD with the main branch: the target of origin/HEAD if there is a remote, else `main`, else `master`, else `init.defaultBranch`.
3. The last commits.

If any other base equals HEAD or its diff is empty (for example you are working on the main branch itself), move to the next one. This works with no git remote. If the folder is not a git repo, there is no diff: review the files themselves, say so, and write no `Validado:` line. When validation ends, write `Validado: <sha>` (the current HEAD) into today's `docs/sessions/YYYY-MM-DD.md`, creating a minimal file if absent, only when the working tree is clean ignoring `docs/sessions/` and `docs/research/`; otherwise write nothing and say why in the closing message, because that sha would hide the uncommitted work next time.

## 3. Choose the fronts

A small diff is at most 5 files and 200 changed lines, with no evidence of forms, public endpoints, authentication, secrets, personal data or stray junk. A small diff is reviewed in the main thread with no agents, since a subagent's fresh context costs more than the review. Even then, security is still delegated if that evidence exists.

Ids: security, database, code, tests, hygiene, docs. A front enters only with evidence tied to this diff (thresholds, negative examples and worked shapes in `references/fronts.md`); most projects need zero or one. Print exactly one plain line (no markdown, no backticks) holding only the ids of the fronts delegated to agents, comma and space, no reasons, no cost: `Frentes: security, hygiene`, without the backticks. An empty list prints `Frentes:` alone. Put the reasons (in Spanish) and a rough cost on the lines after it, then continue unless the author adjusts. Diff correctness has no front agent. A small diff is reviewed by you in the main thread and the native `/code-review` is not invoked (it launches its own subagent). Any other diff invokes `/code-review` from the main thread, and `/security-review` when the security front is on; the native command's own subagent is counted apart from the cap of 5 and named in the cost line.

## 4. Run

At most 5 agents, one per front, launched together because they are independent. If more than 5 qualify, drop from the end of the priority list in `references/fronts.md`.

Dispatch the `review-<id>` agents with `model` passed explicitly: security sonnet/high, database, code and tests sonnet/medium, hygiene and docs haiku/low; `opus` for security when `security.md` declares sensitive data. Give each the base, the diff and the relevant part of `security.md`.

The agents report every finding with evidence (file:line), unfiltered by severity. Asking for only the serious ones makes a model under-report, so the ranking is yours: rank by impact, discard what the evidence does not support, merge duplicates.

## 5. Report

In Spanish: findings by impact, each with evidence and what to do; then what was not reviewed and why. Hygiene only lists, never deletes.

The interface audit is not part of validate: it is asked for with `/pignolo:ui-audit`.
