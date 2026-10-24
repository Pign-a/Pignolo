# Sidebar navigation
Use when: more than 5 sections the user revisits often (Carbon); with fewer, a top bar is lighter.
Anatomy: header (product or workspace) → primary destinations → labelled groups → footer (account, settings).
Content limits:
- 5 to 8 top-level destinations (supuesto; Hick's law).
- Depth 2 tiers max (Carbon); prefer one.
- Labels 1 to 2 words, nouns, sentence case, never icon alone.
- At most 3 groups (supuesto).
Actions: items are links, not actions. No filled button in the sidebar; a single "New" action, if any, goes at top as secondary. Destructive items (sign out) last in the footer.
Measures: width 256px / 16rem (Carbon, shadcn); mobile drawer 288px / 18rem (shadcn); item 32px (Carbon), 40px for airy (supuesto); side padding 16px; icon 16px; sub-item indent +16px (Carbon); selected bar 4px (Carbon); collapsed rail about 56px (supuesto).
States:
- Rest: neutral text.
- Hover: faint background.
- Focus-visible: ring inside item.
- Current: tint, heavier weight, aria-current="page"; not colour alone.
- Group expanded or collapsed: chevron rotates, state remembered.
- Disabled: muted.
- Loading: skeleton lines, shell stays.
- Badge: only if actionable.
Avoid:
- Three-level trees (Carbon does not support them).
- Icon-only items without label or tooltip.
- Several items looking active.
- Counters on every item.
- Width changing between pages.
Sources:
- Carbon, UI shell left panel (usage, style). https://carbondesignsystem.com/components/UI-shell-left-panel/style/ . No date. alta (maintained system). dato (256, 32, 16px).
- shadcn/ui, Sidebar. https://ui.shadcn.com/docs/components/sidebar . No date. media. dato (16rem, 18rem).
- Laws of UX, Hick's Law. https://lawsofux.com/hicks-law/ . No date. media (secondary summary). opinión.
