---
name: status
description: "Use when the user asks to know whether pignolo is active or which version is installed, in Spanish or English: '¿está prendido pignolo?', 'estado de pignolo', 'qué versión de pignolo tengo', 'is pignolo on?', 'pignolo status'. Shows whether pignolo is on, whether the git guard is active, the plugin version and the result of the guard canary. Only reads; changes nothing. Do not use to switch pignolo on or off: those commands are the human's."
---

Report pignolo's status to the user in their language:
1. Run exactly this command, replacing only `<current directory>` (the git guard blocks any other way of calling the launcher):
   - Bash: `echo '{"source":"status","cwd":"<current directory>"}' | node "${CLAUDE_PLUGIN_ROOT}/hooks/launcher.js" session-start`
   - PowerShell: `'{"source":"status","cwd":"<current directory>"}' | node "${CLAUDE_PLUGIN_ROOT}/hooks/launcher.js" session-start`
   Relay its `systemMessage` verbatim.
2. Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` and report the `version`.
3. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/places.js" report --cwd "<current directory>"`. If its `lines` is greater than 0, repeat its `summary`; otherwise say nothing about it.
4. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/panel.js" show --text --cwd "<current directory>"`. If it prints something, repeat it as plain text (plan, decisions waiting for the user, branches, next step); if it prints nothing, say nothing about it. It only reads.
Do not change any state.
