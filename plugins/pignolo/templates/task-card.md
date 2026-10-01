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
- Tests that define done: <paths and test names, each with its `Red is proved by` (`test-first` or `sabotage`), or "you write them" for the test-writer>
- test-paths: <globs from project.md> · protected-test-config: <globs>
- Gate: `node "<plugin root>/scripts/gate.js" --level on-done --task` (it runs `<gates.on-done from project.md>` and seals the result; the handback-gate accepts DONE only with that seal for the current tree)
- Risk: <low | medium | high> · reserved decisions authorized by the human: <none, or category + what was authorized>
- Approved visual (optional): <design/approved/<flow>/ with manifest.json, or "none">. If set, the implementer first runs `node "<plugin root>/scripts/approved-verify.js" --path "design/approved/<flow>"` from the worktree and ends BLOCKED on exit 1 (the orchestrator committed the folder and its decision in `int/<plan>` first)
- Out of scope: <what not to touch or add>
- Close with exactly one word on the last line: DONE, BLOCKED or NEEDS_CONTEXT.

## Test-card (role pignolo:test-writer only; one block per test, spec §9.1)

The orchestrator fills one block per test before dispatching the test-writer. The test-writer
fills nothing here: it reads it, writes the test and reports against it.

- Behavior: <what the test checks, in one line>
- Origin of the expected value: <the literal words of the requirement or repro-spec it comes from; `characterization` only when it can only come from running the code, and then the test is labelled `characterization`>
- Protects: <requirement or ledger id> · the test file starts with `Protects: <id> · Breaks if: <what>` in its first 20 lines (the gate lists new test files without it)
- What to break: <the behavior change that must turn the test red, said as behavior, not as code>
- How red looks: <the failing assertion or message expected>
- What else would make it pass: <a wrong implementation the test must still catch, or "none">
- Level: <unit | integration | e2e> · Doubles: <none | fake | mock, and the contract they are typed against> · Real path: <the call chain the test exercises>
- Data: synthetic only; never real names, credentials or customer data.
- Where: <path inside test-paths>, or, for a holdout acceptance test (plan mode), the absolute path `<main>/.pignolo/tmp/holdout/<plan>/<path>` in the main checkout, never in the task worktree (git ignores it only in the main checkout; right after accepting the test-writer, the orchestrator moves it out of the repo with `holdout.js save`)
- Red is proved by: <`test-first` (the behavior does not exist at base: running the test fails) | `sabotage` (the behavior already exists: after the implementer's change is committed, with the tree clean and the gate green, the orchestrator writes the break as a patch and runs `node "<plugin root>/scripts/sabotage.js" --patch "<file>" --gate on-done --cwd "<worktree>" --timeout-min 4`)>
