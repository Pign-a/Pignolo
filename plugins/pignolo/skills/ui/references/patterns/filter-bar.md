# Filter bar
Use when: a list or table is big enough that users must narrow it; under about 10 rows (supuesto) skip it.
Anatomy: search → 1 to 3 filter controls → "More filters" → applied chips (only when active) → clear all.
Content limits:
- 3 visible filters max, rest behind "More filters" (supuesto; Hick's law).
- One control per category; never several categories in one dropdown (Carbon).
- Chip text under 20 characters, one line, ellipsis plus tooltip (Carbon).
- When controls are collapsed, show the applied count (Carbon).
Actions: filters are not actions. Instant update for one choice per category; "Apply filters" only for slow data or many choices (Carbon). "Clear all" is a text link, shown only when something is applied; each category also clears alone (Carbon). No filled button in the bar.
Measures: control height 32/40/48px matching toolbar and rows (Carbon; 40px default); gap between controls 8px; chip gap 8px both axes (Carbon); search first and widest, filters hug content; 16px between bar and table (supuesto).
States:
- Rest: neutral border.
- Hover: border darkens.
- Focus-visible: 2px ring.
- Active filter: tinted fill, value in label ("Status: Open").
- Open menu: field keeps highlight.
- Disabled: only while loading.
- Loading: table skeleton, bar stays usable.
- No results: names the filters plus "Clear all".
Avoid:
- Native multi-selects.
- Hiding applied state when a menu closes.
- Chips wrapping to three lines.
- Pre-applied filters the user did not choose.
- "Apply" for instant filters.
Sources:
- Carbon, Filtering pattern. https://carbondesignsystem.com/patterns/filtering/ . No date. alta (maintained system). opinión.
- Carbon, Tag usage. https://carbondesignsystem.com/components/tag/usage/ . No date. alta. dato (20 chars, 8px).
- Carbon, Search usage. https://carbondesignsystem.com/components/search/usage/ . No date. alta. dato (heights).
