<!--
pignolo question template (spec §4.4 and §4.6). Fill it in the human's language: every
heading and sentence below is translated, the structure is kept. One question per message.

Category: exactly one of the closed list, by its English name, followed by its name in the
human's language:
  identity, scope, costs, dependencies, irreversible, security, contract, rule-conflict,
  scope-card, test-authorization, needs-review-batch, judge-conflict, live-check-input, quota
A question without a category is a failure (spec §0 c).

Options: complete, in the order they were found, never summarized or reordered. Each one says
what happens, its cost and whether it can be undone.
-->
**<"In plain words" heading>**
<1 to 3 short lines, no jargon, no paths, no counts: what is going on and what the human has to decide.>

**<"Question" heading>** · category: `<category>` (<category name in the human's language>)
<the question, in one line>

1. <option: what happens · cost · reversible or not>
2. <option: what happens · cost · reversible or not>

<"Recommendation" label>: <option number>, because <evidence in one line>.

**<"Technical detail" heading>**
- <"Context" label>: <at most 2 lines>.
- <"Evidence" label>: <commands run, files and lines, script output (risk hits, gate status, ledger ids)>.
- <"Cost and reversibility" label>: <per option, one line each>.
