---
name: validate
description: "Use when the user asks to validate the work at a milestone, in Spanish or English: 'validá', 'validá el hito', 'revisá todo antes de seguir', 'validate this', 'validate the milestone'. Picks the review fronts the project's evidence justifies and runs only those."
---

# validate: review only what the project gives evidence for

Run when the author says "validá" or at a roadmap milestone, never per task, because per-task review costs more than it finds. Nothing here blocks.

## 1. Read before choosing

Read `security.md`, the diff and the repo's evidence (schema, dependencies, forms, authentication, files present). `security.md` is written in Spanish and its headings vary: read its meaning (data handled, users, exposed surface, what must be protected), not its headings. If it is missing, rely on the evidence alone and offer to create a minimal one.

## 2. The base of the diff

Review base..working tree since the last validation: uncommitted changes and untracked files (`git status --porcelain`) are part of the diff. Use the first usable base:

1. Search `docs/sessions/*.md` newest-first by the date in the filename and take the first line matching `^Validado: ([0-9a-f]{7,40})`. The sha must pass `git merge-base --is-ancestor <sha> HEAD`; if not, fall back. If the sha equals HEAD and the working tree is clean ignoring `docs/sessions/` and `docs/research/`, print "nada nuevo desde <sha>" and stop: no fallback re-review.
2. The merge-base of HEAD with the main branch: the target of origin/HEAD if there is a remote, else `main`, else `master`, else `init.defaultBranch`.
3. The last commits.

If any other base equals HEAD or its diff is empty, move to the next one. This works with no git remote. If the folder is not a git repo, there is no diff: review the files themselves, say so, and write no `Validado:` line. When validation ends, write `Validado: <sha>` into today's `docs/sessions/YYYY-MM-DD.md`, creating a minimal file if absent, only when the working tree is clean ignoring `docs/sessions/` and `docs/research/`; otherwise write nothing and say why, because that sha would hide the uncommitted work.

## 3. Choose the fronts

Measure first: run `git diff --shortstat <base>`, add the untracked files from `git status --porcelain`, and state both numbers (files, changed lines) when you announce the fronts. Without git, count the files and lines you review. A stated count cannot be misjudged by feel.

A small diff is at most 5 files and 200 changed lines, both within the limits and nothing else. With no evidence of forms, public endpoints, authentication, secrets, personal data or stray junk, it is reviewed in the main thread with no agents, since a subagent's fresh context costs more than the review. Evidence does not wait for a big diff: security and hygiene are delegated on their own evidence whatever the size, so the main thread never spends context listing logs and screenshots.

A front enters only with evidence tied to this diff (thresholds and worked shapes in `references/fronts.md`); most projects need zero or one. A small diff is reviewed by you in the main thread and the native `/code-review` is not invoked (it launches its own subagent). Any other diff invokes `/code-review` from the main thread, and `/security-review` when the security front is on; the native command's own subagent is counted apart from the cap of 5 and named in the cost line.

## 4. Run

Before launching, say in one or two sentences, in Spanish, which fronts you will delegate, why and a rough cost, then continue unless the author objects: it lets the author correct the plan before the cost is spent. At most 5 agents, one per front, launched together. If more than 5 qualify, drop from the end of the priority list in `references/fronts.md`.

Dispatch the `review-<id>` agents with `model` passed explicitly: security sonnet/high, database, code and tests sonnet/medium, hygiene and docs haiku/low; `opus` for security when `security.md` declares sensitive data. Give each the base, the diff and the relevant part of `security.md`.

The agents report every finding with evidence (file:line), unfiltered by severity. Asking only for the serious ones makes a model under-report, so you rank: by impact, dropping what the evidence does not support, merging duplicates.

## 5. Report

In Spanish: findings by impact, each with evidence and what to do; then, in one sentence, which fronts ran and which were left out and why, and what was not reviewed. Hygiene only lists, never deletes.

The interface audit is not part of validate: it is asked for with `/pignolo:ui-audit`.

Name the next step at the end: fix the findings the author accepts, then `/pignolo:session` when the day closes.
