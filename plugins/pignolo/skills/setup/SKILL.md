---
name: setup
description: Check the environment, choose the model profile, add pignolo's permission rules and review rule conflicts. Human-only.
disable-model-invocation: true
---

Guide the human through pignolo's setup. Speak to them in their language. Never edit any user rule file.

## How to present each step

- **One step per message.** Each message covers one step and ends with at most one question. Wait for the answer before the next step. Never put two steps in one message.
- **Two parts per step, always in this order:**
  1. **In plain words** (heading in the human's language, e.g. "En pocas palabras"): 1 to 3 short lines, no jargon, no file paths, no counts. Say what this step means for them and what they have to decide.
  2. **Technical detail** (heading in the human's language, e.g. "Detalle técnico"): below the plain part, for whoever wants it. Commands run, files and paths, exact counts, rule lists grouped by purpose.
- Every count and path you state comes from the script's JSON. Never count by hand.
- Keep lists short: group rules by purpose (one line per group), never list every rule.

## Steps

1. **Environment check.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" check`.
   - Plain: "your machine is ready" or the one or two things that matter, in simple terms.
   - Technical: the checklist (node, git version, `gh`, PowerShell, superpowers, agent teams, forced subagent model). Meaning of each warning:
     - git older than 2.31: no backups (hooks unsupported).
     - no `powershell.exe`: PowerShell commands cannot be verified.
     - superpowers present: it overlaps with pignolo; recommend uninstalling it after trying pignolo.
     - agent teams on: not supported.
     - `subagentModelForce` true, or an `availableModels` list that excludes `opus` or `sonnet`: the profile will not apply. Name the variable (`CLAUDE_CODE_SUBAGENT_MODEL_FORCE`) or the setting (`availableModels`) to change.
2. **Profile.** Ask which profile to use.
   - Plain: one line per profile about cost and speed ("max: the most careful and the most expensive", and so on), and the recommendation.
   - Technical:
     - `max`: opus almost everywhere; parallelism 3; 3 refuters on high risk.
     - `balanced`: opus for research, reviewers and debugging, sonnet for implementers; parallelism 2.
     - `economy`: sonnet where it is safe; parallelism 1; presentation defaults to text.
     - Reviewers and auditors run on opus in every profile, `economy` included (author decision), because a weaker reviewer approves silently.
   Write the choice with `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" config --profile <profile>` (optionally `--presentation ask|artifact|text` and `--language <language>`).
   When the profile is `economy` (just chosen, or already set per `check`), the JSON carries a `notice` with `plain` and `technical` text (measured figures, spec §7). Show it verbatim, plain first and then technical; for other profiles there is no `notice`.
3. **Permissions.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" permissions --target user` (and again with `--target project` if they want it there). Nothing is written yet.
   - Plain: what the rules do in simple terms (commands that lose work are blocked; push, merge and deleting branches ask first), and the question: for all projects, only this one, or none.
   - Technical: the counts from the JSON (`add.deny.length`, `add.ask.length`, `already`), the target paths, the rules grouped by purpose, and the side effects (for example, the broad MCP `ask` rules).
   Only after an explicit yes from the human, in their own turn, run the same command with `--apply`. It writes a `.pignolo-bak-<timestamp>` backup first when the file exists and keeps every existing rule.
4. **Rule conflicts.** Read `~/.claude/CLAUDE.md`, the project `CLAUDE.md` and `.claude/rules/*.md`, and compare them with `${CLAUDE_PLUGIN_ROOT}/rules/core.md`.
   - Plain: how many conflicts there are and, for each one, a one-line "what changes for you" and who wins (on safety the human's rule wins; on process pignolo's wins).
   - Technical: each conflict quoting both sides.
   Build one entry per conflict and write them with the Write tool (never through shell quotes) to a temporary JSON file: `[{ "source": { "path", "quote" }, "pignolo": { "rule": 1-6, "quote" }, "resolution": "human"|"pignolo"|"custom", "note"?, "project"? }]`. Put the project root in `project` for conflicts from a project file.
   - Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" conflicts --check <file>`: it returns as `pending` only the conflicts the human has not resolved yet (or whose quoted text changed). Ask only about those, one per message, with the two parts above.
   - After each answer, write the resolved entry (with its `resolution`, and the human's own words in `note` when `custom`) to a file with Write and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" conflicts --record <file>`. Nothing is asked twice.
   The human confirms. Do not edit any of their rules.
5. **Engram.** Plain: it arrives in milestone 6; nothing to decide. No technical part needed.
6. **Threat model.** Plain: if they will use `auto` or `bypassPermissions` with content from outside (web pages, third-party issues or repos), working inside an isolated environment is safer. Technical: WSL2 with `/sandbox`, or a devcontainer.
7. **Summary.** Plain: one line with what is now set up. Technical: what was written and where, using the exact paths the script returned: the config file (`~/.pignolo/config.json`, as resolved), the settings file, and the backup path or "none: the file did not exist". Also list how the human resolved each rule conflict, saved in `~/.pignolo/rule-conflicts.json` (the path `conflicts --list` returns).
