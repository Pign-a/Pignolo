---
name: trivial
description: Entered only through pignolo:entry, when it picked the trivial lane. Makes a one-line or mechanical change in the main checkout, seals the on-done gate, re-checks the risk floor on the real diff and commits. No review.
---

You are the orchestrator in the main conversation. `<main>` is the project root from the entry skill. Talk to the human as the entry skill says: two layers (`${CLAUDE_PLUGIN_ROOT}/templates/question.md`), one step per message, a category on every question, facts only from script output.

## Steps

1. **Open the flow.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" start --flow trivial --cwd "<main>"`. Exit 1 means another flow is running or `run.json` is unreadable: stop and tell the human what the message says.
2. **Make the change** yourself, in the files of the entry list only, and nothing else.
3. **Gate.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/gate.js" --level on-done --cwd "<main>"`.
   - Exit 0 (`PASS`): go on.
   - `FAIL`: read the log tail; if your change caused it, fix it once and run the gate again; otherwise stop and tell the human.
   - `NO_TESTS` (a `code-untested` project): if the change has nothing to test (a comment, a string), write the reason with Write to `<main>/.pignolo/tmp/no-tests-reason.txt` and run the gate again with `--no-tests-reason "<main>/.pignolo/tmp/no-tests-reason.txt"`; if it has behavior, the change is not trivial: go to step 4's escalation.
   - `NO_GATE` or `TREE_CHANGED`: the project's gate is missing or writes files; stop and tell the human the alternative the gate printed.
4. **Risk on the real diff.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/risk.js" --diff HEAD --cwd "<main>"`. The lane stays trivial only if `level` is `low`, `laneFloor` is `trivial` and `reserved` is false. Otherwise escalate:
   - Undo your own edit with the Edit tool, restoring the exact previous text (never `git restore`, `git checkout -- <file>` or `git stash`).
   - `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" end --cwd "<main>"`.
   - Ask the human (category: the hit's category; `scope` if the lane rose without a hit): 1) redo it in the daily lane (recommended), 2) leave it for them. Never commit here.
5. **Commit.** Write the message with Write to `<main>/.pignolo/tmp/commit-msg.txt`: Conventional Commits in the human's language, then the trailers `Agent: orchestrator` and `Gates: on-done PASS`. Then `cd "<main>" && git add <each changed file by path> && git commit -F "<main>/.pignolo/tmp/commit-msg.txt"`. Never `git add -A` or `git add .`.
6. **Close.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" end --cwd "<main>"`, then a two-layer summary: what changed in plain words; below, the commit, the files and the gate status.
