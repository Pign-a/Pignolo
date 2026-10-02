---
name: status
description: Show whether pignolo is on, whether the git guard is active, the plugin version and the result of the guard canary.
disable-model-invocation: true
---

Report pignolo's status to the user in their language:
1. Run exactly this command, replacing only `<current directory>` (the git guard blocks any other way of calling the launcher):
   - Bash: `echo '{"source":"status","cwd":"<current directory>"}' | node "${CLAUDE_PLUGIN_ROOT}/hooks/launcher.js" session-start`
   - PowerShell: `'{"source":"status","cwd":"<current directory>"}' | node "${CLAUDE_PLUGIN_ROOT}/hooks/launcher.js" session-start`
   Relay its `systemMessage` verbatim.
2. Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` and report the `version`.
3. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/places.js" report --cwd "<current directory>"`. If its `lines` is greater than 0, repeat its `summary`; otherwise say nothing about it.
Do not change any state.
