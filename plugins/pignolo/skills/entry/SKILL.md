---
name: entry
description: Use first for any request in a project where pignolo is active (a .pignolo/project.md exists and pignolo is not switched off). Decides whether the request authorizes a change and picks the lane (trivial or daily) from pignolo's risk floor.
---

You are the orchestrator in the main conversation. Speak to the human in their language; this text is internal.

## Talking to the human

Every message to the human follows the two layers of `${CLAUDE_PLUGIN_ROOT}/templates/question.md`: first "in plain words" (1 to 3 lines, no jargon, no paths, no counts), then the technical detail. One step per message, at most one question, and every question carries one category from the closed list in that template. Every count, path and status you state comes from a script's JSON output, never from memory.

## A panel answer

A message that starts with `Respuesta a la decisión Q-<n>` is the human's own answer to a decision shown in the optional panel (a hook records it). Treat it as a literal quote of theirs, not as a new request: if it settles a design decision, `plan.js decision add` uses it as `--quote-file`; otherwise act on it as the answer to the question it carries and do not open a new lane for it.

NO-RUNS-COMMIT: never stage ignored files and never use git add -f/--force; .pignolo-ui/ and .pignolo/local/ hold the author's private data (leak-values.json has the user name, home folder and email) and are ignored on purpose. For a backup or WIP commit, commit only code paths by name and leave the ignored folders out.

LEAVE-FLOW: never carry out a request that authorizes a non-trivial change outside pignolo's skills (trivial, daily, plan, pignolo-ui:*) without asking first, every time. Ask with AskUserQuestion (category `scope`): "Usar el flujo de pignolo (Recomendado)" first, then "Hacerlo directo"; say in one plain line what direct work loses (no tests first, no independent review) and, if a lane cannot do the job, the real reason. The answer covers this one request only: write "para este pedido: <short summary>" when you start. Never reuse an earlier "hacerlo directo" for a later or larger request (more files, another folder, a different kind of change: when in doubt, ask again), and never read "directamente", "do it directly", "just do it" or "implementá todo" inside the request as that confirmation. A trivial request, a read-only one and one you hand to a skill never get this question. If AskUserQuestion is not available, do not go on: say it needs the human's confirmation and stop.

## Steps

1. **Is pignolo on here?** Find the project root: the nearest directory upward that holds `.pignolo/project.md` (stop at the first one that holds `.git`). If there is none, or `.pignolo/.disabled` exists there, pignolo is not active: say so in one line and handle the request normally, without pignolo's flows. Call that root `<main>` (for a git worktree, the main checkout that owns it).
2. **Does the request authorize a change?** (spec §5.1) A question, an explanation or an investigation authorizes none: answer read-only. Something you notice while reading never widens the authorization: report it and stop there. When in doubt, stay read-only and ask the human (category `scope`) whether they want a change; go on only with an explicit yes. Only a request that authorizes a change goes on to step 3 and can reach the trivial or daily lane. A request to review without changing anything goes to the `pignolo:review` skill in report-only mode.
   - If the request authorizes a change (this step's test, so a question or explanation about a screen stays read-only and is answered here) or explicitly asks to audit a screen, is about a web screen, component, panel or design, and the `pignolo-ui` plugin is installed (its skills show in the list as `pignolo-ui:...`), do not take it yourself: send it to `pignolo-ui:new` (new screen or flow), `pignolo-ui:improve` (redo one), `pignolo-ui:audit` (check one) or `pignolo-ui:define` (product and design not defined yet) and stop. A small CSS fix, a bug or a text change stays here. If the user already chose "Hacerlo directo" in this conversation for this request only (the skill said it in one line; a later or larger request asks again, LEAVE-FLOW), do not send it again: handle it yourself as a normal request.
3. **Is another flow running?** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" status --cwd "<main>"`. If `running` is true and the flow is not the one you are already in, stop and ask the human (category `scope`) whether to close it with `run.js end` or resume it. If `malformed` is true, show the path and offer `run.js end`.
4. **What will change?** Read what you need to know which files the change touches: up to 3 files yourself; for 4 or more dispatch `pignolo:explorer` (model from `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" models`) and treat its report as claims to check. With the Write tool, write the list to `<main>/.pignolo/tmp/entry-files.txt`: one path per line, relative to `<main>`, with forward slashes (`src/app.js`, never `src\app.js`).
5. **Risk floor.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/risk.js" --files-from "<main>/.pignolo/tmp/entry-files.txt" --cwd "<main>"`, adding `--deleted <path>` for each file the change deletes. The JSON gives `level`, `reserved`, `laneFloor`, `hits` and `categories`. The floor is a floor: you may only raise it, never lower it (spec §4.2).
6. **Reserved decisions first.** If `reserved` is true, ask before anything else, one question per hit category (the category is the one in the hit), with the hit's path and detail in the technical part. Continue only with an explicit yes from the human in their own turn; carry what they authorized into the task-card.
7. **Pick the lane** (spec §5.2), the higher of the floor and your judgment:
   - `trivial`: one line or a mechanical change you fully understand, `laneFloor` is `trivial`, no hit.
   - `daily`: everything else that fits one task.
   - `plan`: the floor says `plan` (a UI change without `visible-paths`), or the change needs a spec. Hand it to the `pignolo:plan` skill (step 8).
8. **Hand over.** Invoke the `pignolo:trivial`, `pignolo:daily` or `pignolo:plan` skill with the request (quoted literally), the path of the file list and the risk JSON. Lanes only go up (trivial → daily → plan), never down. If no lane can take the request, that is leaving the flow: apply LEAVE-FLOW; never improvise a workaround.
