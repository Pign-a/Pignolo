---
name: brainstorm
description: Invoked by pignolo:plan at its step 2, or directly as /pignolo:brainstorm on a request, a plan or a design already written. Turns a request into a decision tree, settles without the human everything that can be settled, asks the human only the reserved decisions (one at a time, within a budget), and leaves decisions, rulings and declared assumptions in writing.
---

DRAFT for the A/B of 2026-10-01 (`tests/evals/RESULTS-brainstorm.md`): text only, no script enforces it yet.

You are the orchestrator in the main conversation. `<main>` is the project root, `<P>` is `${CLAUDE_PLUGIN_ROOT}`, `<plan>` is the plan slug (used alone: a slug you pick). The human is the author: write to them in their language, in two layers, with `<P>/templates/question.md`.

## Stages

1. **Read before asking.** Read the literal request, `project.md`, the earlier decisions in `<main>/.pignolo/state/decisions/` and the code and docs the request touches (up to 3 files yourself; 4 or more through `pignolo:explorer`). No questions yet.
2. **Say back what you understood.** One short message: what was asked (in the author's words), what you assume, what stays out. The author corrects it in one line. This message does not spend budget.
3. **Build the tree.** One branch per open decision: what it depends on and its class (table below). Write it with Write to `<main>/.pignolo/tmp/brainstorm-<plan>.json` as `[ { "id", "question", "class", "dependsOn": [], "status": "open|closed|assumed|pending", "answer", "evidence" } ]`, and rewrite it whenever an answer closes or prunes branches. The tree lives in that file, not in the conversation.
4. **Close without the author everything you can:** repo facts, technical rulings, research, measurement proposals.
5. **Ask what is left,** one question per message, dependencies first.
6. **Close.** Write the spec, record the decisions, hand over the key claims.

## Classes

| Class | Who closes it | How it is written |
|---|---|---|
| Repo fact | You, or `pignolo:explorer` | A fact with `file:line` (or script output). Never asked. |
| Author decision (identity, scope, costs, dependencies, irreversible, security, contract, rule-conflict) | The author, in their own turn | Decision `D-<plan>-<n>` with the date and their literal quote. |
| Technical ruling | You, without asking | One line with the reason; the author sees it in the spec and can revert it. |
| Measurable (two alternatives that can be run) | An A/B or a real test | Proposed with its cost cap; running it is a `costs` question. Until then, a declared assumption. |
| Researchable (depends on an external system) | `pignolo:researcher`, with source and date | A key claim `K<n>`. |
| Visual (a preference about something that must be seen) | Options to look at | Offered when the first one appears, never upfront, with one line on its cost; with pignolo-ui through its flows, otherwise `pignolo:present`. If nothing can be shown, a declared assumption. |
| Out of scope | Nobody | One line under "Out of scope". |

When in doubt between a technical ruling and an author decision, it is the author's. If the repo and the request contradict each other, or an earlier decision in the repo is older than the request and the request may change it, that is a question: earlier decisions are evidence, not answers.

## Questions

- One question per message, short closed options, a category from the list above, **the recommended option first and marked** (this replaces "never reordered" in the template; the other options keep their order). Each option says what happens, its cost and whether it can be undone.
- Never ask what the repo answers or what the request already says: state it with its evidence.
- Ask a branch only when everything it depends on is closed. Among those, first the one that closes or prunes most branches; on a tie, the one most expensive to revert. Research in progress blocks only the branches that hang from it.
- If the request holds independent pieces, propose splitting it before asking details (a `scope` question).
- A global shape with several reasonable architectures: one early question with 2 or 3 approaches and their trade-offs, the simplest first on a tie. A concrete open point: a pointed question. Something that can be run or measured: propose the measurement instead.
- **Low-risk batch.** Reversible, cheap branches are not asked one by one: send them once as a numbered list of assumptions, each with its recommended value, and one question ("do these stand, or do you change any?"). Nothing reserved goes in the batch. The batch counts as one question.
- **Budget** of questions to the author by request size: small (one screen or one module) 3, medium 6, large 10 (and propose splitting first). Repo facts and technical rulings spend nothing.
- Under every question: `question <n> of at most <budget>; <k> branches left`, and the option `suficiente` ("enough").
- A large author decision (it changes the product, a cost or a contract): offer first, in one line with its cost, a debate of two opus agents (one for, one against). Never run it unasked.
- No section-by-section approval of the design: the only approval is the scope-card.

## When to stop

Stop when no branch is open, when the author says "suficiente" (or the like), or when the budget is spent (say so in one line). Every branch still open becomes a **declared assumption** `S<n>`: what is assumed (the recommended option), why, and what changes if it is false. Exception: a reserved branch whose recommended option is irreversible, a cost or a security matter is never assumed; it stays a **pending question** that the scope-card shows again. An assumption is never dressed as a decision.

## What it leaves

- **Spec** (inside `plan`: at the path given to `plan.js new`), with these sections in this order before the design: `Request` (literal), `Repo facts` (with evidence), `Author decisions` (`D-<plan>-<n>`, date, quote), `Technical rulings`, `Declared assumptions` (`S<n>`), `Pending questions`, `Proposed measurements`, `Out of scope`.
- **Decisions.** Record each author decision with its quote through the decisions verb (planned, not built in this draft: until then write them with Write to `<main>/.pignolo/tmp/decisions-<plan>.json` as `[ { "id", "category", "question", "quote", "date" } ]`). Pass that file to `pignolo:spec-reviewer` next to the literal request: what carries a quote was not "added without being asked"; an assumption that adds scope still shows up as `A<n>`.
- **Key claims.** The researchable branches, as `[ { "id": "K1", "text": "...", "system": "..." } ]`, ready for `plan.js claims set` (none: `--none-reason`).
- Used alone it writes no plan state: it returns decisions, rulings, assumptions and pending questions, and the two files above.
