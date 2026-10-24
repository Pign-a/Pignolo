# Sidebar navigation
Use when: more than 5 sections the user revisits often, or switches between often (Carbon); with fewer, a top bar is lighter (convention).
Anatomy: header (product or workspace) → primary destinations → labelled groups → footer (account, settings).
Content limits:
- 5 to 8 top-level destinations (convention, from Hick's law; no source gives a number).
- Depth 2 tiers max: Carbon's left panel does not support three tiers; prefer one.
- Labels 1 to 2 words, nouns, sentence case, never icon alone (convention).
- At most 3 groups (convention).
Actions: items are links, not actions. No filled button in the sidebar; a single "New" action, if any, goes at top as secondary (convention). Destructive items (sign out) last in the footer (convention).
Measures: width 256px / 16rem (Carbon, shadcn); mobile drawer 288px / 18rem (shadcn); item 32px (Carbon), 40px for airy (convention); side padding 16px; icon 16px; sub-item left padding 32px, 16px more than links (Carbon); selected bar 4px (Carbon); collapsed rail about 56px (convention).
States:
- Rest: neutral text.
- Hover: faint background.
- Focus-visible: 2px ring inside item (width is a convention).
- Current: tint, heavier weight, aria-current="page"; not colour alone (convention).
- Group expanded or collapsed: chevron, state remembered (convention).
- Disabled: muted.
- Loading: skeleton lines, shell stays (convention).
- Badge: only if actionable (convention).
Avoid:
- Three-level trees (Carbon does not support them).
- Icon-only items without label or tooltip.
- Several items looking active.
- Counters on every item.
- Width changing between pages.
Sources:
- Carbon, UI shell left panel (style, usage). https://carbondesignsystem.com/components/UI-shell-left-panel/style/ and .../usage/ . Fetched 2026-10-24, no page date. High reliability. Data: 256, 32, 16, 4px; more than five items; no third tier.
- shadcn/ui, Sidebar. https://ui.shadcn.com/docs/components/sidebar . No date. Medium. Data: 16rem, 18rem; no icon-rail width on the page.
- Laws of UX, Hick's Law. https://lawsofux.com/hicks-law/ . No date. Medium (secondary summary). Opinion; no numbers.
