# Button hierarchy and states
Use when: any screen offers actions. Decide the one primary action first; the rest step down.
Anatomy: optional leading icon → verb + object label → optional trailing icon; groups of 2 to 3.
Content limits:
- One primary per page or area; a modal, header or panel is its own area (Atlassian, Primer, GOV.UK; Carbon: per page).
- Group of 2 to 3; beyond that use a menu button. Over 3 calls to action: tertiary or ghost (Carbon).
- Label: verb + object, sentence case, succinct; never truncate, wrap if it must (Carbon).
Hierarchy: primary (filled) → secondary (pairs with primary, usually Cancel/Back) → tertiary/ghost → danger (primary danger when it is the required step; tertiary or ghost danger when one of several choices) (Carbon, GOV.UK).
Order: page forms left-aligned, primary first (Carbon, GOV.UK); dialogs, panels, wizards right-aligned, primary last (Carbon, Primer, Atlassian); stacked, primary on top (Carbon).
Measures: heights 24/32/40/48/64px (Carbon); 40px default (convention; Carbon's table and search call 40 default); side padding 16px; label 14px; icon 16px; ghost icon gap 8px; gap between buttons 16px (Carbon recommendation); target 24px minimum (WCAG 2.5.8), 44px on touch (WCAG 2.5.5).
States:
- Rest.
- Hover: one step darker in every variant (convention).
- Focus-visible: 2px ring, never removed.
- Active: another step darker.
- Loading: spinner replaces icon, label stays, width fixed; aria-disabled keeps focus (Primer).
- Disabled: avoid; keep pressable and explain through validation (Atlassian, GOV.UK, Primer); no tooltip on a disabled button (Atlassian).
- Danger: same states in red.
Avoid:
- Two filled buttons side by side.
- Red as the only sign of danger (GOV.UK).
- Generic labels ("OK", "Submit").
Sources:
- Carbon, Button style. https://carbondesignsystem.com/components/button/style/ . Fetched 2026-10-24, no page date. High reliability. Data: heights, padding, icon, gap.
- Carbon, Button usage. https://carbondesignsystem.com/components/button/usage/ . No date. High. Opinion: counts, order, labels, danger.
- Primer, Button guidelines. https://primer.style/product/components/button/guidelines/ (and /button/ for loading). No date. High. Opinion.
- Atlassian, Button usage. https://atlassian.design/components/button/usage . No date. High. Opinion.
- GOV.UK, Button. https://design-system.service.gov.uk/components/button/ . No date. High. Opinion.
- WCAG 2.2, Target Size. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html and https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html . Standard. Data.
