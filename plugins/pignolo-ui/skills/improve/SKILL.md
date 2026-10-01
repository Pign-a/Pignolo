---
name: improve
description: "Improve one existing web screen: inspect it, let the user say what bothers them, generate improved versions, apply the chosen one without breaking anything and confirm with before and after evidence."
disable-model-invocation: true
---

# /pignolo-ui:improve

Improve the screen the user names (a local URL or a file). The request: $ARGUMENTS

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
2. **Inspect.** Load `${CLAUDE_PLUGIN_ROOT}/reference/prepare-run.md` and follow it with command `improve`: URL or path, then the batch inspection (`measure`, `capture`, `dom`, `check`). That is the "before"; it is never written again. Then dispatch the auditor as in `/pignolo-ui:audit` (`subagent_type: "pignolo-ui:ui-auditor"`, `model: "opus"`, only the path of the run), copy its `json` block unchanged to `<run>/auditor.json` and run `run.mjs auditor-check`. If the problem is in `DESIGN.md`, first propose completing it as a diff the user confirms.
3. **Symptom menu, in the chat.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" menu --run <run>` and show the numbered list in the user's words, pre-ticked with what the scripts found, with the symptom id in parentheses at the end of each line. The user answers in their own turn. Save their words to `<run>/words.txt` and translate them with `run.mjs menu --run <run> --words-file <run>/words.txt` (`matched`). Never decide the symptoms for them.
4. **Versions.** Load `${CLAUDE_PLUGIN_ROOT}/reference/options.md` and generate `<N>` improved versions of the screen, each a navigable HTML flow, one round plus at most one regeneration. Give each the findings the user chose and a text summary of the "before" capture, never the image.
5. **Present and choose.** Load `${CLAUDE_PLUGIN_ROOT}/reference/present-and-choose.md`. The user chooses or combines in their own turn. What they choose is saved as approved: `approve.mjs save` and `approve.mjs record` (the diff is shown and the user confirms before `--write`), as described in that file.
6. **Apply.** Load `${CLAUDE_PLUGIN_ROOT}/reference/apply.md` with the approved path: a batch of at most 5 files and 200 lines, tokens first, verified, reverted only after showing what `restore` will delete.
7. **Confirm (at most once), in `<run>/after/`.** The "after" never overwrites the "before": run, in this order, `node "${CLAUDE_PLUGIN_ROOT}/scripts/browser.mjs" measure --project <repo> --run <run>/after --url <URL> --before <run>/browser.json` (or `--file <path>`), then `capture` and `dom` with the same arguments (same widths and themes), then `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" check --project <repo> --run <run>/after --files <touched files> --base <base>`. Write nothing new into `<run>/` itself. Build the before and after: closed findings (each citing the data of the second reading), new findings (floor rules block), debt left untouched, and the structural comparison with the approved decision (write `<run>/map.json` first, as `{ "<screen>.html": "<local URL or project path of that screen>" }`): `node "${CLAUDE_PLUGIN_ROOT}/scripts/compare.mjs" approved --project <repo> --approved <approved> --map <run>/map.json --run <run>/after`. That comparison is informational only: differences are reported and never block.
8. **Report.** Build the skeleton with `run.mjs report-skeleton --project <repo> --run <run>/after --implements <approved>`, add the text of each claim you keep, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/report-check.mjs" --project <repo> --run <run>/after` and then `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" verdict --project <repo> --run <run>/after`. The `status` it prints is the word of the report; say "terminado" only when the verdict says `terminado`. The first line of the report comes from `run.mjs report-line` (subagents launched of requested, model as requested).

## Limits (spec section 6)

One batch inspection, one round of versions (plus at most one regeneration), one batch of fixes, at most one confirmation. When a limit is reached, what is left is reported as pending and the flow ends.

- Every version (mockup, capture and diff) stays in the run folder.
- The canvas "Design" is not available in v1: the versions are shown with the local `compare.html` page and nothing is published.
- Exit 1 of a script is a finding; exit 2 is "no verificado" with the reason.
