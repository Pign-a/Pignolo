---
name: start
description: "Turn an idea into a project with CLAUDE.md, security.md, design.md and roadmap.md, or adopt an existing repo. Use when the user says: tengo una idea, quiero armar un proyecto, empecemos un proyecto nuevo, adoptá este repo, I have an idea, let's start a project, set up this project, bootstrap this repo."
---

# start: from an idea to a project

Talk to the user in the user's language. Keep the conversation loose, like a colleague developing an idea, not a questionnaire. The goal is that the project ends up with four documents that later work (`work`, `validate`, `ui`) can rely on, so nobody has to repeat rules or explain what to check.

## 1. Develop the idea

Let the user talk. Reflect the idea back, help it take shape, and offer to research on the internet (good practices, how similar things scale) when that would change a decision. Ask only what changes a decision, and only what the context does not already answer:

- internal or external users;
- will it be sold or run as a service;
- expected scale;
- infrastructure and where it runs;
- how sensitive the data is.

One or two questions at a time. If the user is unsure, propose a default and say why.

## 2. Existing repo: adopt it

If there is already code, read before writing: the code, the README, and any documents present. Write only the documents that are missing, built from that evidence, and ask only what the repo cannot answer. A `DESIGN.md` or `PRODUCT.md` from pignolo-ui is read and kept. On Windows `design.md` and `DESIGN.md` are the same file, so if either already exists, keep the existing name and do not create the other. Ignore `project.md` files left by pignolo 0.x: they come from the old plugin and are no longer read. An empty or throwaway folder needs no questions about the past: just start from the idea.

## 3. The four documents

Always leave all four, sized to the project: a small internal script can have a `security.md` of five lines. A document that is padded is worse than a short one, because the reader stops trusting it. Templates are in `templates/`; copy the structure and fill it with what the conversation produced.

| File | Who reads it | Why it exists |
|---|---|---|
| `CLAUDE.md` | Claude, loaded automatically each session | Commands, conventions, pointers to the other three. Short, so it is always worth loading. |
| `security.md` | `validate` | Risk memory: data, users, surface, what is protected. Without it, every review rediscovers the risk from scratch. |
| `design.md` | Screens built by `ui` | Visual identity and interface rules. With no interface, three lines that say so. |
| `roadmap.md` | Claude and the author | Complete in scope, from the foundations to each feature, MVP first; detailed only for the next phase. Dated, with origin. |

Templates: `templates/CLAUDE.md`, `templates/security.md`, `templates/design.md`, `templates/roadmap.md`. Each carries a date and an origin line (conversation, repo reading, research) so a later reader can judge how stale or how solid it is. Never put secret values (keys, tokens, passwords, connection strings) in any of them; name where they live instead.

## 4. Never overwrite

An existing file is never overwritten. If one of the four already exists, read it, then show the proposed change as a diff or a short list and let the user accept it. Merge by adding the missing sections rather than replacing the text. The user's documents carry decisions that are not visible in the code.

## 5. Ask how they want the plan

Once the documents exist, ask which plan fits, and explain each in a line:

- **punta a punta**: the whole thing planned end to end, best when the scope is clear.
- **por fases**: plan only the next phase in detail and re-plan with what is learned; best when much is unknown.
- **interfaz primero**: build the identity and component catalog (`/pignolo:ui`) before the logic, best when the look drives the product.

Record the choice in `roadmap.md`.

## 6. Optional: permission rules for new repos

In a brand-new repo, suggest native `deny` permission rules for what cannot be undone (mass deletes, force-push). Show them and explain them; the author applies them in their own settings. This plugin does not apply them and blocks nothing.

## Finish

Summarize what was written and where, mention anything left as an assumption, and name the next step. Do not start building until the user says so.
