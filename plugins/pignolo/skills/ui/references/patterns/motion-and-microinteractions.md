# Motion and microinteractions
Use when: building or reviewing any interactive element, overlay, list or data display. Motion confirms an action and explains where things go; it must never make the user wait.
Anatomy: every element sits in one of three tiers, each a spring (a duration and a bounce), not a fixed curve.
Tiers (author's blind choice, two rounds of 22 and 16 sections, one person; start here and let design.md override):
- Direct, for what the user touches (button, switch, tabs, month picker, modal, list rows, tooltip, field focus): visualDuration 0.2 to 0.25 s, bounce 0.15; exit 90 to 110 ms. Tabs tolerated 0.3 s. Sidebar collapse preferred 0.16 s, bounce 0.
- Momentum, for things that carry weight (dropdown, toasts, accordion, bottom sheet, drag to reorder): visualDuration 0.25 to 0.35 s, bounce 0.15 to 0.25; exit 130 ms; drag keeps velocity, edge rubber-band 0.55, projects the release 0.2 s ahead.
- Data (rolling numbers, bars): visualDuration 0.4 to 0.45 s, bounce 0, a 2px blur on entry for numbers; bars start only when visible, one by one with stagger 90 ms (numbers 50 ms).
- Tooltip: no delay, enter 120 ms, exit 80 ms.
Press feedback: scale 0.97 within one frame; hover lift 2 to 3px; never scale an entry from below 0.92 (bars may grow from scaleY near 0).
Rules:
- Interruptible: spamming a control (deleting list items quickly) must keep working; items reflow in under 300 ms.
- Exit always faster than enter. Animate transform and opacity only; no `transition: all`.
- Very frequent or keyboard-initiated actions: no animation or a fade only.
- `prefers-reduced-motion`: replace movement with a quick cross-fade (web.dev).
States: every animated element still lists rest, hover, focus-visible, active, disabled.
Web: Motion `animate(el, to, { type: "spring", visualDuration, bounce })`; CSS fallback with `linear()` spring easing and `@starting-style`. CSS cannot carry velocity when interrupted, so use the library for drag, lists and overlays that can be interrupted.
Avoid: one slow duration for everything; bounce above 0.25 in controls; animation that blocks the next click; stagger above 120 ms.
Sources:
- Author's blind votes (private lab, 2026-10-25): 22 sections then 16 sections, 6 options each, letters shuffled per section; Motion snappy won most direct controls; the slower inertia variants won overlays and drag. Medium reliability: one person, one session, dark and light checked, no touch. Type: dato of preference.
- Apple, WWDC18 "Designing Fluid Interfaces" and WWDC23 "Animate with springs". https://developer.apple.com/videos/play/wwdc2018/803/ . https://developer.apple.com/videos/play/wwdc2023/10158/ . High. Dato: springs defined by duration and bounce, start at no bounce, interruptible, velocity preserved.
- Motion, spring options. https://motion.dev/docs/spring . Dato: visualDuration and bounce.
- web.dev, prefers-reduced-motion. High. Dato: replace motion, keep essential movement.
- Kowalski, 7 practical animation tips. https://emilkowal.ski/ui/7-practical-animation-tips . Opinion: press 0.97, entries not from scale 0.
