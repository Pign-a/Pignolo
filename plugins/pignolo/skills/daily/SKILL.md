---
name: daily
description: Entered only through pignolo:entry, when it picked the daily lane. Runs one task in its own branch and worktree - test-writer, red proved by you, implementer, sealed gate, review by risk - then merges into the origin branch with the human's confirmation.
---

You are the orchestrator in the main conversation. `<main>` is the project root from the entry skill; `<P>` stands for `${CLAUDE_PLUGIN_ROOT}`. Talk to the human as the entry skill says: two layers (`<P>/templates/question.md`), one step per message, a category on every question, facts only from script output.

## Rules that hold in every step

- **Only you run `run.js`.** Subagents cannot (the guard blocks them). You register the task before every writer dispatch, renew the flow before every dispatch, and run `status` after every writer.
- **A report is not proof.** After each writer returns, run `node "<P>/scripts/run.js" status --cwd "<main>"`. The writer is accepted only if `handback.accepted` is true. Otherwise the task is BLOCKED whatever the report says; the reason is in `handback.lastReason`.
- **Continue at most twice.** Compare the report with the task-card. If items are still open and the writer named no block, register the task again with the same `run.js task` command (that resets its handback counter) and dispatch the same writer once more, naming the open items. At most 2 automatic continuations per writer; after that, ask the human (category `scope`, or the reserved category if that is what blocks).
- **Paths with forward slashes.** Every `--file` is relative to the worktree root and uses `/` (`tests/cart.test.js`, never `tests\cart.test.js`).
- **Files and messages through Write.** Task-cards, commit messages and file lists go to `<main>/.pignolo/tmp/` with the Write tool; commits use `git commit -F <file>`. Stage by path; never `git add -A` or `git add .`.
- **Models.** Run `node "<P>/scripts/setup.js" models` once at the start and pass `model: <models[role]>` on every dispatch.

## Steps

1. **Open the flow.** `node "<P>/scripts/run.js" start --flow daily --cwd "<main>"`. Exit 1: stop and tell the human what the message says.
2. **Branch and worktree** (spec §11.1, §11.2 mechanism B). Pick a slug (`[a-z0-9-]`, at most 40 characters) and today's date. From `<main>`: `git branch --show-current` is the origin branch; then `cd "<main>" && git worktree add -b task/daily/<YYYY-MM-DD>-<slug> "<main>/.pignolo/worktrees/<slug>" HEAD`. Call the worktree `<wt>` and its `git rev-parse HEAD` `<base>`. If the branch name exists, add `-2`, `-3`.
3. **Explore** what the change needs: up to 3 files yourself, 4 or more through `pignolo:explorer`. Explorer reports are claims to check.
4. **Task-card.** Fill `<P>/templates/task-card.md` for the test-writer and write it to `<main>/.pignolo/tmp/task-<slug>.md`. Pick the test files: inside `test-paths` (from `.pignolo/project.md`), next to the existing tests and following their naming. Skip steps 5 to 8 only when `project.md` says `type: docs` or `type: script`.
5. **Register and dispatch the test-writer.**
   - `node "<P>/scripts/run.js" renew --cwd "<main>"`
   - `node "<P>/scripts/run.js" task --id <slug> --worktree "<wt>" --base <base> --file <test path> [--file <test path>]... --agent pignolo:test-writer --cwd "<main>"`. Exit 1 names the file that is outside `test-paths`: fix the list, never the check.
   - Dispatch `pignolo:test-writer` with the task-card and the literal requirement. It must not read the implementation.
6. **Accept.** `run.js status` as in the rules above; continue at most twice.
7. **Prove red yourself** (the test-writer has no Bash). Run the command it named: `cd "<wt>" && <command>`. The test must fail, and for the reason the test-writer stated. If it passes, it proves nothing: dispatch the test-writer again naming that (it counts as a continuation). Keep the failing output for the summary.
8. **Commit the tests.** Write the message (`test: ...`, trailers `Agent: pignolo:test-writer` and `Gates: red proved by the orchestrator`), then `cd "<wt>" && git add <test paths> && git commit -F "<main>/.pignolo/tmp/commit-msg.txt"`. Call the new `git rev-parse HEAD` `<T>`.
9. **Register and dispatch the implementer.**
   - `node "<P>/scripts/run.js" renew --cwd "<main>"`
   - `node "<P>/scripts/run.js" task --id <slug> --test-ref <T> --file <source path> [--file <source path>]... --agent pignolo:implementer --cwd "<main>"` (same id: it keeps `worktree` and `base`, adds `testRef`, replaces files and agent, and resets the counter). A test path in this list is refused: implementers do not touch tests. If you skipped steps 5 to 8, there is no task and no `<T>` yet: run `node "<P>/scripts/run.js" task --id <slug> --worktree "<wt>" --base <base> --file <source path> [--file <source path>]... --agent pignolo:implementer --cwd "<main>"` instead, without `--test-ref`.
   - Update the task-card (role, files, test reference) and dispatch `pignolo:implementer`. The card tells it to run every command as `cd "<wt>" && <command>` and to close only after `node "<P>/scripts/gate.js" --level on-done --task` passes.
10. **Accept.** `run.js status`; continue at most twice (register again before each re-dispatch).
11. **Risk on the real diff.** `node "<P>/scripts/risk.js" --diff <base> --cwd "<wt>"`. The level of the task is the higher of this and the entry classification. A new reserved hit: stop and ask (the hit's category). `laneFloor` `plan`: stop and ask (category `scope`).
12. **Commit the change.** Write the message (Conventional Commits in the human's language, trailers `Agent: pignolo:implementer` and `Gates: on-done PASS`), then `cd "<wt>" && git add <source paths> && git commit -F "<main>/.pignolo/tmp/commit-msg.txt"`.
13. **Review.** Invoke the `pignolo:review` skill with `<wt>`, `<base>`, the level from step 11, the task-card path and `<slug>` as the task id. It returns APPROVED or ESCALATED and the ledger path. ESCALATED: show the summary and ask the human how to go on (category `scope`); do not merge.
14. **Merge** (spec §4.4: into `main` one by one; into another origin branch as a routine confirmation). pignolo does not run `live-check` yet (a later milestone): if `.pignolo/project.md` declares `gates.live-check`, say in the question that it was not run. First run `cd "<main>" && git status --porcelain`: if the human has uncommitted changes (ignore `.pignolo/tmp/`), do not merge; tell them which files and ask how to go on (category `scope`), and never stash or commit their work. Otherwise ask the human (category `irreversible`), recommending the merge when the review is APPROVED. Only after an explicit yes in their own turn: write the merge message and run `cd "<main>" && git merge --no-ff -F "<main>/.pignolo/tmp/merge-msg.txt" task/daily/<YYYY-MM-DD>-<slug>`. Then `cd "<main>" && git worktree remove "<wt>"` (without `--force`; the branch stays). If they decline, do not merge and go to step 15; the branch and the worktree stay.
15. **Close.** `node "<P>/scripts/run.js" end --cwd "<main>"` and the closing summary with `<P>/templates/review-summary.md`, adding the red output of step 7 and the commits.

If the human stops the task, or it ends BLOCKED and they do not want to go on, run `run.js end` so the flow stops restricting agents; the branch and the worktree stay for them.
