# KPI card
Use when: one number answers a daily question (balance, open tasks, revenue this month) and must read at a glance.
Anatomy: label → value (the hero) → comparison or delta → optional tiny trend line.
Content limits:
- 3 to 4 cards in the top band (convention; Carbon and NN/g give no count).
- Label 1 to 3 words; value about 6 characters, abbreviated (12.4k); delta one short phrase ("+8% vs last month") (conventions).
- One dashboard serves one task (NN/g); the key KPI gets the most contrast and area (Carbon).
- Avoid gauges and donuts (NN/g: avoided most of the time).
Actions: none inside. If it drills down, the whole card is the link with a trailing arrow bottom-right and no other links inside (Carbon clickable tile). Period and filter controls live once above the band.
Measures (conventions unless marked): value 32 to 40px/600, tabular figures; label 13 to 14px muted; value to label ratio about 2.5:1; padding 16px, 24px airy (as the card sheet); 8px label to value and value to delta; gap between cards 16px; minimum height 2:1 aspect (Carbon); sparkline about 24px high, no axes.
States:
- Rest: flat, hairline or soft surface, no drop shadow (Carbon tile).
- Hover/active (clickable only): tint and soft shadow, never a lift.
- Focus-visible: 2px ring on the card.
- Loading: skeleton at final size, shown only after 1 s.
- Empty: a dash plus one line ("No sales yet"), not a zero.
- Error: "Couldn't load" plus retry; no stale number.
- Stale: "Updated 2 h ago".
- Delta: sign and icon; colour is a secondary cue only (NN/g).
Avoid:
- Seven KPIs of equal weight.
- Missing unit or currency.
- Green/red as the only up/down cue.
- A chart in every card.
Sources:
- Carbon, Dashboards (data visualization). https://carbondesignsystem.com/data-visualization/dashboards/ . Fetched 2026-10-24, no page date. High reliability. Opinion; no tile numbers, no KPI count.
- NN/g, Dashboards: Making Charts and Graphs Easier to Understand. https://www.nngroup.com/articles/dashboards-preattentive/ . Jun 18, 2017. High. Opinion.
- Carbon, Tile usage. https://carbondesignsystem.com/components/tile/usage/ . No date. High. Data: 2:1, no shadow, clickable rules.
