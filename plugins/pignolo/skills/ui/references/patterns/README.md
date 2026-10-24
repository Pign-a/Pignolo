# Pattern sheets
A pattern sheet is a short, sourced card (150 to 250 words) for one interface pattern: anatomy, content limits, actions, measures, states and mistakes to avoid. Load one sheet at a time, right before building that pattern.

Lookup order:
1. The project's `design/patterns/`.
2. This folder.
3. If neither has it, research that one pattern from named design systems, then save the sheet in the project's `design/patterns/`.

Sheets give starting numbers and checkable states. A number with a named source was checked against that page; one marked "convention" has no source (it is the `supuesto` of `references/patterns.md`). Hover and focus-visible are listed as states in every sheet; the 2px focus ring width is a convention (WCAG only requires it to be visible).

Rule: `design.md` tokens always win over a sheet's measures. Sheet measures are defaults that apply only when `design.md` does not define the same thing.
