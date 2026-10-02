# Generate the options (shared by new and improve)

Markers: `<root>` is the plugin root, `<N>` the number of options per decision (`1` or `3`), `<profile>` the profile (`max`, `balanced` or `economy`), `<model>` the model that `option-model` prints, `<repo>` the project root, `<run>` the run folder, `<kind>` is `option` for mockups or `direction` for style tiles, `<X>` is the letter A, B or C. The skill resolves them in its "Values" block; replace them before running anything.

## Before the round

Tell the user the estimate before dispatching anything: `≈ N corridas de ~X k tokens` (a mockup in sonnet is about 13.5 k tokens in and 4.4 k out per run, so X is about 18 per option; in opus the same run costs more, say so). Say it in the user's language and with the real N.

## The brief

Each option gets its own brief, written in the prompt (never a path inside the plugin):

- the confirmed brief (what it is, who uses it, the main action, the real content inventory, the reading order and the list of screens in order: the first is the main one). The data the user gave goes in literally; the agent fills the rest with realistic sample values marked `data-sample`, plus one visible line "Datos de muestra" per screen (never real people, emails, companies or brands);
- the text of `<run>/norms.md`, pasted;
- the tokens of `DESIGN.md` if there is one, and the project's rejections;
- the axis assigned to this option: mockups: A density, B structure, C emphasis. Style tiles: A restraint, B warmth or editorial, C high contrast; in a `product` register, B and C stay at "restraint with one accent" and vary typography and density;
- the write folder `<run>/<kind>-<X>/`, which must be empty;
- `destination: canvas` or `destination: local`, the one `run.mjs present` printed (Google Fonts only with `canvas`; `options-check` takes the same `--destination`), and the form rules of the agent: well formed HTML, no `{{`, no controls inside an `<a>`;
- in `improve`: the findings the user chose and a text summary of the "before" capture, never the image.

## Dispatch

Model: run `node "<root>/scripts/run.mjs" option-model --profile <profile>` once and keep its `model` as `<model>` (opus in `max`, sonnet in `balanced` and `economy`; an unknown profile counts as `balanced`). The pignolo core is not consulted: the profile is this plugin's own setting.

1. For each letter, first record the state of the repository: `node "<root>/scripts/run.mjs" git-state --project <repo> --out <run>/git-before-<X>.txt`.
2. Dispatch all options in parallel, in a single message, with the Agent tool: `subagent_type: "pignolo-ui:ui-option"`, `model: <model>`. The instruction of each dispatch includes the text `The user asked for <N> subagents for this decision.`, then the brief.
3. When an option returns, verify what it wrote (the main thread, never the subagent): `node "<root>/scripts/run.mjs" options-check --project <repo> --run <run> --option <X> --kind <kind> --destination <destination> --expected <screen1.html,screen2.html> --git-before <run>/git-before-<X>.txt --provided-file <run>/provided.json`. Exit 1 means the option failed: it is not a result. For the sample data the script checks that a screen with `data-sample` has the "Datos de muestra" line, that no `data-sample` is empty, that there are no bare `‹…›` markers, that no email outside the reserved domains or phone number appears, and, with `--provided-file` (the literal values of the brief), that an amount, a grouped number or a date outside `data-sample` is one the user gave. It cannot tell whether a value is realistic, a name real or an invented item name unmarked; the auditor reads that. Without `--provided-file` an unmarked amount or date is only a warning (`maybe-unmarked-sample`). `contradicted` lists the rules that the script contradicts: drop any claim of the option that cites them.
4. Leak check of every option: `node "<root>/scripts/run.mjs" leak-values --project <repo> --out <run>/leak-values.json --email <the email of the user's account, when your context shows it>` and `node "<root>/scripts/leak-check.mjs" --dir <run>/<kind>-<X> --values-file <run>/leak-values.json`. Anything found stops that option. Saving an option as approved (`approve.mjs save`) happens later and only after `leak-check.mjs` passed.

## Diversity

Run `node "<root>/scripts/compare.mjs" options --run <run> --kind mockup --main <first screen>` (`--kind tile` for style tiles). If `regenerate` names a letter, regenerate that option once:

1. First `node "<root>/scripts/run.mjs" discard --run <run> --option <X> [--kind direction]`: the subagent only has Write and cannot overwrite, so the old folder moves to `<run>/discarded/` and the new dispatch writes into an empty `<run>/<kind>-<X>/`.
2. Dispatch again to the same folder (same checks as above).
3. If two options still coincide, run `compare.mjs options ... --second-round` and show the result with the warning `B y C son muy parecidas` (with the letters it names). Do not regenerate again.

## Sequential path

When `<N>` is `1`, or there is no Agent tool, or the model does not delegate, or a hook denies the dispatch (with the core installed, until its allowlist is updated), or `claude.ok` is false, the main thread generates the options one after another, each with its own axis, and runs the same checks. The first line of the report is the one `run.mjs report-line` prints with `sequential: true`.

The number of subagents comes from the Agent calls that returned a result. The model is reported as requested (`modelo pedido: <model>`): the real model of a subagent is not visible to the main thread, so never state it as a fact.
