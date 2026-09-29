<!--
pignolo task-card template (spec §2, §5.2, §6.1). The orchestrator fills it, writes it to
<main>/.pignolo/tmp/task-<id>.md and pastes it whole into the dispatch brief. Internal text:
English. Every path is absolute or relative to the worktree root, always with forward slashes.
-->
# Task-card <id>

- Goal: <one line, from the human's request>
- Requirement (literal): <the human's words, quoted>
- Role: <pignolo:test-writer | pignolo:implementer | pignolo:fixer>
- Worktree: <absolute path>. Run every shell command as `cd "<worktree>" && <command>`; read and edit files only inside it.
- Branch: task/daily/<YYYY-MM-DD>-<slug> · base: <sha> · test reference: <sha or "none yet">
- Files you may touch (the gate rejects any other): <one per line, relative to the worktree root>
- Tests that define done: <paths and test names, or "you write them" for the test-writer>
- test-paths: <globs from project.md> · protected-test-config: <globs>
- Gate: `node "<plugin root>/scripts/gate.js" --level on-done --task` (it runs `<gates.on-done from project.md>` and seals the result; the handback-gate accepts DONE only with that seal for the current tree)
- Risk: <low | medium | high> · reserved decisions authorized by the human: <none, or category + what was authorized>
- Approved visual (optional): <design/approved/<flow>/ with manifest.json, or "none">
- Out of scope: <what not to touch or add>
- Close with exactly one word on the last line: DONE, BLOCKED or NEEDS_CONTEXT.
