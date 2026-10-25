# UI kit

React pieces with Apple-fluid micro-interactions. An agent copies the ones a screen needs into the app and adapts them.
## Adopt a piece

1. Install `motion` and the Radix packages the piece lists (`npm i motion @radix-ui/react-<name>`).
2. Copy `motion.ts`, `motion-provider.tsx` and `lib/cn.ts` once.
3. Tokens: if the app has no CSS variables, copy `tokens.css`. Otherwise map each variable to the app's design.md token (table at the top of `tokens.css`). design.md tokens win over kit values, including springs: call `configureTiers()` with `pignolo.motion.springs`.
4. Copy the component file. Pass copy through props in the app's language.
5. Wire once in the root layout: `<KitMotionProvider>` (LazyMotion plus `MotionConfig reducedMotion="user"`). Kit code uses `m.*`, never `motion.*`.

Components wrap Radix primitives, so they sit beside shadcn. Do not edit shadcn's `components/ui`; copy the kit file next to it.

Every piece must pass `CHECKLIST.md`.

## Components

Tier: D direct, M momentum, T data.

| File | Tier | Radix |
|---|---|---|
| button.tsx | D | none |
| card.tsx | D | none |
| switch.tsx | D | react-switch |
| segmented-tabs.tsx | D | react-tabs |
| dropdown.tsx | M | react-dropdown-menu |
| month-picker.tsx | D | react-popover |
| modal.tsx | D | react-dialog |
| toast.tsx | M | none (custom) |
| rolling-number.tsx | T | none |
| bars.tsx | T | none |
| list.tsx | D | none |
| sidebar.tsx | D (0.16 s) | none |
| tooltip.tsx | D (no delay) | react-tooltip |
| accordion.tsx | M | react-accordion |
| bottom-sheet.tsx | M | react-dialog |
| drag-reorder.tsx | M | none |
| checkbox.tsx | D | react-checkbox |
| progress.tsx | T | react-progress |
