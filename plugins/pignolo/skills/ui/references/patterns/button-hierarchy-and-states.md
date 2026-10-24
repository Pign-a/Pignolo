# Button hierarchy and states
Use when: any screen offers actions. Decide the one primary action first; the rest step down.
Anatomy: optional leading icon → verb + object label → optional trailing icon; groups of 2 to 3.
Content limits:
- One primary per page or area; a modal, header or panel is its own area (Carbon, Atlassian, GOV.UK).
- Group of 2 to 3; beyond that use a menu button. Over 3 calls to action: tertiary or ghost (Carbon).
- Label: verb first, sentence case, about 2 to 3 words ("Save changes"); never wrap or truncate (Carbon, Primer).
Hierarchy: primary (filled) → secondary (pairs with primary, usually Cancel/Back) → tertiary/ghost → danger (last step of a confirmed destructive flow; lower styles if one of many) (Carbon, GOV.UK). Primary last in a row (Primer), first when stacked (Carbon); left-aligned on page forms (GOV.UK), right in dialogs.
Measures (Carbon): heights 24/32/40/48/64px, 40px default, 32px compact, 48px airy; side padding 16px; label 14px; icon 16px; ghost label-icon gap 8px; gap between buttons 16px; target 24px minimum (WCAG 2.5.8), 44px on touch (WCAG 2.5.5).
States:
- Rest.
- Hover: one step darker, same logic in every variant.
- Focus-visible: 2px ring plus inset; never removed (Primer).
- Active: another step darker.
- Loading: spinner replaces icon, label stays, width fixed, aria-disabled keeps focus (Primer).
- Disabled: avoid; keep pressable and explain through validation (Atlassian, GOV.UK); no tooltip on a disabled button.
- Danger: same states in red.
Avoid:
- Two filled buttons side by side.
- Red as the only sign of danger (GOV.UK).
- Generic labels ("OK", "Submit").
- A disabled primary with no explanation.
Sources:
- Carbon, Button usage and style. https://carbondesignsystem.com/components/button/style/ . No date. alta (maintained system). dato (heights, 16px).
- Primer, Button. https://primer.style/product/components/button/ . No date. alta. opinión.
- Atlassian, Button usage. https://atlassian.design/components/button/usage . No date. alta. opinión.
- GOV.UK, Button. https://design-system.service.gov.uk/components/button/ . No date. alta. opinión.
