# Present the options and record the choice (shared by new and improve)

Markers: `<root>` is the plugin root, `<data>` the plugin data folder, `<presentation>` the user's presentation setting, `<repo>` the project root, `<run>` the run folder, `<kind>` is `option` for mockups or `direction` for style tiles, `<X>` the letter of an option. The skill resolves them in its "Values" block; replace them before running anything.

1. **Decide how to show them.** `node "<root>/scripts/run.mjs" present --data <data> --project <repo> --presentation <presentation> --artifact no --design-type no`. In v1 it always answers `mode: local` with the reason `canvas-not-in-v1`: the canvas "Design" is not available in v1. Never call Artifact, never publish anything, and do not ask the user for any consent about publishing.

2. **Show them locally.** Every option folder already passed `leak-check.mjs` in options.md; run it again over any folder you built or changed since (a combined flow). Then `node "<root>/scripts/run.mjs" compare-html --run <run> --platform <desktop|mobile|both> --screens <screen1.html,screen2.html>` (add `--kind direction` for style tiles). It writes `<run>/compare.html`, opens it, and prints its path; tell the user the path in one line. The page has one row per option and one frame per screen, in the order of the brief, and the screens stay linked.

3. **The user chooses or combines, in their own turn** (`A`, `B`, `C`, "B with the header of A"). A comment on the page is input, but the choice is confirmed in the chat and recorded from the user's turn, with the literal quote. If they combine, build the combined flow yourself in a new folder `<run>/<kind>-<next letter>/`, check it with `node "<root>/scripts/run.mjs" options-check ...` (see options.md) and show it before implementing anything.

4. **Approve.** Run `node "<root>/scripts/leak-check.mjs" --dir <run>/<kind>-<X> --values-file <run>/leak-values.json`; if it finds anything, stop. Then `node "<root>/scripts/approve.mjs" save --project <repo> --flow <flow> --from <run>/<kind>-<X> --values-file <run>/leak-values.json` (the flow for style tiles is `direction`). Write the user's literal quote to `<run>/choice.txt` with Write, then `node "<root>/scripts/approve.mjs" record --project <repo> --path <approved> --quote-file <run>/choice.txt`: show the diff it prints and, only after the user confirms, run the same command with `--write`.

An approved decision is never edited: a change creates `<flow>-v2` (then `-v3`). The agent does not commit it.
