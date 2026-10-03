---
name: audit
description: "Use when the user asks to audit, review or check a web screen for design, accessibility or quality problems, in Spanish or English: 'auditá la pantalla de login', 'revisá si la página cumple el diseño', 'fijate qué está mal en esta vista', 'audit this page', 'check the accessibility of the dashboard'. Runs rule checks, browser measures and an independent auditor; every finding cites its evidence. Changes no screen and does not block on findings. Needs the product and the design defined first (pignolo-ui:define). Do not use for a code review or a bug: those go through the normal flow (pignolo:entry)."
---

# /pignolo-ui:audit

Audit the screen the user names. The request: $ARGUMENTS

## Values

These are substituted by Claude Code when the skill loads. The support files in `reference/` do not get substitutions, so every command that needs a path takes it from here.

- `<root>` = `${CLAUDE_PLUGIN_ROOT}`
- `<data>` = `${CLAUDE_PLUGIN_DATA}`
- `<repo>` = the root of the project being audited (the git root of the working directory)

If a value above still starts with `${`, Claude Code did not substitute it: use the default from plugin.json and say so.

## Foundation gate

This skill does not work on a project whose product and design are not defined. Right after step 1 and before step 2, read `<repo>/PRODUCT.md` and `<repo>/DESIGN.md`, load `${CLAUDE_PLUGIN_ROOT}/reference/foundation.md` and follow it. If either is missing or undecided, stop and send the user to `/pignolo-ui:define`; go on without it only after the user asked for that explicitly, twice, as that file says, with the pending note in the project's `CLAUDE.md`. An "Ok" is not that request. A skipped gate is said in the report: the first line adds `sin definición inicial` and the `J-nn` findings go apart. Step 2 never starts before this gate is passed or explicitly skipped.

## Steps

0. **Confirm (only if you chose this skill yourself).** If the turn carries a `<command-name>` tag for this skill, go to step 1. Otherwise run nothing yet and ask with AskUserQuestion, as `${CLAUDE_PLUGIN_ROOT}/reference/activation.md` (section `audit`) says: recommended first, "Usar pignolo-ui (Recomendado)", then "Hacerlo directo", which ends this skill.

1. **Environment.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" env`. The first line you print to the user is `pignolo-ui <pluginVersion>`. If `claude.ok` is false, say that this Claude Code cannot be relied on for subagents and mark the audit as "auditoría no independiente".
2. **Prepare the run (only after the foundation gate).** Load `${CLAUDE_PLUGIN_ROOT}/reference/prepare-run.md` and follow it with command `audit`, replacing `<root>` and `<data>` with the values above. This step changes no file of the project. Keep the folder it creates (`<run>`). Load `${CLAUDE_PLUGIN_ROOT}/reference/context.md` and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" context --project <repo> --run <run> --values-file <values>` (its first lines say how to create that file): say its `line` once when it is not null (a `PRODUCT.md` that is invalid is ignored and said). Audit never creates `PRODUCT.md` or `DESIGN.md`, and after a skipped gate it never proposes an extracted `DESIGN.md` as decided.
3. **Auditor.** Dispatch the auditor with the Agent tool: `subagent_type: "pignolo-ui:ui-auditor"`, `model: "opus"`, and a prompt that contains only the path of `<run>`. The auditor finds everything else in `<run>/run.json` and `<run>/norms.md`. Dispatch it once. If there is no Agent tool, or a hook denies the dispatch, audit it yourself from the same files and say "auditoría no independiente".
4. **Validate.** Copy the last `json` block of the auditor's answer, unchanged, to `<run>/auditor.json` with Write. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" auditor-check --project <repo> --run <run>`. A finding that the script lists in `problems` is removed from the report and counted ("N hallazgos descartados por falta de evidencia"); exit 1 does not stop the audit.
5. **Report.** Write the first line with `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" report-line --facts <run>/facts.json`, where `facts.json` holds `pluginVersion`, `degraded` (for example "sin navegador"), `subagents` (`requested`, `launched`, `model: "opus"`), `sequential` and `notIndependentAudit`. Then list the findings by severity (`bloquea`, `alto`, `medio`, `detalle`), plain words first and the technical id after, each with its evidence; label what is `debt` apart from what is `new`; list `notVerified` with the reason. If the report states rule findings as facts, build `<run>/report.json` with `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" report-skeleton --project <repo> --run <run>` (add the text of each claim you keep) and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/report-check.mjs" --project <repo> --run <run>`; a retired claim is not shown as true.

## Limits

- This command does not block on findings and does not approve anything: it reports. It waits for the foundation gate. It never edits the project, except the pending note of `foundation.md` in `CLAUDE.md`, with a confirmed diff.
- Exit 1 of a script is a finding; exit 2 is "no verificado" with the reason. Never turn "did not run" into "passed".
- Captures stay in the run folder; nothing is published.
