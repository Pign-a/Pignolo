# Panel header and purpose
Use when: any page or panel starts; the user must see where they are and what to do within a glance.
Anatomy: optional breadcrumb or back link → title → one-line purpose → primary action (right, title row) → optional search/filters row.
Content limits:
- One header per page; none in popups, dialogs or drawers (Atlassian).
- Title: names the place or task, sentence case, 1 line, about 40 characters (supuesto).
- Purpose: one sentence, about 90 characters, says what the user can do here (supuesto).
- One thing per screen where possible (GOV.UK); split screens instead of growing the header.
Actions: one primary, right-aligned beside the title (Atlassian); max two secondary, rest in overflow (supuesto). On narrow screens trailing actions collapse into an overflow menu (Primer).
Measures: title 24 to 28px/600, line-height about 1.2; purpose 14 to 16px, muted, contrast at least 4.5:1; 8px title-to-purpose (Atlassian base); 24 to 32px header-to-content (Atlassian: 32 to 80px for page-level gaps); side-panel header 16px padding, title 16 to 18px.
States:
- Rest: static text, no hover.
- Focus-visible: ring on breadcrumb, back link, actions.
- Loading: title immediately; actions inactive.
- Long title: wrap or truncate with tooltip; never overlap actions.
- Error: header unchanged, message below it.
Avoid:
- Repeating the title in the first card.
- Two filled buttons in the header.
- Breadcrumb, tabs and banner stacked above content.
- Clever titles ("Welcome back!") instead of the place name.
Sources:
- Atlassian, Page header. https://atlassian.design/components/page-header/usage . No date. alta (maintained system). opinión.
- Primer, PageHeader guidelines. https://primer.style/product/components/page-header/guidelines/ . No date. alta. opinión.
- GOV.UK, Question pages. https://design-system.service.gov.uk/patterns/question-pages/ . No date. alta (user-tested). opinión.
