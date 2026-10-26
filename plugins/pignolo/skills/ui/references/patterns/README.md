# Pattern sheets
A pattern sheet is a short, sourced card (150 to 250 words) for one interface pattern: anatomy, content limits, actions, measures, states and mistakes to avoid. They are the specification behind the components in `../../kit/`. Read the one for the piece you are building, right before building it.

Motion and microinteractions have their own sheet (`motion-and-microinteractions.md`): read it when building anything that moves.

Sheets give starting numbers and checkable states. A number with a named source was checked against that page; one marked "convention" has no source. Hover and focus-visible are listed as states in every sheet.

Rule: `design.md` tokens always win over a sheet's measures. Sheet measures are defaults that apply only when `design.md` does not define the same thing.