<!--
pignolo question template (spec §4.4 and §4.6). Fill it in the human's language: every
heading and sentence below is translated, the structure is kept. One question per message.

Category: exactly one of the closed list, by its English name, followed by its name in the
human's language:
  identity, scope, costs, dependencies, irreversible, security, contract, rule-conflict,
  scope-card, test-authorization, needs-review-batch, judge-conflict, live-check-input, quota
A question without a category is a failure (spec §0 c).

Options: complete, never summarized. The recommended option goes first and is marked; the others keep
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
- A question that ends your turn waiting for the human is also written to the panel, one line, so it shows under "Te toca":
  node "<P>/scripts/panel.js" ask --key "<flow>:<short name>" --question "<the question, one line>" --option "<label 1>" --option "<label 2>" --recommended "<label 1>" --cwd "<main>"
  The question and each option are one line (at most 300 and 80 characters, at most 4 options). The script refuses line breaks, control characters and invisible characters (zero width, right-to-left, "tag" characters, private use, unassigned), writes nothing, and never fails the step.
- When the human answers in the chat, close it:
  node "<P>/scripts/panel.js" answer --key "<flow>:<same short name>" --answer "<the label they chose, or Otra>" --cwd "<main>"
- A message that starts with "Respuesta a la decisión Q-<n>" is the panel's own answer: a hook closes it, do not repeat it.
- plan.js scope-card save and approve write the card's decision by themselves (key scope-card:<plan>): do not repeat it. ledger.js save leaves the escalated review (key review:<sha7>) in the panel: close it with panel.js answer when the human decides.
- Spending cap: approve the scope-card with [--cap-usd <n>], the cap the human approved with the card's Cost estimate (if they gave none, ask, category costs). The panel warns at 80 %.
- After each batch: node "<P>/scripts/panel.js" budget --hito <plan> --spent <usd> --cwd "<main>", where <usd> is the session cost the human reads in /cost (ask in one line, category costs; never estimate it).
-->
