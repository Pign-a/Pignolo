---
name: new
description: "Create a new web screen or flow: confirm DESIGN.md, write a brief with the user, generate options as navigable HTML, let the user choose, implement without breaking anything and verify with evidence."
disable-model-invocation: true
---

# /pignolo-ui:new

Create the screen the user names. The request: $ARGUMENTS

## Values

These are substituted by Claude Code when the skill loads. The support files in `reference/` do not get substitutions, so every command that needs a value takes it from here.

- `<root>` = `${CLAUDE_PLUGIN_ROOT}`
- `<data>` = `${CLAUDE_PLUGIN_DATA}`
- `<N>` = `${user_config.optionsPerDecision}`
- `<presentation>` = `${user_config.presentation}`
- `<repo>` = the root of the project (the git root of the working directory)

If a value above still starts with `${`, Claude Code did not substitute it (a setting the user never saved arrives like that): use the default from plugin.json (`<N>` is 3, `<presentation>` is auto) and say so.

## Steps

1. **Environment.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" env`. The first line you print to the user is `pignolo-ui <pluginVersion>`. If `claude.ok` is false, use the sequential path of `options.md` and say so.
2. **DESIGN.md first.** Load `${CLAUDE_PLUGIN_ROOT}/reference/prepare-run.md` with command `new` (create the run and read the configuration and the norms). Then:
   - If `DESIGN.md` exists, validate it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/design-md.mjs" validate ...` and complete what is missing as a diff the user confirms.
   - If it does not exist but the project has styles, propose it with `design-md.mjs extract` as a diff the user confirms, with the tokens marked "extraídos, no decididos". No new directions unless the user asks for them.
   - If the project is empty, generate `<N>` style tiles with `${CLAUDE_PLUGIN_ROOT}/reference/options.md` (`--kind direction`) and show them with `${CLAUDE_PLUGIN_ROOT}/reference/present-and-choose.md`: one round, no refinement round. Save the chosen one in this order: first `approve.mjs save --flow direction` (it lands in `design/approved/direction`), then create `DESIGN.md` from the template with the tokens of the `:root` of the chosen tile: write the operations to `<run>/design-ops.json` and show the diff with `node "${CLAUDE_PLUGIN_ROOT}/scripts/design-md.mjs" patch --file "${CLAUDE_PLUGIN_ROOT}/templates/DESIGN.md" --ops <run>/design-ops.json` (it writes nothing). Only after the user confirms it, run the same command adding `--out <repo>/DESIGN.md`, which creates the new file and never overwrites anything. Never use `--write` on the template: it lives in the plugin and is not yours to change. Only then `approve.mjs record` (it needs `DESIGN.md`).
3. **Brief, in text.** Write it and have the user confirm it in their own turn: what the screen is, who uses it, the main action, the inventory of real content, the reading order, and the list of screens in order (the first is the main one). What is missing goes in as a marker `‹what goes here›` with `data-sample`, never invented testimonials, logos, metrics, prices or people, and no brand headlines unless the user gives them (if asked, 2 or 3 proposals, labelled).
4. **Options.** Load `${CLAUDE_PLUGIN_ROOT}/reference/options.md` and generate `<N>` mockups, each a navigable flow, with the checks it describes (one round plus at most one regeneration).
5. **Choose or combine.** Follow `${CLAUDE_PLUGIN_ROOT}/reference/present-and-choose.md`: local comparison page, the choice from the user's own turn, `approve.mjs save` and `approve.mjs record` with the confirmed diff.
6. **Implement.** Follow `${CLAUDE_PLUGIN_ROOT}/reference/apply.md`, passing it the path of the approved decision and the list of expected files. With the pignolo core active, its `implementer` receives the same path and list; while its hook denies `pignolo-ui:ui-option`, use the sequential path.
7. **Verify, in `<run>/after/`.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/browser.mjs" measure --project <repo> --run <run>/after --url <URL>` (or `--file`), then `capture` and `dom` with the same arguments, at the widths of the mockup, then `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" check --project <repo> --run <run>/after --files <touched files> --base <base>`. Then `compare.mjs approved` (write `<run>/after/map.json` first: `{ "<screen>.html": "<local URL or project path>" }`): `node "${CLAUDE_PLUGIN_ROOT}/scripts/compare.mjs" approved --project <repo> --approved <approved> --map <run>/after/map.json --run <run>/after`, informational only. Copy `<run>/run.json` and `<run>/norms.md` into `<run>/after/` with Write and run the auditor on `<run>/after` exactly as `/pignolo-ui:audit` does (`subagent_type: "pignolo-ui:ui-auditor"`, `model: "opus"`, `auditor-check`).
8. **Report.** `run.mjs report-skeleton --project <repo> --run <run>/after --implements <approved>`, then `node "${CLAUDE_PLUGIN_ROOT}/scripts/report-check.mjs" --project <repo> --run <run>/after` and `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" verdict --project <repo> --run <run>/after --build-ok yes|no`, where `yes|no` is the result of the first `typecheck`, `build` or `lint` script of `package.json` that you ran (`apply.md` step 5); leave `--build-ok` out only when the project declares none. A project that declares one and gets no `--build-ok` is `sin verificar`. Say "terminado" only when the verdict says `terminado`. The first line of the report comes from `run.mjs report-line`.

## Limits (spec section 6)

One round of directions, only when the project is empty. Then one round of mockups (plus at most one regeneration), one implementation, one batch check, one batch of fixes and at most one confirmation. When a limit is reached, what is left is reported as pending and the flow ends.

- The canvas "Design" is not available in v1: options are shown with the local `compare.html` page and nothing is published.
- Exit 1 of a script is a finding; exit 2 is "no verificado" with the reason.
