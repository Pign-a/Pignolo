# Motion and microinteractions
Use when: building or reviewing any interactive element, overlay, list or data display. Motion confirms an action and explains where things go; it must never make the user wait.
Anatomy: every element sits in one of three tiers, each a spring (a duration and a bounce), not a fixed curve.
Tiers (author's blind choice, two rounds, then adjusted after two independent critiques; one person, so treat them as provisional defaults and let design.md override):
- Direct, for what the user touches (button, switch, tabs, month picker, modal, list rows, dropdown, tooltip, field focus): visualDuration 0.22 s, bounce 0; exit 0.1 s. Sidebar collapse 0.16 s. No per-item stagger in menus.
- Momentum, for things that carry weight or inertia (toasts, accordion, bottom sheet, drag to reorder): visualDuration 0.35 s, bounce 0.2; exit 0.13 s (large overlays 0.16 s); drag keeps velocity, edge rubber-band 0.55, projects the release 0.2 s ahead.
- Data (rolling numbers, bars): visualDuration 0.45 s, bounce 0, a 2px blur on entry for numbers; bars start only when visible, one by one (stagger 90 ms, capped so the whole sweep starts within 0.6 s) and glide on data change; numbers animate only when the value changes after mount.
- Tooltip: no delay, enter 120 ms, exit 80 ms; the content can be hovered.
Press feedback: scale 0.97 within one frame, done with CSS (`:active`), never with Motion's whileTap on an element that can trigger a Radix primitive (Enter fires a synthetic pointerdown and the menu toggles twice). Hover changes color and shadow only: no lift. Never scale an entry from below 0.92 (bars may grow from scaleY near 0).
Rules:
- Interruptible: spamming a control (deleting list items quickly) must keep working; items reflow in under 300 ms.
- Exit always faster than enter. Animate transform and opacity; the documented exceptions are sidebar width, accordion rows, the number blur, the checkbox tick and bar heights. No `transition: all`.
- Very frequent or keyboard-initiated actions: no animation or a fade only.
- A toast with an Undo action does not auto dismiss in 5 s: keep it at least 10 s and pause it on hover, focus and window blur (WCAG 2.2.1).
- `prefers-reduced-motion` and forced colors: replace movement with a quick cross-fade; loading spinners pulse instead of spinning.
States: every animated element still lists rest, hover, focus-visible, active, disabled.
Web: Motion `animate(el, to, { type: "spring", visualDuration, bounce })`; CSS fallback with `linear()` spring easing and `@starting-style`. CSS cannot carry velocity when interrupted, so use the library for drag, lists and overlays that can be interrupted. Other stacks: `references/stacks.md`. Motion's visualDuration times 1.2 is the duration in SwiftUI and Flutter.
Avoid: one slow duration for everything; bounce in plain controls; hover lift; animation that blocks the next click; stagger above 120 ms.
Sources:
- Author's blind votes (private lab, 2026-10-25): 22 sections then 16 sections, 6 options each, letters shuffled per section. Medium reliability: one person, two sessions, light and dark checked, no touch. Decisions after the critiques (bounce 0 in controls, shorter dropdown, no lift) were also the author's. Type: dato of preference.
- Apple, WWDC18 "Designing Fluid Interfaces" and WWDC23 "Animate with springs". https://developer.apple.com/videos/play/wwdc2018/803/ . https://developer.apple.com/videos/play/wwdc2023/10158/ . High. Dato: springs defined by duration and bounce, start at no bounce, interruptible, velocity preserved. The 0.55 rubber-band constant and the 0.2 s projection are widely used reverse-engineered values, not published by Apple.
- NN/g, Executing UX Animations: Duration and Motion Characteristics. https://www.nngroup.com/articles/animation-duration/ (2020). High. Dato: 100 to 400 ms for interface animation, 400 ms feels slow, exits shorter than entries.
- Motion, spring options. https://motion.dev/docs/spring . Dato: visualDuration and bounce.
- web.dev, prefers-reduced-motion. High. Dato: replace motion, keep essential movement.
- WCAG 2.2, Timing Adjustable (2.2.1) and Content on Hover or Focus (1.4.13). https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html . High. Dato.
- Kowalski, 7 practical animation tips. https://emilkowal.ski/ui/7-practical-animation-tips . Opinion: press 0.97, entries not from scale 0.
