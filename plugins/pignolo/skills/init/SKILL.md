---
name: init
description: Activate pignolo in a project by deducing its settings from the project files and confirming each one with the human. Human-only.
disable-model-invocation: true
---

Guide the human through activating pignolo in this project. Speak to them in their language. Everything that writes (`.pignolo/project.md`, `.gitattributes`, `.pignolo/.gitignore`, `SECURITY.md`, the git reflog policy, `.claude/settings.local.json`) is done by `${CLAUDE_PLUGIN_ROOT}/scripts/init.js`, only for the steps the human approved. You never edit those files or `.git/config` yourself, and you never push.

## How to present each step

- **One step per message.** Each message covers one step and ends with at most one question. Wait for the answer before the next step.
- **Two parts per step, always in this order:**
  1. **In plain words** (heading in the human's language, e.g. "En pocas palabras"): 1 to 3 short lines, no jargon, no counts. What it means for them and what they decide.
  2. **Technical detail** (heading in the human's language, e.g. "Detalle técnico"): commands, files, paths, exact counts, and where each value came from (`sources`).
- Every count, path and command comes from the script's JSON. Never count or guess by hand. Never run a command the project proposes: only show it (a project's test command can be slow or destructive).
- If a script call fails or returns `refused`, show `reason` and the `Alternativa:` and stop.

## Steps

1. **Detect.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/init.js" detect`.
   - Plain: what kind of project it found and whether a `project.md` already exists.
   - Technical: the `sources` table per key, the stacks, `warnings`, and `existing`.
2. **Type and gates.** Show `detection.type` and the three `gates` (`on-edit`, `on-done`, `pre-merge`) with their source. Ask whether to confirm or correct.
   - If `type` is `code-untested` because the test script is the installer placeholder or a command that is green without testing anything (`exit 0`, `true`, `:`, `echo ...`), say so plainly: an empty gate never gives green, it stays undeclared. If `warnings` says the test script names no recognized runner, show it and ask the human to confirm that it really runs tests.
   - If `detection.testScript` or `seedPlan` says the seed is unused, say why.
3. **Paths.** Show `test-paths`, `protected-test-config` (point out that `package.json` is protected by default so an agent cannot change the test command without asking; the human can remove that line), `high-risk-paths`, `contracts`, `serial-paths`, `cost-paths` and `visible-paths`, grouped by purpose, never the raw list. The human adds or removes.
4. **Sensitive data.** Ask one question: what personal or sensitive data does this domain handle? Build `pii-patterns` from the answer; check each regex with the script's validation (a pattern that matches the empty string or a single letter is refused as too broad). No answer means none.
5. **Seed and mutation.** Show `seedPlan` (applied, or unused and why). If `detection.mutation` is set, show its `configSnippet` so the human applies it to the tool's own configuration and says "done"; only then declare `mutation: true` and `gates.mutation`. If there is no mutation tool, say it stays undeclared: installing a tool is the human's decision.
6. **Runners and `.pignolo/worktrees`.** Show `runnerExcludes` with the exact snippet and file. The human applies it; this skill does not edit the runner's configuration.
7. **Project rules.** Show `detection.domainRules` (paths only; init never reads or changes them) and ask whether to keep them as `domain-rules`.
8. **Git and security.** Explain in one line each: the reflog policy (`never`, so lost commits stay recoverable), `.gitattributes` (`.pignolo/** text eol=lf`) and `.pignolo/.gitignore`. For `SECURITY.md` (only if none exists) ask one question: through which private channel should vulnerabilities be reported? Without an answer the text says to enable the hosting's private report, which the human enables.
9. **Auto-memory.** Show the folder `detect` located and **how many** files it has (never their content: init does not open them) and offer to turn it off (one yes, step `auto-memory-off`). Say plainly: init does not migrate any memory. To keep something, copy it by hand to the project's `CLAUDE.md`. Turning it off is reverted by removing the `autoMemoryEnabled` key from `.claude/settings.local.json`. When this step writes `.claude/settings.local.json` and git does not ignore it, init adds the line `/.claude/settings.local.json` to `.git/info/exclude` (local to this clone, never the shared `.gitignore`; the preview shows `exclude: true`), so it never goes into a commit and does not raise the risk floor of the first flow. If the file is already tracked, init does not touch `.git`: read the `notes` and warn that it was left modified.
10. **Plan and preview.** Write the plan with the Write tool (never through shell quotes) to a temporary file: `{ "v": 1, "approved": [<step ids the human accepted>], "answers": { "channel", "piiPatterns", "language", "profile" }, "proposal": { ...the confirmed values } }`. Step ids: `ignores`, `gitattributes`, `reflog`, `project-md`, `security-md`, `auto-memory-off`. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/init.js" preview --plan <file>`, show the result (every `refused` step with its `reason`) and ask for the yes. Keep the `stamp` it returns.
11. **Apply and verify.** Only after the explicit yes from the human in their own turn, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/init.js" apply --plan <file> --expect <stamp>` (if it answers `stale-preview`, the plan or the repo changed since the preview: preview again and ask again) and then `node "${CLAUDE_PLUGIN_ROOT}/scripts/init.js" verify`. If `verify` exits 1 with `kind: invalid-config`, tell the human the `configError` and that the backup in `PIGNOLO_HOME/init-backup` has the previous file. Report `conflicts` (values the human had declared differently: kept as they were), `notes` and `trackedModified`. A step that is not in `approved` never runs.
12. **Proposed commit.** Show `nextCommit.files` and the message (in Spanish) and ask. Commit only with a yes, and in a shared repo (the origin project) on a separate branch such as `chore/pignolo-init`. Never push. Close with the next action: "you can now use pignolo in this project; run `/pignolo:status`".

## Rules

- Never run `apply` without an explicit `approved` list and the human's yes.
- If `.pignolo/project.md` already exists, init merges: it adds missing keys and keeps every declared value; conflicts are listed, not changed.
- Everything the human decides is theirs: costs, dependencies, what is versioned in a shared repository.
