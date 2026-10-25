# Identity phase

The identity is what makes every later screen look like the same product. Decide it before the first screen, because changing a palette or a corner radius after twenty screens means touching all of them.

## How the author gives their taste

Either way is valid; ask which they prefer in one line and do not insist.

- **References**: links or screenshots of interfaces they like. Read what is common (density, corner radius, contrast, how motion feels) and say it back in plain words so they can correct it. A reference is taste, not a template to copy.
- **From scratch**: propose a direction in a few lines based on the product (who uses it, how often, how serious the data is) and let them react. A reaction like "too playful" is enough to adjust.

If the author has no opinion, propose and move on; do not turn it into a questionnaire.

## What to decide

- **Palette**: one accent for the main action and for state, neutrals, and the state colors (success, warning, error). Light and dark if the product needs both. Check contrast of text at 4.5:1.
- **Shape**: rounded or square, and the radius scale. Borders, shadows or flat.
- **Typography**: a font stack that exists on the machine (no remote fonts in the HTML options), the type scale, weights.
- **Animation rules**: sober (state changes only), playful (some motion on interaction) or almost none. Durations, easing or springs (direct, momentum and data tiers: see the motion pattern sheet), and what never moves. Always respect `prefers-reduced-motion`.
- **Navigation**: classic top bar, floating, side, collapsible or not; how it behaves on a phone.
- **Icons, if any**: style (outline or filled), stroke, color, size, animation, and their states.
- **Base elements with ALL their states**, deduced from `roadmap.md`: only what the planned features need.

## States to draw for each element

An element is not done until its states are visible. Use this as the starting set and drop what does not apply:

- Button: rest, hover, active (pressed), focus, disabled, loading.
- Field and dropdown: rest, hover, focus, filled, error, disabled; the dropdown also open, with a selected item, with a long list and empty.
- Calendar (only if the roadmap needs dates): month view, today, selected day, range, disabled days, keyboard focus.
- Table: rest, row hover, sorted column, empty, loading; collapsible rows open and closed.
- Navigation: current item, hover, focus, collapsed and expanded if it collapses.
- Icons: rest, hover, active, disabled, with the identity's color and animation.

## Output

1. Three options for the identity, as style tiles in `design/options/identity/{a,b,c}.html` (see `options.md`), each along a different axis (for example mood: sober, warm, bold).
2. When the author chooses, copy the winning tile to `design/identity/` and write the decision into `design.md` (see "Recording it in design.md"), with the date and the origin (conversation, references).
3. Mark the piece `decidido` in `design/index.html`.

## Recording it in design.md

Start from `templates/design.md` (the file keeps the name the project already uses: `DESIGN.md` if that is there). The chosen palette, typography, radii and spacing go as tokens in the YAML frontmatter at the top, under `colors`, `typography`, `rounded` and `spacing`; keep the shape of the template and replace its placeholder values. Reason: `/pignolo:ui-audit` compares the screens against those tokens, so a value that lives only in the prose cannot be checked.

Below the frontmatter, the prose explains the decisions and cites the tokens by name (`{colors.primary}`, `{rounded.md}`), never by raw value. Animation rules, navigation and icon rules live in the prose and in the `pignolo:` block of the template. Keep the YAML valid: if the audit cannot parse the tokens it audits against the base norms and says so on its first line.
