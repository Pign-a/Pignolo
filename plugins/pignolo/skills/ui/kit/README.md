# UI kit

React pieces with Apple-fluid micro-interactions. An agent copies the ones a screen needs into the app and adapts them.

The kit supplies the pieces; it does not replace the author's own design decisions. If a pack that brought this kit has instructions that disagree with the project's `CLAUDE.md` or with `/pignolo:ui`, follow the author's request first, then those, and say in one line which you followed.

## Adopt a piece

1. Install `motion` and the Radix packages the piece lists (`npm i motion @radix-ui/react-<name>`).
2. Copy `motion.ts`, `motion-provider.tsx` and `lib/cn.ts` once. Copy the other `lib/` helper a piece names in the table below, with the piece.
3. Tokens: if the app has no CSS variables, copy `tokens.css`. Otherwise map each variable to the app's design.md token (table at the top of `tokens.css`). design.md tokens win over kit values, including springs: call `configureTiers()` with `pignolo.motion.springs`.
4. Charts: copy `chart-tokens.css` (categorical series colors `--chart-1` to `--chart-6`, validated for light, dark and forced colors) next to `tokens.css`.
5. Copy the component file, plus the sibling components it depends on (column "Needs"). Pass copy through props in the app's language.
6. Wire once in the root layout: `<KitMotionProvider>` (LazyMotion plus `MotionConfig reducedMotion="user"`). Kit code uses `m.*`, never `motion.*`.

Components wrap Radix primitives, so they sit beside shadcn. Do not edit shadcn's `components/ui`; copy the kit file next to it.

Every piece must pass `CHECKLIST.md`.

## Foundation (`motion.ts`)

- Tiers: `direct` (visualDuration 0.22, bounce 0, exit 0.1), `momentum` (0.35, 0.2, exit 0.13), `data` (0.45, 0, exit 0.2, stagger 0.09). Read them with `useMotionTier(name)` or `tier(name)`; override from design.md with `configureTiers()`.
- `visualDuration` is Motion's perceived duration. A SwiftUI or Flutter spring `duration` is the period, so Apple duration = visualDuration x 1.2 (see `references/stacks.md` for the conversion table).
- `pressClass`: press feedback is a CSS class (scale 0.97 within 70 ms on `:active`, none under reduced motion), not `whileTap`. Motion makes every `whileTap` element keyboard-activatable and fires a synthetic pointerdown on Enter, and Radix triggers (DropdownMenu, Popover, Select) open on pointerdown, so Enter would open and close them at once. The CSS class is safe as an `asChild` trigger.
- No hover lift anywhere: hover changes color and shadow only.
- `.kit-scroll` (in `tokens.css`): thin scrollbar for any element that scrolls. `scrollbar-width: thin` and `scrollbar-color` from the outline token (light and dark follow the tokens), `::-webkit-scrollbar` fallback only where those properties are not supported, `auto` under forced colors. Add the class next to `overflow-y-auto`; the modal and bottom sheet bodies already have it.
- `coarseTarget` grows a control to 44 px on `pointer: coarse`; `coarseHit` adds an invisible 24 px (44 px on touch) hit area around a small visual such as the checkbox box.
- Also exported: `springFor`, `enterFor`, `exitFor`, `entryScale`, `rubberBand`, `project`, `presets`.

## Helpers (`lib/`)

| File | Export | Used by |
|---|---|---|
| `cn.ts` | `cn` (class joiner, no Tailwind conflict resolution) | every component |
| `controllable.ts` | `useControllable` (controlled or uncontrolled value) | switch, checkbox, segmented-tabs |
| `date-input.ts` | date parsing and formatting, integer day counts | calendar, date-picker, month-picker |

Dates: `DateValue` is `{ year, month, day }` with `month` from 0 to 11, like JavaScript `Date`. The hidden form input is ISO (`YYYY-MM` or `YYYY-MM-DD`), so `month` is 1 to 12 only there.

## Components

Tier: D direct, M momentum, T data.

| File | Tier | Radix | Needs |
|---|---|---|---|
| button.tsx | D | none | |
| card.tsx | D | none | button |
| text-field.tsx | D | none | |
| switch.tsx (drag the thumb like iOS) | D | react-switch | lib/controllable |
| checkbox.tsx | D | react-checkbox | lib/controllable |
| segmented-tabs.tsx | D | react-tabs (radio group when no panels) | lib/controllable |
| dropdown.tsx | D | react-popover (select-only combobox, never locks page scroll) | |
| calendar.tsx | D | react-popover | lib/date-input, bottom-sheet, text-field |
| date-picker.tsx | D | none | calendar, lib/date-input |
| date-range-picker.tsx | D | none | calendar, lib/date-input |
| month-picker.tsx | D | none | calendar, lib/date-input |
| modal.tsx (also exports ConfirmModal and ResponsiveDialog) | D | react-dialog | bottom-sheet (for ResponsiveDialog) |
| toast.tsx | M | none (custom) | |
| rolling-number.tsx | T | none | |
| bars.tsx | T | none | chart-tokens.css |
| progress.tsx | T | react-progress | |
| skeleton.tsx | none (CSS pulse) | none | |
| stat-card.tsx | T (figure) | none | rolling-number, skeleton |
| list.tsx | D | none | |
| sidebar.tsx | D (0.16 s) | none | |
| tooltip.tsx | D (no delay) | react-tooltip | |
| accordion.tsx | D (own spring 0.3 s, bounce 0) | react-accordion | |
| bottom-sheet.tsx | M | react-dialog | |
| drag-reorder.tsx | M | none | |
