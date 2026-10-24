# Card with actions
Use when: one concept (item, plan, project) needs a short summary and one next step.
Anatomy: title (optional one-line description) → a few related facts → footer actions, or one header action.
Content limits:
- Title 1 line, truncate (about 40 characters, supuesto). Description max 2 lines.
- Body 2 to 4 short facts: a summary that invites a click, not the full detail (NN/g).
- Fixed width, height follows content; 3 to 4 per row (supuesto).
- To compare or scan many items use a table or list (NN/g).
Actions: one primary, max two secondary. Destructive goes in an overflow menu, never beside the primary. Whole card clickable OR buttons inside, never both (Carbon). Footer: primary rightmost; a lone link bottom-left (Carbon).
Measures: padding 16px (shadcn) or 24px for airy (supuesto); section gap 16px; 8px base (Atlassian); min aspect 2:1 (Carbon); radius 12px (supuesto); title 16px/600, body 14px; footer buttons 32 to 40px high, 44px targets on touch (WCAG 2.5.5).
States:
- Rest: hairline OR soft shadow, not both.
- Hover (clickable only): faint background.
- Focus-visible: 2px ring with offset.
- Active: slightly darker.
- Disabled: lower contrast, no hover.
- Loading: skeleton, same size.
- Empty/error: one sentence plus fix action.
Avoid:
- Cards inside cards.
- Two filled buttons in a footer.
- Heavy drop shadows (Carbon).
- A card per row of data.
Sources:
- Carbon, Tile usage. https://carbondesignsystem.com/components/tile/usage/ . No date. alta (maintained system). dato (2:1), opinión.
- NN/g, Cards: UI-Component Definition. https://www.nngroup.com/articles/cards-component/ . Nov 6, 2016. alta (research group). opinión.
- shadcn/ui, Card. https://ui.shadcn.com/docs/components/card . No date. media (implementation docs). dato (16px).
