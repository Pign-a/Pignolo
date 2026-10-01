# Apply without breaking (shared by new and improve)

Markers: `<root>` is the plugin root, `<repo>` the project root, `<run>` the run folder, `<approved>` the path `design/approved/<flow>` of the chosen option, `<base>` the git ref of the starting state. Replace them before running anything. The agent does not commit: if something needs committing, the user does it.

0. **Check the approved decision.** `node "<root>/scripts/approve.mjs" verify --project <repo> --path <approved>`. Anything other than exit 0 is `BLOCKED`: say why and stop.

1. **List the expected files.** Write `<run>/expected-<n>.json` as `[{ "path", "exists": true|false, "change": "tokens"|"structure" }]`: files that exist or will be created. At most 5 files and 200 lines per batch; if the change is bigger, split it into batches and tell the user. Tokens first, then structure, one structural change per batch.

2. **Clean base.** If an expected file has uncommitted changes, ask the user to commit them (you do not commit). Set `<base>` to the commit you start from.

3. **Save the state.** `node "<root>/scripts/files.mjs" save --project <repo> --batch <run>/batch-<n> --expected <run>/expected-<n>.json`.

4. **Edit** the token source that already exists in the project (no new parallel source), following the approved decision.

5. **Verify.** `node "<root>/scripts/files.mjs" verify --project <repo> --batch <run>/batch-<n>` (the delta against the saved state must stay inside the expected list; exit 1 lists `unexpected` changes). Re-read what you edited. Then run the first script that exists in `package.json` among `typecheck`, `build` and `lint`; if there is none, the build is "no verificado: el proyecto no declara build".

6. **Revert** if verify fails, the build fails or the user rejects the batch. First run `files.mjs verify` again and show the user the complete list of what `restore` will delete: the `unexpected` files plus the expected files with `exists: false` (the ones this batch created), because `restore` deletes both groups. Only after the user agrees: `node "<root>/scripts/files.mjs" restore --project <repo> --batch <run>/batch-<n>`. Never use destructive git (no reset, no clean, no forced checkout).

7. **Say "terminado" only through the script.** After the confirmation of the flow (in `<run>/after`), run `node "<root>/scripts/run.mjs" check --project <repo> --run <run>/after --files <touched files> --base <base>`, build `report.json` with `node "<root>/scripts/run.mjs" report-skeleton --project <repo> --run <run>/after --implements <approved>` (add the text of each claim you keep; it must cite the approved decision in `implements`), run `node "<root>/scripts/report-check.mjs" --project <repo> --run <run>/after`, and then `node "<root>/scripts/run.mjs" verdict --project <repo> --run <run>/after --build-ok yes|no` (leave `--build-ok` out if the project has no build). Its `status` is the word of the report: `terminado` only with `ui-check` at 0 in scope, `report-check` at 0 and a green build when there is one. `BLOCKED` or `sin verificar` are copied with their `reasons`. Loose "no verificado" items do not prevent `terminado` but are listed.
