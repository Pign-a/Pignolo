# Data table
Use when: users compare values across rows and columns; to browse a few items prefer list rows or cards.
Anatomy: title → toolbar (search, filters, one primary action) → header row → body rows → pagination.
Content limits:
- 5 to 7 visible columns (convention; no source gives a count); header titles 1 to 2 words, sentence case (Carbon).
- Start at 20 rows per page (Primer).
- Toolbar max 5 actions, extras in overflow (Carbon).
- Wrap long text; truncate only on fixed widths, with tooltip (Primer).
- Row menu with under 3 options: show inline icon buttons (Carbon).
Actions: one primary above the table (convention). Row actions in the last column, no header text (convention). Selecting rows swaps the toolbar for a bulk bar; row menus are disabled in bulk mode (Carbon); destructive bulk action last, apart (convention).
Measures: row height = header height, one of 24/32/40/48/64px (Carbon); 40px default, 48px airy, 64px only for two-line rows (Carbon). Cell padding 16px horizontal (Carbon column spacing). Body 14px, column header 14px/600 (Carbon). Numbers right-aligned (GOV.UK, Primer) with tabular figures (Primer). One hairline per row (Carbon: bottom border); no zebra, no vertical lines (convention).
States:
- Row hover: faint background.
- Selected: tint plus checked box.
- Focus-visible: ring on sort header, checkbox, row actions.
- Sorted: arrow icon plus aria-sort.
- Loading: skeleton rows of equal height (Carbon, Primer).
- Empty: replace the whole table, headers too, with message and one action (Carbon empty states).
- Error: message above rows plus retry (convention).
Avoid:
- Tables for layout.
- Row height changing after load (Primer).
- Dashes as empty cells; leave them blank (Primer).
- Tables nested in cards.
Sources:
- Carbon, Data table usage. https://carbondesignsystem.com/components/data-table/usage/ . Fetched 2026-10-24, no page date. High reliability. Data: row sizes, 5 actions, 3 options.
- Carbon, Data table style. https://carbondesignsystem.com/components/data-table/style/ . No date. High. Data: padding, font sizes.
- Primer, DataTable guidelines. https://primer.style/product/components/data-table/guidelines/ . No date. High. Data: 20 rows; opinion.
- GOV.UK, Table. https://design-system.service.gov.uk/components/table/ . No date. High. Opinion: numbers right-aligned.
