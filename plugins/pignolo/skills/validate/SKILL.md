---
name: validate
description: "Use when the user asks to validate the work at a milestone, in Spanish or English: 'validá', 'validá el hito', 'revisá todo antes de seguir', 'validate this', 'validate the milestone'. Picks the review fronts the project's evidence justifies and runs only those."
---

# validate: review only what the project gives evidence for

The author should not have to say what to review or how many agents to launch. The plugin looks at the project and decides. Ask for validation when the author says "validá" or at a milestone agreed in the roadmap, never per task: per-task review is how the cost of process grows past the value of what it finds. Nothing here blocks; findings are information for the author.

## 1. Read before choosing

Read `security.md`, the diff and the repo's evidence (schema and migrations, dependencies, forms, authentication, which files exist). Read `security.md` for its meaning, not its headings: it is written in Spanish and its sections may be named or ordered differently, so look for what it declares (the data handled, who the users are, the exposed surface, what must be protected). If it is missing, rely on the evidence alone and offer to create a minimal one, because the security front is much sharper when it knows what is sensitive.

## 2. The base of the diff

Review what changed since the last validation. Take the base in this order, using the first that exists:

1. The most recent line matching `^Validado: ([0-9a-f]{7,40})` in `docs/sessions/*.md`.
2. The merge-base with the main branch.
3. The last commits (a reasonable handful).

This needs no git remote. If the folder is not a git repo, there is no diff: review the files themselves and say so. When validation ends, write the line `Validado: <sha>` (the current HEAD) into today's `docs/sessions/YYYY-MM-DD.md`, creating a minimal file if it does not exist. It is one visible line in a project document the author can read and correct; the plugin keeps no hidden state.

## 3. Choose the fronts

Ids: security, database, code, tests, hygiene, docs. A front enters only with evidence in the repo; the table of evidence and what each front looks at is in `references/fronts.md`. Print exactly one line with the literal ids, separated by comma and space, for example `Frentes: security, hygiene`. An empty list prints `Frentes:` alone. Add a short reason per front (in Spanish) and a rough cost estimate, then continue unless the author adjusts. Correctness of the diff is not a front with an agent: from the main thread, run the native `/code-review`, and `/security-review` when the security front is on.

## 4. Run

At most 5 agents, one per front, launched together because they are independent. A small diff is reviewed in the main thread with no agents: a subagent costs a fresh context, and for a few files that is more than the review.

Dispatch the `review-<id>` agents and pass `model` explicitly. Defaults: security sonnet/high, database sonnet/medium, code sonnet/medium, tests sonnet/medium, hygiene haiku/low, docs haiku/low. Pass `opus` for security when `security.md` declares sensitive data, since a miss there is the costly kind. Give each agent the base, the diff and the relevant part of `security.md`.

The agents report every finding with evidence (file:line), unfiltered by severity. Asking a model to report only the serious ones makes it under-report, so the ranking is yours: in the main thread, rank by impact, discard what the evidence does not support, and merge duplicates.

## 5. Report

In Spanish: findings ordered by impact, each with its evidence and what to do; then what was not reviewed and why. Hygiene only lists, never deletes; deleting is the author's call.

The interface audit is not part of validate. The author asks for it separately with `ui-audit`.
