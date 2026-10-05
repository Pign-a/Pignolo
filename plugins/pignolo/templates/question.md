<!--
pignolo question template (spec §4.4 and §4.6). Fill it in the human's language: every
heading, sentence, label and description is translated, the structure is kept.

How to ask: with the `AskUserQuestion` tool, up to 4 questions per call. Independent questions go in the same call; one that depends on another's answer goes in the next call. Before the call, one line of context; the technical detail only if the human asks for it.
- `header`: the category, by its name in the human's language, 12 characters at most (the English name goes in the record: `plan.js decision add`, `panel.js ask`).
- `question`: one line. `options`: 2 to 4. The recommended option goes first, with "(Recomendado)" (in the human's language) at the end of its `label`; the others keep the order they were found in.
- `description` of each option, one line: what happens, its cost and whether it can be undone. Options are complete, never summarized.
- An option chosen in `AskUserQuestion` is the human's explicit yes for that question only, never for a later or changed one. What you record as their words (`--quote-file`, `decision add`) is the question and the chosen label, literal, or their free text.
- More than 4 options: group them into two questions, or use the text form with a numbered list.
- Without `AskUserQuestion` (`claude -p`, a subagent): use the short text form below.

Category: exactly one of the closed list, by its English name, followed by its name in the
human's language:
  identity, scope, costs, dependencies, irreversible, security, contract, rule-conflict,
  scope-card, test-authorization, needs-review-batch, judge-conflict, live-check-input, quota
A question without a category is a failure (spec §0 c).

Text form (fallback): the recommended option goes first and is marked; the others keep
the order they were found in. Each one says what happens, its cost and whether it can be undone.
-->
**<"In plain words" heading>**
<1 to 3 short lines, no jargon, no paths, no counts: what is going on and what the human has to decide.>

**<"Question" heading>** · category: `<category>` (<category name in the human's language>)
<the question, in one line>

1. <the recommended option, with the <recommended mark>: what happens · cost · reversible or not>
2. <option: what happens · cost · reversible or not>

<"Recommendation" label>: option 1, because <evidence in one line>.

**<"Technical detail" heading>**
- <"Context" label>: <at most 2 lines>.
- <"Evidence" label>: <commands run, files and lines, script output (risk hits, gate status, ledger ids)>.
- <"Cost and reversibility" label>: <per option, one line each>.

<!--
Panel (optional, the author's pignolo-panel mod). Skills point here from their "Panel" rule.
- A question that stays pending (asked in text form, or the turn ends waiting for the human) is also written to the panel, one line, so it shows under "Te toca"; one answered at once through `AskUserQuestion` is not:
  node "<P>/scripts/panel.js" ask --key "<flow>:<short name>" --question "<the question, one line>" --option "<label 1>" --option "<label 2>" --recommended "<label 1>" --cwd "<main>"
  The question and each option are one line (at most 300 and 80 characters, at most 4 options). The script refuses line breaks, control characters and invisible characters (zero width, right-to-left, "tag" characters, private use, unassigned), writes nothing, and never fails the step.
- When the human answers in the chat, close it:
  node "<P>/scripts/panel.js" answer --key "<flow>:<same short name>" --answer "<the label they chose, or Otra>" --cwd "<main>"
- A message that starts with "Respuesta a la decisión Q-<n>" is the panel's own answer: a hook closes it, do not repeat it.
- plan.js scope-card save and approve write the card's decision by themselves (key scope-card:<plan>): do not repeat it. ledger.js save leaves the escalated review (key review:<sha7>) in the panel: close it with panel.js answer when the human decides.
- Spending cap: approve the scope-card with [--cap-usd <n>], the cap the human approved with the card's Cost estimate (if they gave none, ask, category costs). The panel warns at 80 %.
- After each batch: node "<P>/scripts/panel.js" budget --hito <plan> --spent <usd> --cwd "<main>", where <usd> is the session cost the human reads in /cost (ask in one line, category costs; never estimate it).
-->
