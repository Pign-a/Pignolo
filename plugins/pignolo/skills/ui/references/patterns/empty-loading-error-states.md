# Empty, loading and error states
Use when: a region has no data yet, is waiting, or failed. Design all three before the happy path.
Anatomy: optional graphic → title → one-line explanation of the next step → one action → optional help link.
Content limits:
- Title 1 line, positive ("Start by adding a client"); minimal plain words, no jargon (Carbon). Body 1 to 2 sentences (convention).
- One primary action; errors add at most a text link.
- Illustration optional, decorative, skipped in small spaces (Carbon, Atlassian).
- Under 1s show nothing (the kit skeleton region waits 1000 ms). 1 to 10s: skeleton for a page or several modules, spinner for one small module (NN/g 2023). Over 10s: progress bar with an estimate (Primer, NN/g).
Actions: empty = create or import (primary); filtered-empty = "Clear filters"; error = Retry plus help; no permission = request access (conventions). Several empty regions on screen: tertiary buttons (Carbon).
Measures: text block 464px wide, 304px in narrow containers (Atlassian); left-aligned as a block, image centred above the text only in a small tile (Carbon); title 16 to 18px/600, body 14px muted, 8 to 16px between lines (conventions); skeleton shapes match final layout and height (Primer).
States:
- Empty: replaces the region, headers and footers too (Carbon).
- Loading: skeleton for tables, cards, lists on page loads; spinner for one module or an action in progress (Carbon, NN/g). Spinners honor reduced motion. Never a skeleton for toasts, overflow menus, dropdown items or the modal itself (Carbon).
- Error: specific cause, fix, retry; keep user data.
- Partial: loaded part plus inline notice.
- Action: hover and focus-visible like any button.
Avoid:
- Blank regions with no status (NN/g).
- "No results" flashing before load ends (NN/g).
- Jokes in error copy (Carbon).
- Dead ends without a next step (Carbon).
Sources:
- Carbon, Empty states pattern. https://carbondesignsystem.com/patterns/empty-states-pattern/ . Fetched 2026-10-24, no page date. High reliability. Opinion.
- Carbon, Loading pattern. https://carbondesignsystem.com/patterns/loading-pattern/ . No date. High. Opinion: skeleton vs indicator.
- Primer, Loading. https://primer.style/product/ui-patterns/loading/ . No date. High. Data: 1/3/10s.
- NN/g, Skeleton Screens 101. https://www.nngroup.com/articles/skeleton-screens/ . Jun 4, 2023. High. Data: under 1s neither, spinner for a single module, skeleton under 10s.
- NN/g, Response Times. https://www.nngroup.com/articles/response-times-3-important-limits/ . Date not shown on fetched page. High. Data: 0.1/1/10s.
- NN/g, Designing Empty States in Complex Applications. https://www.nngroup.com/articles/empty-state-interface-design/ . Sep 19, 2021. High. Opinion.
- Atlassian, Empty state. https://atlassian.design/components/empty-state/usage . No date. High. Data: 464/304px.
