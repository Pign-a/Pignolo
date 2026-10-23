# Component catalog

The catalog is `design/components/`: one HTML file per element, each showing the element with all its states side by side. Screens reuse these elements instead of recreating them, so everything looks and behaves the same and a change to the identity happens in one place.

## Why screens reuse it, and never the native widgets

The browser's native calendar and select cannot follow the identity (shape, color, motion) and look different on every browser and system. A screen that uses them breaks the look and cannot be audited against `design.md`. This is a convention, not a lock: `design.md` says it with the reason, `/pignolo:ui-audit` can check it when the author asks, and nothing blocks if a screen breaks it.

## Layout

```
design/
  index.html          navigator (decidido / pendiente)
  identity/           the decided tile: palette, typography, shapes, animations
  components/
    button.html       rest, hover, active, focus, disabled, loading
    dropdown.html
    calendar.html     only if the roadmap has dates
    table.html
  options/<piece>/    a.html  b.html  c.html
```

Names are lowercase with hyphens. Each component file is static HTML with inline CSS, takes its values from the identity (the same variables: color, radius, font), and has a small inline script only if the element needs it to show a state (an open dropdown, for example). No remote resources.

## When it grows

- **Default**: the catalog grows with each new component. When a screen needs an element that is not there, build it first with all its states, then use it in the screen. A button or a title is built directly; only big pieces get options.
- **"interfaz primero" route**: the author chose to design the interface before the backend. Then the whole catalog is built on purpose, before any screen, from the elements `roadmap.md` needs. Screens come after and only assemble catalog pieces.

## Keeping it honest

- An element that appears in a screen and not in the catalog is a gap: add it to the catalog.
- If the identity changes, regenerate the affected components; do not patch screens one by one.
- Record in `design.md` the list of components that exist and where they live, one line each.
