# Setup: MCP "ask" rules and retired rules

Loaded by step 3 of the `setup` fast flow and step 3 of its review point by point.

## MCP "ask" rules (one plain line on the screen)

Those "ask" rules win over "do not ask again" and over a global `allow`, and live in `permissions.ask` of `~/.claude/settings.json` or the project's `.claude/settings.json`.

## Retired rules

- Before the screen, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" retired`. It writes nothing.
- If `total` > 0, add one plain line to the screen: old rules pignolo added before (they asked for harmless things such as opening a page) can be removed, naming each `files[].file` with a non-empty `remove`. An entry with `error` is left untouched: say so in one line.
- Fast flow: the one yes to **Apply the recommended setup** covers this too. Only after that yes run `setup.js retired --apply`: it backs up each file first and removes only the exact old strings pignolo added, only from `permissions.ask`. Report each `backup` path in the summary.
- Review point by point: after the permissions step, offer to remove them and run `--apply` only after an explicit yes from the human, in their own turn.
- If `total` is 0, say nothing about it.
