# Data table
Use when: users compare values across rows and columns; to browse a few items prefer list rows or cards.
Anatomy: title → toolbar (search, filters, one primary action) → header row → body rows → pagination.
Content limits:
- 5 to 7 visible columns (supuesto); header titles 1 to 2 words, sentence case (Carbon).
- Start at 20 rows per page (Primer).
- Toolbar max 5 actions, extras in overflow (Carbon).
- Wrap long text; truncate only on fixed widths, with tooltip (Primer).
- Row menu with under 3 options: show inline icon buttons (Carbon).
Actions: one primary above the table. Row actions in the last column, no header text. Selecting rows swaps the toolbar for a bulk bar; destructive bulk action last, apart. Row menus are disabled in bulk mode (Carbon).
Measures: row = header height, 24/32/40/48/64px (Carbon); use 48px for airy, 40px default, 64px only for two-line rows. Cell padding 16px horizontal (supuesto). Body 14px; numbers right-aligned, tabular figures (GOV.UK, Primer). One hairline per row; no zebra, no vertical lines (supuesto).
States:
- Row hover: faint background.
- Selected: tint plus checked box.
- Focus-visible: ring on sort header, checkbox, row actions.
- Sorted: arrow icon plus aria-sort.
- Loading: skeleton rows of equal height (Carbon).
- Empty: replace the whole table, headers too, with message and one action (Carbon).
- Error: message above rows plus retry.
Avoid:
- Tables for layout.
- Row height changing after load.
- Dashes as empty cells (Primer).
- Tables nested in cards.
Sources:
- Carbon, Data table usage. https://carbondesignsystem.com/components/data-table/usage/ . No date. alta (numbers stated). dato.
- Primer, DataTable guidelines. https://primer.style/product/components/data-table/guidelines/ . No date. alta. dato (20 rows), opinión.
- GOV.UK, Table. https://design-system.service.gov.uk/components/table/ . No date. alta (user-tested). opinión.
