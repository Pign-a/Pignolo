---
name: setup
description: Check the environment, choose the model profile, add pignolo's permission rules and review rule conflicts. Human-only.
disable-model-invocation: true
---

Guide the human through pignolo's setup, one step at a time. Speak to them in their language. Never edit any user rule file.

1. **Environment check.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" check` and show the result as a checklist:
   - git older than 2.31: no backups (hooks unsupported).
   - no `powershell.exe`: PowerShell commands cannot be verified.
   - superpowers present: it overlaps with pignolo; recommend uninstalling it after trying pignolo.
   - agent teams on: not supported.
   - `subagentModelForce` true, or an `availableModels` list that excludes `opus` or `sonnet`: the profile will not apply. Name the variable (`CLAUDE_CODE_SUBAGENT_MODEL_FORCE`) or the setting (`availableModels`) to change.
2. **Profile.** Explain the three profiles and ask which one to use:
   - `max`: opus almost everywhere; parallelism 3; 3 refuters on high risk.
   - `balanced`: opus for research, reviewers and debugging, sonnet for implementers; parallelism 2.
   - `economy`: sonnet where it is safe; parallelism 1; presentation defaults to text.
   - Warn that reviewers and auditors run on opus in every profile, `economy` included (author decision), because a weaker reviewer approves silently.
   Write the choice with `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" config --profile <profile>` (optionally `--presentation ask|artifact|text` and `--language <language>`).
3. **Permissions.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" permissions --target user` (and again with `--target project` if they want it there). Show the rules that would be added and ask: user, project or none. Only after an explicit yes from the human, in their own turn, run the same command with `--apply`. It writes a `.pignolo-bak-<timestamp>` backup first and keeps every existing rule.
4. **Rule conflicts.** Read `~/.claude/CLAUDE.md`, the project `CLAUDE.md` and `.claude/rules/*.md`, and compare them with `${CLAUDE_PLUGIN_ROOT}/rules/core.md`. List each conflict quoting both sides, with the precedence: on safety the human's rule wins; on process pignolo's wins. The human confirms each one. Do not edit any of their rules.
5. **Engram.** Tell them it arrives in milestone 6.
6. **Threat model.** If they plan to use `auto` or `bypassPermissions` with prompt-injection risk, recommend WSL2 with `/sandbox` or a devcontainer.
7. **Summary.** End with what was written and where: config file, settings file, backup path.
