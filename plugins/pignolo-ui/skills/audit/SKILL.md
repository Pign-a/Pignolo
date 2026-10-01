---
name: audit
description: "Audit one web screen: rule checks, browser measures and an independent auditor, with every finding citing its evidence. Does not change any file and does not block."
disable-model-invocation: true
---

# /pignolo-ui:audit

Audit the screen the user names. The request: $ARGUMENTS

## Values

These are substituted by Claude Code when the skill loads. The support files in `reference/` do not get substitutions, so every command that needs a path takes it from here.

- `<root>` = `${CLAUDE_PLUGIN_ROOT}`
- `<data>` = `${CLAUDE_PLUGIN_DATA}`
- `<repo>` = the root of the project being audited (the git root of the working directory)

If a value above still starts with `${`, Claude Code did not substitute it: use the default from plugin.json and say so.

## Steps

1. **Environment.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" env`. The first line you print to the user is `pignolo-ui <pluginVersion>`. If `claude.ok` is false, say that this Claude Code cannot be relied on for subagents and mark the audit as "auditoría no independiente".
2. **Prepare the run.** Load `${CLAUDE_PLUGIN_ROOT}/reference/prepare-run.md` and follow it with command `audit`, replacing `<root>` and `<data>` with the values above. This step changes no file of the project. Keep the folder it creates (`<run>`).
3. **Auditor.** Dispatch the auditor with the Agent tool: `subagent_type: "pignolo-ui:ui-auditor"`, `model: "opus"`, and a prompt that contains only the path of `<run>`. The auditor finds everything else in `<run>/run.json` and `<run>/norms.md`. Dispatch it once. If there is no Agent tool, or a hook denies the dispatch, audit it yourself from the same files and say "auditoría no independiente".
4. **Validate.** Copy the last `json` block of the auditor's answer, unchanged, to `<run>/auditor.json` with Write. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" auditor-check --project <repo> --run <run>`. A finding that the script lists in `problems` is removed from the report and counted ("N hallazgos descartados por falta de evidencia"); exit 1 does not stop the audit.
5. **Report.** Write the first line with `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" report-line --facts <run>/facts.json`, where `facts.json` holds `pluginVersion`, `degraded` (for example "sin navegador"), `subagents` (`requested`, `launched`, `model: "opus"`), `sequential` and `notIndependentAudit`. Then list the findings by severity (`bloquea`, `alto`, `medio`, `detalle`), plain words first and the technical id after, each with its evidence; label what is `debt` apart from what is `new`; list `notVerified` with the reason. If the report states rule findings as facts, build `<run>/report.json` with `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" report-skeleton --project <repo> --run <run>` (add the text of each claim you keep) and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/report-check.mjs" --project <repo> --run <run>`; a retired claim is not shown as true.

## Limits

- This command does not block and does not approve anything: it reports. It never edits the project.
- Exit 1 of a script is a finding; exit 2 is "no verificado" with the reason. Never turn "did not run" into "passed".
- Captures stay in the run folder; nothing is published.
