# List item row
Use when: users scan or pick from similar items with one or two facts each; to compare columns use a data table.
Anatomy: leading visual (optional) → primary text → secondary text (optional) → trailing meta or one action.
Content limits:
- Primary text 1 line, ellipsis (about 60 characters, convention). Secondary 1 line, max 2 (convention).
- At most 3 paragraphs of text per row (Carbon Structured list).
- Trailing: one status, value or action, not a cluster.
- Leading visual only if it aids scanning or shows type/status (Primer).
- 7 to 10 rows before pagination or search (convention).
Actions: the whole row is the primary target (Carbon: selectable rows are clickable anywhere). Secondary actions trail, may show on hover but stay individually keyboard-focusable (Primer) and always visible on touch. Destructive actions go last in the row menu, never beside the open target.
Measures: one line 40px, 48px airy, two lines 64px (Carbon table row sizes applied by analogy; no list source, Material pages failed to load). Touch target 44px (WCAG 2.5.5), 24px floor (WCAG 2.5.8); horizontal padding 16px (Carbon table spacing); leading visual 24 to 40px, 16px gap; text 14px, secondary 12 to 13px muted (conventions); 1px divider only with descriptions or multi-line text (Primer).
States:
- Rest.
- Hover: faint background across the row.
- Focus-visible: 2px ring inside the row.
- Active: slightly darker.
- Selected: tint plus check or radio.
- Disabled: muted, no hover.
- Loading: skeleton row, same height.
- Empty: use the empty-state sheet.
- Error: inline line in secondary position.
Avoid:
- Dividers, zebra and cards at once.
- Icon buttons without accessible name.
- Row height changing on hover.
- Mixing single and multi select (Primer).
Sources:
- Primer, ActionList guidelines. https://primer.style/product/components/action-list/guidelines/ . Fetched 2026-10-24, no page date. High reliability. Opinion; no row heights.
- Carbon, Structured list usage. https://carbondesignsystem.com/components/structured-list/usage/ . No date. High. Data: 3 paragraphs.
- Carbon, Data table usage and style. https://carbondesignsystem.com/components/data-table/usage/ . No date. High. Data: 40/48/64px rows, 16px spacing.
- WCAG 2.2, Target Size. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html . Standard. Data.
- Material 2 and Material 3 lists (m2.material.io/components/lists, m3.material.io/components/lists/specs): page failed to load; not used.
