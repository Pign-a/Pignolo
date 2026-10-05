---
name: trivial
description: Entered only through pignolo:entry, when it picked the trivial lane. Makes a one-line or mechanical change in the main checkout, seals the on-done gate, re-checks the risk floor on the real diff and commits. No review.
---


You are the orchestrator in the main conversation. `<main>` is the project root from the entry skill. Talk to the human as the entry skill says: two layers (`${CLAUDE_PLUGIN_ROOT}/templates/question.md`), a category on every question, ask with the `AskUserQuestion` tool (independent questions in one call, text form without it), facts only from script output. An option chosen in `AskUserQuestion` is the explicit yes for that question only, never for a later or changed one; what you record as the human's words is the question and the chosen label, literal, or their free text.

NO-RUNS-COMMIT: never stage ignored files and never use git add -f/--force; .pignolo-ui/ and .pignolo/local/ hold the author's private data (leak-values.json has the user name, home folder and email) and are ignored on purpose. For a backup or WIP commit, commit only code paths by name and leave the ignored folders out.

## Steps

1. **Is the checkout clean?** This lane works in `<main>`, where the human works too. Run `cd "<main>" && git status --porcelain`. If it prints anything besides lines for `.pignolo/tmp/` (pignolo's own temporaries), the human has uncommitted work that your gate, risk check and commit would mix with yours: do not use this lane. Hand the request to the `pignolo:daily` skill (its worktree starts from HEAD and never touches their work), or, if the change needs their uncommitted work, ask the human (category `scope`). Never commit, stash, restore or discard their work.
2. **Open the flow.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" start --flow trivial --cwd "<main>"`. Exit 1 means another flow is running or `run.json` is unreadable: stop and tell the human what the message says (that flow is not yours: do not end it).
3. **Make the change** yourself, in the files of the entry list only, and nothing else.
4. **Gate.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/gate.js" --level on-done --cwd "<main>"`.
   - Exit 0 (`PASS`): go on.
   - `FAIL`: read the log tail; if your change caused it, fix it once and run the gate again; otherwise run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" end --cwd "<main>"`, then stop and tell the human (your edit is still uncommitted in their checkout).
   - `NO_TESTS` (a `code-untested` project): if the change has nothing to test (a comment, a string), write the reason with Write to `<main>/.pignolo/tmp/no-tests-reason.txt` and run the gate again with `--no-tests-reason "<main>/.pignolo/tmp/no-tests-reason.txt"`; if it has behavior, the change is not trivial: go to step 5's escalation.
   - `NO_GATE` or `TREE_CHANGED`: the project's gate is missing or writes files; run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" end --cwd "<main>"`, then stop and tell the human the alternative the gate printed.
5. **Risk on the real diff.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/risk.js" --diff HEAD --cwd "<main>"`. The lane stays trivial only if `level` is `low`, `laneFloor` is `trivial` and `reserved` is false. Otherwise escalate:
   - Undo your own edit with the Edit tool, restoring the exact previous text (never `git restore`, `git checkout -- <file>` or `git stash`).
   - `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" end --cwd "<main>"`.
   - Ask the human (category: the hit's category; `scope` if the lane rose without a hit): 1) redo it in the daily lane (recommended), 2) leave it for them. Never commit here.
6. **Commit.** Write the message with Write to `<main>/.pignolo/tmp/commit-msg.txt`: Conventional Commits in the human's language, then the trailers `Agent: orchestrator` and `Gates: on-done PASS`. Then `cd "<main>" && git add <each changed file by path> && git commit -F "<main>/.pignolo/tmp/commit-msg.txt"`. Never `git add -A` or `git add .`.
7. **Close.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" end --cwd "<main>"`, then a two-layer summary: what changed in plain words; below, the commit, the files and the gate status.

If you stop after step 2 for any reason (the human stops the task, a script fails, a step above does not say what to do), run `run.js end` first (`node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" end --cwd "<main>"`) so the flow stops restricting agents, and tell the human what is left uncommitted.
