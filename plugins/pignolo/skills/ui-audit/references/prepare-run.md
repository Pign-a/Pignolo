# Prepare the run

Markers: `<root>`, `<data>` and `<repo>` are the values of the Values block in SKILL.md (this file gets no substitution: copy them from there before running anything). `<command>` is `audit`. `<design>` is the design file found in step 2 of the skill, if any.

Every command prints one JSON object. Exit 0 is done, exit 1 is a finding (keep going), exit 2 is `no verificado` with the reason (say it, never treat it as a pass).

1. **Project configuration (before `init`).** `node "<root>/ui-audit/scripts/audit.mjs" config get --data <data> --project <repo>`. If there is no `devUrl` and the user gave a URL, it must be local (`localhost`, `127.0.0.1`, `::1`): ask once and save it with `node "<root>/ui-audit/scripts/audit.mjs" config set --data <data> --project <repo> --key devUrl --value <URL>`. If no server is running, ask the user once for the file of the screen, confirm the path and use `--file`. Never start the development server and never automate a login.

2. **Create the run.** `node "<root>/ui-audit/scripts/audit.mjs" init --project <repo> --command audit --slug <short-slug> [--url <local URL> | --file <path inside the project>] [--files <source1,source2>]`. It prints `run` (the run folder, `<run>` below). `--files` lists the source files of the screen; they go into `run.json` so the auditor can find them. `init` needs `--url` or `--file`, so it comes after the configuration. Do not change any file of the project.

3. **Norms.** `node "<root>/ui-audit/scripts/audit.mjs" norms --run <run>` (add `--norms <repo>/norms.md` if the project has one). It writes `<run>/norms.md`; if the author's norms are invalid it prints a warning: tell the user they were ignored.

4. **Measure.** Use the browser tool that is available. The scripts drive an installed Chrome or Edge by themselves, always with the same `--run`: `node "<root>/ui-audit/scripts/browser.mjs" measure --project <repo> --run <run> --url <URL> [--design <design>]` (or `--file <path>`), then `capture` and `dom` with the same arguments. Exit 1 of `measure` is a finding. If the script cannot open a browser, another browser tool may take the same measures from the main thread, confirming each step by reading `location.href` and the page title; whatever it cannot show stays `no verificado`. Without any browser or without a local URL, skip this step and say so: "sin navegador" in the first line and `no verificado` for each browser measure.

5. **Check.** `node "<root>/ui-audit/scripts/audit.mjs" check --project <repo> --run <run> --files <source files of the screen> [--design <design>]`. It adds one `--dom` per rendered file listed in `<run>/dom.json` and `browser.json` by itself: never pass a glob. Exit 1 is a finding; exit 2 means the check did not run, including when it printed no result: `no verificado`.

**Login.** If the screen asks for a session (a redirect to another page, or a visible password field), the script marks it `no verificado (requiere sesión)`. Do not try to log in and do not ask for credentials; ask for a screen that does not need one.

**Image budget.** Put at most 8 images in the context per audit. The rest are cited by path and sha256 from `<run>/captures.json`. Captures stay in the run folder, never go into the repository and are never published.
