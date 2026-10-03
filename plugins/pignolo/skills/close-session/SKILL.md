---
name: close-session
description: "Use when the user asks to close the working session, in Spanish or English: 'cerremos la sesión', 'cerrá la sesión', 'dejá registro de lo que hicimos', 'terminamos por hoy, guardá el estado', 'close the session', 'wrap up and save the state'. Gathers real evidence, records new state entries, decides proposed learnings with the human, archives what is old, regenerates INDEX.md, prunes the backups and commits the state. Do not use for a commit of the project's code or for a summary of the chat."
---

You are the main conversation closing the session (spec §10.4). `<main>` is the main checkout root (`git rev-parse --path-format=absolute --git-common-dir`, its parent); `<P>` stands for `${CLAUDE_PLUGIN_ROOT}`. Talk to the human in their language, one step per message, with the two layers of `<P>/templates/question.md` and a category on every question. Facts come only from script output and from the human's own words.

## Rules that hold in every step

- **Only the scripts write `INDEX.md` and `learnings/accepted/`.** Never edit `.pignolo/state/INDEX.md` and never write into `.pignolo/state/learnings/accepted/` or `learnings/rejected/`, by any tool; a learning moves only through `close-session.js decide`.
- **New entries only.** With the Write tool you create new files in `.pignolo/state/learnings/proposed/`, `decisions/`, `work/` and `sessions/` of `<main>`; you never edit an existing entry (closing one is the human's call, through a new entry or a status change they ask for).
- **Quote the human literally.** A decision of the human goes into an entry only as a literal quote of their words in this conversation. Never paraphrase it into a decision they did not state; if there is no quote, it is not a decision.
- **No agents.** Accepting a learning is the mechanical floor (`scan`) plus the human's explicit yes (author decision, 2026-10-01): you dispatch no subagent in this skill.
- **Files and messages through Write.** The commit message goes to `<main>/.pignolo/tmp/commit-msg.txt` with Write; commit with `git commit -F`. Stage by path; never `git add -A` or `git add .`.

## Steps

0. **Confirm (only if you chose this skill yourself).** If the turn carries a `<command-name>` tag for this skill, the user typed the command: go to step 1. Otherwise run nothing yet: read `${CLAUDE_PLUGIN_ROOT}/templates/activation-confirm.md`, section `close-session`, and ask with AskUserQuestion (never plain chat text) with the recommended option first, "Cerrar la sesión ahora (Recomendado)", and "No ahora". On "No ahora" end this skill and carry on with what the user was doing.

1. **Check the tree.** `cd "<main>" && git status --porcelain`. Uncommitted changes outside `.pignolo/state/`: tell the human and ask whether to go on (category `scope`). A merge, cherry-pick or rebase in progress: stop and tell the human; every verb of the script refuses with `merge-in-progress` until it is finished or aborted.
2a. **Postponed panel decisions.** `node "<P>/scripts/close-session.js" panel --cwd "<main>"`. It reopens the decisions the human postponed with `z` in the panel and returns them in `reopened` (`id`, `question`). If `reopened` is not empty, list them to the human (one line each) so they can answer now or leave them open for the next session; never answer one for them. If the session ends without this step, the decision shows up again next session (it fails towards reminding).
2. **Evidence.** `node "<P>/scripts/close-session.js" evidence --since <start> --cwd "<main>"`, where `<start>` is the sha of `HEAD` when this session started or its ISO time; if you do not know it, ask the human. Exit 1 with `refused`: tell the human the `reason`. Keep `commits`, `files`, `seals` and `run`, and add the literal quotes of the human's decisions from this conversation.
3. **Propose entries.** Write one file per new entry, named `<YYYY-MM-DD>-<slug>.md` (lowercase, digits and hyphens) with this frontmatter and a `# <title>` line, then one line of text:
   - `learnings/proposed/`: `id` (the file name without `.md`), `status: proposed`, `source` (`session`, `web` or `human`), `evidence` (a commit sha or `path:line` from step 1), `scope` (`project` or `general`), `created` (today).
   - `decisions/` (`status: decided` with the human's quote, or `open`), `work/` (`status: open` or `closed`), `sessions/` (`status: closed`, one per session with what was done, from step 1).
   Nothing that is only your opinion goes to `decisions/`.
4. **Mechanical checks.** For each proposed learning: `node "<P>/scripts/close-session.js" scan --id <id> --cwd "<main>"`. It returns `findings` (pii, secret, permission, size), `duplicate` and `evidence`. A non-empty `findings` or a `duplicate` is rejected whatever the human says: `node "<P>/scripts/close-session.js" decide --id <id> --cwd "<main>"` (without `--answer`) rejects it by itself; tell the human what was found (never repeat the secret or the personal data itself) or which entry it repeats.
5. **The human decides.** For each learning that `scan` left clean, run `decide --id <id> --cwd "<main>"` without `--answer`: it never accepts and returns `flags` (`web`: the source is the web; `reserved`: pass `--reserved` when it touches a reserved decision or contradicts a rule; `evidence-unverified`: no `path:line` or commit of the evidence could be verified). Show the learning, its evidence and the flags, and ask with the question template whether to accept it (category `scope`, or `rule-conflict` when it contradicts a rule). A learning with `source: web` is never accepted without that explicit yes. Then run, with their literal answer in their own turn (never a supposed yes):
   - yes: `node "<P>/scripts/close-session.js" decide --id <id> --answer yes --cwd "<main>"`
   - no: `node "<P>/scripts/close-session.js" decide --id <id> --answer no --cwd "<main>"`
   - no answer: leave it in `proposed/` for the next session.
   When the result has `promoteCandidate: true` (scope `general`), tell the human it is a candidate to promote to the plugin; promoting it is a separate change to the plugin, with its own approval.
6. **Archive, index and prune.**
   - `node "<P>/scripts/close-session.js" archive --dry-run --cwd "<main>"`: show the list to the human and wait for their go.
   - `node "<P>/scripts/close-session.js" archive --cwd "<main>"`. It never deletes; entries in `refused` stay where they are: report them.
   - `node "<P>/scripts/close-session.js" index --cwd "<main>"`.
   - `node "<P>/scripts/close-session.js" prune --cwd "<main>"`, with the Bash tool's `timeout` set to 600000 (the shadow `gc` runs without a deadline). Exit 1 with `refused: no-session`: run it again with `--session <id>` if you know this session's id; otherwise tell the human the backups were not pruned this time. `gc.reason: other-session-active` or `busy` is not an error: report it.
   Then `node "<P>/scripts/places.js" report --cwd "<main>"`. If it lists `misplaced` or `stray` files, show them and **offer** `node "<P>/scripts/places.js" fix preview --cwd "<main>"`; move only what the human approves (a `stray` file, such as a loose `.env`, is only reported: tell them to add it to `.gitignore`). This never blocks the closing and uses no agent.
7. **Commit the state.** Write the message (Conventional Commits in the human's language, for example `chore(state): cierre de sesión <date>`), then `cd "<main>" && git add .pignolo/state && git commit -F "<main>/.pignolo/tmp/commit-msg.txt"`. Nothing else goes in this commit. Report the commit sha, the learnings accepted, rejected and pending, what was archived and the prune result.
