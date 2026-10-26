# Kit component checklist

A component is done when all hold:

- Keyboard operable; Radix semantics kept (or the matching APG pattern when no Radix part fits).
- Focus-visible ring from tokens (`.kit-focus`).
- Rest, hover, active and disabled states exist.
- Tier named in the header comment, with the values the code really uses.
- Reduced motion honored (cross-fade, no travel).
- Exit faster than enter; interruptible by spamming.
- Only transform and opacity animate; no `transition: all`. The allowed exceptions are the table below.
- Hover changes color and shadow only: no lift, no translate. Press is CSS (`pressClass`), not `whileTap`.
- Bounce only for things with inertia (momentum tier: sheets, toasts, drag). Controls (direct tier), the accordion and data use bounce 0.
- Anything that scrolls (a modal body, a sheet body, a list in a popover) carries `kit-scroll` (tokens.css): thin scrollbar from `--color-outline`, never the browser default. It uses `scrollbar-width` and `scrollbar-color`, with `::-webkit-scrollbar` rules only where those are unsupported, and gives the scrollbar back to the system under forced colors.
- A box that scrolls or clips (`overflow` other than visible) leaves room for the focus ring of its last control (4 px outside it: padding of at least 8 px on the sides that clip). A bounding box assertion in the interaction test covers it.
- Parts of a row (icon, text, action, close) share one vertical center (`items-center`); measure it in the interaction test.
- Touch targets: 44 px on `pointer: coarse` (`coarseTarget`, or `coarseHit` for a small visual); 24 px minimum on desktop (WCAG 2.2 target size).
- Forced colors (Windows high contrast): anything drawn with a background, `box-shadow` or opacity layer stays visible. Use `forced-colors:` classes with system colors (CanvasText borders, Highlight and HighlightText for the selected state, GrayText for disabled) and `forced-color-adjust: none` where the component paints its own state.
- Non-text contrast: an off or empty control keeps a 3:1 outline against the page, light and dark (WCAG 1.4.11).
- No hardcoded colors; no em dashes in any text.
- No pill shapes, except status tags, removable chips and toggle tracks.
- Copy comes from props, in the app's language.
- A preview page and an interaction test in the sandbox, normal and reduced motion.

## Allowed non-transform animations

Each of these animates a layout property, a filter or an SVG attribute on purpose, is short, and is covered by an interaction test. The component header names it too.

| Where | What animates | Why |
|---|---|---|
| sidebar | `width` of the panel (0.16 s, bounce 0) | the content next to it must reflow |
| accordion | `grid-template-rows` 0fr to 1fr | an auto height cannot be animated with transform |
| rolling-number | `filter: blur`, at most 2 px (`presets.numberBlur`) | the digit blur on entry; the filter is cleared once settled |
| checkbox, steps | SVG `pathLength` of the tick | the draw-on effect |
| text-field | `height` of the field box, 52 to 60 px | the label moves inside and the box grows; the slot is reserved at the grown height, so nothing around it moves |
| bars | `height` of a bar when its data changes after the reveal | the bar must keep its proportion to the others |

Anything else that is not transform or opacity needs a row here with its reason, or a different design.
