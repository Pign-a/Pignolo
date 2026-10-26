# Pattern sheets

A pattern sheet is a short, sourced card for one interface pattern (card with actions, data table, form, dropdown...): anatomy, content limits, actions, measures, states and mistakes to avoid. General knowledge produces generic pieces; a sheet gives the concrete limits and states of that element. Load one sheet at a time, right before building that piece.

## Motion

A piece that moves or reacts (controls, overlays, lists, drag, numbers, bars) also takes its motion tier from `patterns/motion-and-microinteractions.md`, whose tokens live under `motion.springs` in `design.md`.

## Where to find it

- The project's `design/patterns/`, first: it holds the sheets already researched or adapted for this project.
- The plugin's `references/patterns/` folder: starter sheets, read in place. Copy one into the project only if you adapt it.
- If no sheet is found, research that one pattern and save the sheet in the project's `design/patterns/<slug>.md`.

## Researching one

Ask about that pattern WITH the context of the piece: what it holds, who uses it, what kind of product, how dense. A generic question returns a generic answer. Prefer primary design systems and research (Apple HIG, Material 3, Fluent 2, Polaris, Carbon, GOV.UK, WAI-ARIA APG, NN/g). A general-purpose subagent with `model` and `effort` passed explicitly (sonnet, medium) can do it; it cannot see the repository, so put the context in its prompt. If you already have web tools in the main thread and it is one pattern, do it there.

Write the sheet in 150 to 250 words: use when / not when, anatomy, content limits, actions (one primary at most; destructive apart), measures, states (rest, hover, focus-visible, disabled, loading, plus empty and error when it shows data), what to avoid, and sources with their date. Mark a number with no source as a `convention`, so nobody mistakes a convention for a fact.

## Precedence

A sheet gives starting numbers; the identity decides. `design.md` tokens always win over a sheet's measures.
