---
name: ui
description: "Use when the user asks to define the look of the project or design interface pieces, in Spanish or English: 'definamos el diseño', 'definamos la identidad', 'diseñemos la pantalla de login', 'armemos el catálogo de componentes', 'design the screen', 'define the design', 'set up the visual identity'. Defines the identity first, keeps a catalog of components with all their states and offers three HTML options only for big pieces."
---

# ui: identity first, then a catalog, then big pieces with options

Interfaces drift when each screen reinvents its buttons and its calendar. So the look is decided once (identity), the elements are built once with all their states (catalog), and screens reuse them. Everything lives in the project as static HTML that opens by double click; nothing is published outside the machine and nothing blocks. Auditing the result is a separate request: `ui-audit`.

## 1. Start from what exists

Read `design.md`, `roadmap.md` and the screens already built. Keep the existing file name: if `DESIGN.md` is there, use it (Windows treats both names as the same file). If the project has no interface, say so in one line and stop. If an identity is already decided, go to the catalog or to the piece the author asked for.

## 2. Identity phase (first, when the project has an interface)

The author gives their taste as links or screenshots, or you propose from scratch and they react; either works. Decide palette, shape style (rounded or square), typography, animation rules (sober, playful, almost none), navigation (top, floating, side, collapsible or not) and icons if any. Detail and the list of states: `references/identity.md`.

What gets designed is deduced from `roadmap.md`: the elements the planned features need and no others (no calendar in the app, no calendar designed). Say the deduced list in one line and continue unless the author adjusts it.

The identity itself is a big decision, so it goes through three options (section 4). Write the decision into `design.md`, which is the document screens read.

## 3. Catalog

`design/components/` holds one HTML per element with all its states: button (rest, hover, active, focus, disabled, loading), dropdown with its interactions, calendar, collapsible table. Screens reuse these elements and never fall back to the browser's native calendar or select, because native widgets cannot follow the identity and look different on every browser. By default the catalog grows with each component a screen needs; in the "interfaz primero" route it is built whole, on purpose, before any screen. Details: `references/catalog.md`.

"Mandatory" here is a convention: `design.md` states the reason, and `/pignolo:ui-audit` can check it when asked. Nothing blocks.

## 4. Options

Three options, in separate HTML files, only for big pieces: the identity, full screens, and large parts such as navigation, a modal, a sidebar or a data table. A button or a title never gets options: decide it directly and move on, because comparing three buttons costs more than any of them is worth. Generate each option with the `ui-option` agent, one per axis, launched together; the brief, the axes and the sample-data rules are in `references/options.md`.

## 5. The navigator

```
design/
  index.html        navigator: decidido / pendiente, opens by double click
  identity/         palette, typography, shapes, animations
  components/       one HTML per element, with all its states
  options/<piece>/  a.html  b.html  c.html
```

The status of each piece (`decidido` or `pendiente`) lives in the data embedded in `index.html`. Create it from `templates/index.html` and regenerate it from the template whenever a piece is added or decided: replace only the `<script id="data" type="application/json">` block, keep the rest. When you write that JSON by hand, write every `<` as `\u003c` and check that the block parses before you finish: a name containing `</script>` would otherwise close the element early and spill the data onto the page, and a stray comma would make the index read as empty when it is only corrupt. Set a piece to `decidido` when the author chooses an option, and record the choice in `design.md`.

## 6. Close

Tell the author in Spanish which pieces are decided, which are pending, and the path of `design/index.html`. Do not publish, upload or open anything remote. Do not commit unless asked.
