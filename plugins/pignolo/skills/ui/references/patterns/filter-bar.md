# Filter bar
Use when: a list or table is big enough that users must narrow it; under about 10 rows (convention) skip it.
Anatomy: search → 1 to 3 filter controls → "More filters" → applied chips (only when active) → clear all.
Content limits:
- 3 visible filters max, rest behind "More filters" (convention, from Hick's law; no source gives a number).
- One control per category; never several categories in one dropdown (Carbon).
- Chip text under 20 characters when possible, one line, ellipsis plus tooltip (Carbon Tag).
- When controls are collapsed, show at least the applied count (Carbon).
Actions: filters are not actions. Instant update for single-category filtering; "Apply filters" (batch) for multi-category selection or slow data (Carbon). Each category can clear alone and a separate control clears all (Carbon); "Clear all" as a text link shown only when something is applied (convention). No filled button in the bar (convention).
Measures: control height 32/40/48px matching toolbar and rows, 40px default (Carbon Search and Dropdown); chip gap 8px on all sides (Carbon Tag); gap between controls 8px (convention); search first and widest, filters hug content (convention); 16px between bar and table (convention).
States:
- Rest: neutral border.
- Hover: border darkens.
- Focus-visible: 2px ring (width is a convention).
- Active filter: tinted fill, value in label ("Status: Open") (convention).
- Open menu: field keeps highlight.
- Disabled: only while loading (convention).
- Loading: table skeleton, bar stays usable.
- No results: names the filters plus "Clear all".
Avoid:
- Native multi-selects.
- Hiding applied state when a menu closes.
- Chips wrapping to three lines.
- Pre-applied filters the user did not choose.
- "Apply" for instant filters.
Sources:
- Carbon, Filtering pattern. https://carbondesignsystem.com/patterns/filtering/ . Fetched 2026-10-24, no page date. High reliability. Opinion; gives no sizes or counts.
- Carbon, Tag usage. https://carbondesignsystem.com/components/tag/usage/ . No date. High. Data: 20 characters, 8px.
- Carbon, Search usage. https://carbondesignsystem.com/components/search/usage/ . No date. High. Data: heights.
- Carbon, Dropdown usage. https://carbondesignsystem.com/components/dropdown/usage/ . No date. High. Data: heights.
