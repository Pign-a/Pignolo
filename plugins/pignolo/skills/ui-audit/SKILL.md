---
name: ui-audit
description: "Use when the user asks to audit, review or check a web screen for design, accessibility or quality problems, in Spanish or English: 'auditá la pantalla de login', 'revisá si la página cumple el diseño', 'fijate qué está mal en esta vista', 'audit this page', 'check the accessibility of the dashboard'. Runs rule checks, browser measures and an independent auditor; every finding cites its evidence. Changes no screen and blocks nothing. Do not use for a code review or a bug."
---

# ui-audit: check one screen against the design

Audit the screen the user names. The request: $ARGUMENTS

It is requested on its own (`/pignolo:ui-audit` or the phrases above) and is not part of `validate`: `validate` never launches it. It reports; it edits no screen, approves nothing and blocks nothing. Everything stays on the machine: captures live in the run folder and are never published.

## Values

Claude Code substitutes these when the skill loads. Files in `references/` get no substitution, so every command takes its paths from here.

- `<root>` = `${CLAUDE_PLUGIN_ROOT}`
- `<data>` = `${CLAUDE_PLUGIN_DATA}`
- `<repo>` = the git root of the project being audited

If a value still starts with `${`, Claude Code did not substitute it: say so and ask for the plugin path.

## Steps

1. **Environment.** Run `node "<root>/ui-audit/scripts/audit.mjs" env`. The first line you print is built in step 5. If `claude.ok` is false, subagents cannot be relied on: mark the audit "auditoría no independiente".
2. **Design notice (nothing blocks).** Look for `<repo>/design.md`; an existing `DESIGN.md` is the same file on Windows, so use whichever exists. If found, run `node "<root>/ui-audit/scripts/design-md.mjs" validate --file <design> --project <repo>`. The audit reads the tokens in its YAML frontmatter and compares the screen against them. If the file is missing or the tokens cannot be parsed, audit against the base norms and say it on the first line ("sin design.md: normas base"), with the reason: without the project's tokens there is nothing project-specific to compare. Never write a design file here.
3. **Prepare the run.** Load `references/prepare-run.md` and follow it with command `audit`, replacing `<root>`, `<data>` and `<repo>` with the values above. It creates `<run>`, measures with whatever browser tool exists and runs the rule check. It changes no file of the project.
4. **Auditor.** Dispatch the `ui-auditor` agent with the Agent tool (`model: "opus"`), giving only the path of `<run>`. Dispatch it once. Without an Agent tool, or if the dispatch is denied, audit it yourself from the same files and mark "auditoría no independiente".
5. **Validate and report.** Save the last `json` block of the auditor's answer, unchanged, as `<run>/auditor.json`. Run `node "<root>/ui-audit/scripts/audit.mjs" auditor-check --project <repo> --run <run>`. A finding listed in `problems` is dropped and counted ("N hallazgos descartados por falta de evidencia"); exit 1 does not stop the audit. Write `<run>/facts.json` (`pluginVersion`, `degraded`, `subagents` with `requested`, `launched`, `model: "opus"`, `notIndependentAudit`) and print `node "<root>/ui-audit/scripts/audit.mjs" report-line --facts <run>/facts.json` as the first line (it starts with `pignolo ui-audit <version>`). Then list the findings by severity (`bloquea`, `alto`, `medio`, `detalle`): plain words first, the technical id after, each with its evidence; keep `debt` apart from `new`; list `notVerified` with the reason. If the report states rule findings as facts, build `<run>/report.json` with `audit.mjs report-skeleton --project <repo> --run <run>`, add the text of each claim you keep, and run `node "<root>/ui-audit/scripts/report-check.mjs" --project <repo> --run <run>`: a retired claim is not shown as true.

## Not verified, never "passed"

- Without a browser, or without a local URL that answers (`localhost`, `127.0.0.1`, `::1`), the browser measures are `no verificado` with the reason; only the checks over the source files run, and the first line says "sin navegador". A screen that asks for a login is `no verificado (requiere sesión)`: do not log in and do not ask for credentials.
- Exit 1 of a script is a finding; exit 2 means the step did not run: report `no verificado` with the reason. Never turn "did not run" into "passed", and never say "pasó" about something that was not measured.
- Findings that depend on judgment (`J-nn`) are opinions with a cited basis, not proofs; say so.

## Language

Print to the author in Spanish. Keep file names, ids and commands as they are.
