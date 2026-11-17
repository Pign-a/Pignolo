# Extra pass with modern-web-guidance (optional, only on a yes)

Chrome's `modern-web-guidance` (Apache-2.0; guide content CC-BY 4.0) is a set of guides on native browser APIs (`popover`, `<dialog>`, container queries, View Transitions, anchor positioning) with a CLI. It is an extra on top of the normal flow, never a replacement for the catalog, `design.md`, the kit, `validate` or `ui-audit`.

## Ask (once per session, after a piece or screen is built)

In Spanish, in one question, say: what it is, that it is optional, that it runs `npx modern-web-guidance@latest` (third-party code that updates itself), and that it sends anonymous usage data unless `DISABLE_TELEMETRY=1` is set (offer to set it for the run). Never run it without a yes. After a no, do not ask again in the session.

## Run (on a yes)

1. `npx modern-web-guidance@latest search "<query>"` with the browser capabilities the built pieces rely on (dialog, dropdown, tooltip, animation of entry and exit, form validation, date input). One query per capability, not one per file.
2. `retrieve <guide-id>` for the guides that match. Origin-trial and volatile features are gated by the tool: do not opt in on the author's behalf.
3. `legacy-scan <folder of the pieces>` only if the installed version lists it in its help. Its method and output were not verified when this was written.

## Report (Spanish, as suggestions, nothing is changed)

One line per suggestion: file, what the guide recommends, guide id. Separate two kinds:

- The code uses an older pattern than the guide recommends, with no design reason to.
- The guide says to replace a Radix or Motion piece of the kit with a native API. State the trade-off and leave the choice to the author: the kit and `design.md` win by default.

If `npx` or the network is not available, say "no verificado" with the reason and carry on. Count only what was run.
