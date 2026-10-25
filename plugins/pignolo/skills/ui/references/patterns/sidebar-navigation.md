# Sidebar navigation
Use when: more than 5 sections the user revisits often (Carbon); with fewer, a top bar is lighter (convention).
Anatomy: toggle → header (product or workspace) → primary destinations → labelled groups → footer (account, settings).
Content limits:
- 5 to 8 top-level destinations (convention, Hick's law; no source gives a number).
- Depth 2 tiers max: Carbon's left panel does not support three.
- Labels 1 to 2 words, nouns, sentence case, never icon alone (convention). At most 3 groups (convention).
Actions: items are links, not actions. No filled button; a single "New" action, if any, secondary at top (convention). Destructive items last in the footer (convention).
Measures: width 256px (Carbon, shadcn); mobile drawer 288px (shadcn); item 32px (Carbon), 40px airy (convention); icon 16px; selected bar 4px (Carbon); collapsed rail about 56px (convention).
Collapse: one toggle with a fixed label and aria-expanded; aria-controls names the region that collapses, not the nav. In the rail show each label in a tooltip on hover and keyboard focus, never a native title; header and footer become inert. Remember the state (localStorage in try and catch).
Below 768px (convention) a drawer: modal, overlay, focus trap, Esc, focus back to the menu button; it always shows labels, since tooltips do not exist on touch.
Motion (kit): width spring 0.16s, bounce 0; the drawer enters with the momentum spring and leaves in 0.16s. Reduced motion: width snaps, drawer fades.
States:
- Rest: neutral text. Hover: faint background. Focus-visible: 2px ring inside the item.
- Current: tint, heavier weight, aria-current="page"; not colour alone (convention).
- Disabled: muted. Loading: skeleton lines, shell stays. Badge: only if actionable (convention).
Avoid: three-level trees; icon-only items without a label or tooltip; several items looking active; counters on every item; a toggle label that changes with the state.
Sources:
- Carbon, UI shell left panel (style, usage). https://carbondesignsystem.com/components/UI-shell-left-panel/style/ and .../usage/ . Fetched 2026-10-24, no page date. High reliability. Data: 256, 32, 16, 4px; more than five items; no third tier.
- shadcn/ui, Sidebar. https://ui.shadcn.com/docs/components/sidebar . No date. Medium. Data: 16rem, 18rem; mobile drawer.
- W3C APG, Disclosure pattern. https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ . Not re-fetched this session. High. Rule: keep the label, change aria-expanded.
- Laws of UX, Hick's Law. https://lawsofux.com/hicks-law/ . No date. Medium (secondary summary). Opinion; no numbers.
