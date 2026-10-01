# Prepare the run (shared by new, improve and audit)

Markers: `<root>` is the plugin root and `<data>` the plugin data folder, both resolved by the skill in its "Values" block. `<repo>` is the project root. `<command>` is `new`, `improve` or `audit`. Replace the markers before running anything. Every command prints one JSON object; exit 0 is done, exit 1 is a finding (keep going), exit 2 is "no verificado" with the reason (say it, do not treat it as a pass).

1. **Create the run.** `node "<root>/scripts/run.mjs" init --project <repo> --command <command> --slug <short-slug> [--url <local URL> | --file <path inside the project>] [--files <source1,source2>]`. It prints `run` (the run folder; call it `<run>` below). `--files` lists the source files of the screen: they are written to `run.json` so the auditor can find them. Do not change any file of the project in `audit`.

2. **Project configuration.** `node "<root>/scripts/run.mjs" config get --data <data> --project <repo>`. If there is no `devUrl` and the user gave a URL, it must be a local one (`localhost`, `127.0.0.1`, `::1`): ask once and save it with `node "<root>/scripts/run.mjs" config set --data <data> --project <repo> --key devUrl --value <URL>`. `browser.mjs` checks that the URL answers within 5 seconds before opening anything. If there is no running server, ask the user for the file of the screen once, confirm the path, and use `--file`. Never start the development server and never automate a login.

3. **DESIGN.md.** If `<repo>/DESIGN.md` exists: `node "<root>/scripts/design-md.mjs" validate --file <repo>/DESIGN.md --project <repo>`. If it does not exist but the project has styles: `node "<root>/scripts/design-md.mjs" extract --project <repo> --out <run>/design-proposal.json` and show the proposal as a diff the user confirms; the tokens it finds are marked "extraídos, no decididos". Do not write `DESIGN.md` without that confirmation.

4. **Norms.** `node "<root>/scripts/run.mjs" norms --run <run>` (add `--norms <repo>/norms.md` if the project has one). It writes `<run>/norms.md`; if the author's norms are invalid it prints a warning: tell the user the author's norms were ignored.

5. **Measure.** In this order, always with the same `--run`: `node "<root>/scripts/browser.mjs" measure --project <repo> --run <run> --url <URL> [--design <repo>/DESIGN.md]` (or `--file <path>`), then `node "<root>/scripts/browser.mjs" capture ...` and `node "<root>/scripts/browser.mjs" dom ...` with the same arguments. Exit 1 of `measure` means it found something: it is a finding, continue. Exit 2 means "no verificado": say the reason.

6. **Check.** `node "<root>/scripts/run.mjs" check --project <repo> --run <run> --files <source files of the screen> [--design <repo>/DESIGN.md]`. It builds one `--dom` argument per rendered file listed in `<run>/dom.json` and adds `browser.json` by itself: never pass a glob. Exit 1 is a finding, continue; exit 2 is "no verificado".

**Degraded flow.** If there is no browser, or the URL does not answer, the flow continues with the scripts over the source files only and says so in the first line of the report ("sin navegador"). Only then, and only from the main thread, you may use the browser MCP as a fallback: confirm every step by reading `location.href` and the page title, and whatever it cannot show stays "no verificado".

**Login.** If the screen asks for a session (a redirect to another page or a visible password field), the script marks it "no verificado (requiere sesión)". Do not try to log in and do not ask for credentials; ask the user for a screen that does not need one.

**Image budget.** Put at most 8 images in the context per command. The rest are cited by path and sha256 from `<run>/captures.json`. Captures never go into the repository and are never published.
