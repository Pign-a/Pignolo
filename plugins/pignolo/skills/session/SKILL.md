---
name: session
description: "Use when the user asks to document the work, close a session or leave a record, in Spanish or English: 'documentemos la sesión', 'dejá registro de esto', 'actualizá el estado del proyecto', 'document the session', 'write up today'. Writes one dated record per day with open items and a next step, and saves agent research with sources."
---

# session: leave the project resumable

The next session (or the next agent) starts with no memory, so the record is what it will read first. Every fact comes from something checkable in this pass: `git status`/`git log` output, a command run this session, or something the author said. Anything not re-verified is written as "no verificado" instead of carried forward as true.

## 1. The day's record

One file per day: `docs/sessions/YYYY-MM-DD.md`, from `templates/session.md`. A second session the same day adds a section to the same file and never overwrites the earlier one. It holds what was done (files and commits), decisions (who chose what, among which options), open items, comments and lessons, and an explicit next step. Write the record in Spanish. An empty section says "ninguno"; an omitted one reads as "not reviewed".

This works with a GitHub repo and with a purely local project. If there is no remote, no branch or no PR, say it in one line ("no remote", "sin remoto") and go on: nothing here depends on GitHub, and a git repo with no commits yet is also fine. If the folder is not a git repo, record what the files and the conversation show.

## 2. Open items

Open items live in the day's record and are tracked across sessions. Before writing, read the most recent earlier session files and reconcile each open item found there: carried over (still open, say what changed), closed (say what closed it and how it was checked), or dropped with a reason. Never silently lose one, and never create a second item for the same thing; a reopened item keeps its history. The items left open in today's file are exactly the ones that remain after this pass.

## 3. The `Validado:` line

`validate` writes a line at the very start of a line, exactly `Validado: <sha>` (no bullet, no bold), in the day's file; it reads the most recent one as its diff base. So preserve it when you edit a day's file. When you create a new day's file, copy forward the most recent `Validado:` line found in earlier session files, so the base is not lost. Never write it yourself: only `validate` knows what was reviewed.

## 4. Research

When agents did research this session, save it as `docs/research/YYYY-MM-DD-<topic>.md` from `templates/research.md`. Each claim carries its source, its credibility (alta, media or baja, with the criterion used: primary source, independent confirmation, age, interest of the author) and its type: dato (checkable fact), opinión or supuesto (assumed, not checked). Add the date of the claim. Link the file from the day's record instead of copying its content.

## 5. Keep the context current

Update `CLAUDE.md` and `roadmap.md` only where this session changed something (a decision, a finished milestone, a new convention, the status of an item), editing those lines in place. Do not rewrite either file or add narrative to `CLAUDE.md`, which is loaded in every session. If a file is missing, say so and offer `start` instead of inventing it.

## 6. Secrets

Never write secret values (keys, tokens, passwords, connection strings, personal data) in any file this skill produces, because these records are committed and read by many sessions. Name the secret and where it lives (for example "the key in `.env`") and never its value. If the conversation exposed one, note that it must be rotated.

## 7. Closing

Re-read what you wrote and confirm every claim was checked in this pass. Tell the author, in Spanish and briefly, what was written, how many items remain open and the next step. Do not commit unless the author asked for it.
