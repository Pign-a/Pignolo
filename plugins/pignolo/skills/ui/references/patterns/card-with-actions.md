# Card with actions
Use when: one concept (item, plan, project) needs a short summary and one next step.
Anatomy: title (optional one-line description) → a few related facts → footer actions, or one header action.
Content limits:
- Title 1 line, truncate (about 40 characters, convention). Description max 2 lines (convention).
- Body 2 to 4 short facts (convention): a few short, related pieces of information that invite a click; details live on another page (NN/g).
- Fixed width, height follows content (NN/g); 3 to 4 per row (convention).
- To compare or scan many items use a table or list (NN/g).
Actions: one primary, max two secondary (convention). Destructive goes in an overflow menu, never beside the primary (convention). Whole card clickable OR buttons inside, never both (Carbon). Footer: primary rightmost (convention); a lone link bottom-left (Carbon).
Measures: padding 16px (shadcn; 24px for airy is a convention); section gap 16px (convention); 8px base unit (Atlassian); minimum height 2:1 aspect (Carbon); radius 12px (convention; shadcn uses rounded-xl); title 16px/600, body 14px (convention); footer buttons 32 to 40px high (convention), 44px targets on touch (WCAG 2.5.5).
States:
- Rest: hairline or flat surface, no drop shadow (Carbon: no elevation; shadcn: 1px ring).
- Hover (clickable only): faint background.
- Focus-visible: 2px ring with offset (width is a convention).
- Active: slightly darker.
- Disabled: lower contrast, no hover.
- Loading: skeleton, same size.
- Empty/error: one sentence plus fix action.
Avoid:
- Cards inside cards.
- Two filled buttons in a footer.
- Drop shadows (Carbon).
- A card per row of data.
Sources:
- Carbon, Tile usage. https://carbondesignsystem.com/components/tile/usage/ . Fetched 2026-10-24, no page date. High reliability. Data: 2:1, no shadow, clickable and footer rules.
- NN/g, Cards: UI-Component Definition. https://www.nngroup.com/articles/cards-component/ . Nov 6, 2016. High. Opinion; gives no counts.
- shadcn/ui, Card. https://ui.shadcn.com/docs/components/card . No date. Medium (implementation docs). Data: 16px spacing, rounded-xl, ring-1.
- Atlassian, Spacing. https://atlassian.design/foundations/spacing . No date. High. Data: 8px base.
- WCAG 2.2, Target Size (Enhanced). https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html . Standard. Data.
