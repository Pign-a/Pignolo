# List item row
Use when: users scan or pick from similar items with one or two facts each; to compare columns use a data table.
Anatomy: leading visual (optional) → primary text → secondary text (optional) → trailing meta or one action.
Content limits:
- Primary text 1 line, ellipsis (about 60 characters, supuesto). Secondary 1 line, max 2.
- No more than 3 text lines per row (Carbon).
- Trailing: one status, value or action, not a cluster.
- Leading visual only if it aids scanning or shows type/status (Primer).
- 7 to 10 rows before pagination or search (supuesto).
Actions: the whole row is the primary target (Carbon). Secondary actions trail, may show on hover but stay keyboard-focusable (Primer) and always visible on touch. Destructive actions go last in the row menu, never beside the open target.
Measures: one line 48px, two lines 64px (Material 2 convention, supuesto, recalled not fetched); touch target 44px (WCAG 2.5.5), 24px floor (WCAG 2.5.8); horizontal padding 16px; leading visual 24 to 40px with 16px gap; text 14px, secondary 12 to 13px muted; 1px divider only when rows have descriptions (Primer).
States:
- Rest.
- Hover: faint background across the row.
- Focus-visible: ring inside the row.
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
- Primer, ActionList guidelines. https://primer.style/product/components/action-list/guidelines/ . No date. alta (maintained system). opinión.
- Carbon, Structured list usage. https://carbondesignsystem.com/components/structured-list/usage/ . No date. alta. dato (3 paragraphs).
- WCAG 2.2, Target Size. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html . v2.2. alta (standard). dato.
- Material 3 lists: page failed to load.
