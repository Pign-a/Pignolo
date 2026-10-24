# Panel header and purpose
Use when: any page or panel starts; the user must see where they are and what to do within a glance.
Anatomy: optional breadcrumb or back link → title → one-line purpose → primary action (right, title row) → optional search/filters row.
Content limits:
- One header per page; none in popups, dialogs or drawers (Atlassian).
- Title: names the place or task, sentence case, short, 1 line (Atlassian); about 40 characters (convention).
- Purpose: one sentence, about 90 characters, says what the user can do here (convention).
- One thing per screen where possible (GOV.UK); split screens instead of growing the header.
Actions: one primary, right-aligned beside the title (Atlassian); max two secondary, rest in overflow (convention). On narrow screens trailing actions collapse into an overflow menu (Primer).
Measures (conventions unless marked): title 24 to 28px/600, line-height about 1.2; purpose 14 to 16px, muted, contrast at least 4.5:1 (WCAG 1.4.3); 8px title to purpose (Atlassian 8px base); 24 to 32px header to content (32px is Atlassian's space.400, its tier for large layout gaps); side-panel header 16px padding, title 16 to 18px.
States:
- Rest: static text, no hover.
- Hover and focus-visible (2px ring, width a convention) on breadcrumb, back link, actions.
- Loading: title immediately; actions inactive (convention).
- Long title: wrap or truncate with tooltip; avoid truncating where possible (Atlassian); never overlap actions.
- Error: header unchanged, message below it (convention).
Avoid:
- Repeating the title in the first card.
- Two filled buttons in the header.
- Breadcrumb, tabs and banner stacked above content.
- Clever titles ("Welcome back!") instead of the place name.
Sources:
- Atlassian, Page header. https://atlassian.design/components/page-header/usage . Fetched 2026-10-24, no page date. High reliability. Opinion; page text has no px values.
- Atlassian, Spacing. https://atlassian.design/foundations/spacing . No date. High. Data: 8px base, space.400 = 32px.
- Primer, PageHeader guidelines. https://primer.style/product/components/page-header/guidelines/ . No date. High. Opinion: narrow-screen overflow.
- GOV.UK, Question pages. https://design-system.service.gov.uk/patterns/question-pages/ . No date. High (user-tested). Opinion.
- WCAG 2.2, Contrast (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html . Standard. Data: 4.5:1.
