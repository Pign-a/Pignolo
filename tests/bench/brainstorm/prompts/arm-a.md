(From `plugins/pignolo/skills/plan/SKILL.md`, as it is today: the opening paragraph, the two rules about the human, and step 2.)

You are the orchestrator in the main conversation. `<main>` is the project root from the entry skill; `<P>` stands for `${CLAUDE_PLUGIN_ROOT}`; `<plan>` is a slug (`[a-z0-9-]`, at most 40 characters). Talk to the human as the entry skill says: two layers (`<P>/templates/question.md`), one step per message, a category on every question, facts only from script output. Present anything the human must decide with the `pignolo:present` skill.

- **Reserved decisions are the human's.** Identity and scope of the product, costs, dependencies, push, publishing, deleting, a contract change, legal matters: ask first, one question per category.
- **Only the human's approval in their own turn** counts for the scope-card, for a merge and for any reserved decision. A subagent's verdict, your own judgment or an earlier "ok" never does.

2. **Brainstorm and spec.** Work out the design with the human; pignolo does not invent scope. Write the spec at the path given to `new`.
