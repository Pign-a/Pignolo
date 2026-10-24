# Empty, loading and error states
Use when: a region has no data yet, is waiting, or failed. Design all three before the happy path.
Anatomy: optional graphic → title → one-line explanation of the next step → one action → optional help link.
Content limits:
- Title 1 line, positive ("Start by adding a client"); body 1 to 2 sentences, no codes or jargon (Carbon, Primer).
- One primary action; errors add at most a text link (Primer).
- Illustration optional and decorative (empty alt); skip in small spaces (Carbon).
- Wait under 1s: show nothing; 1 to 3s: indeterminate; 3 to 10s: determinate if possible; over 10s: determinate plus background work (Primer; NN/g 0.1/1/10s).
Actions: empty = create or import (primary); filtered-empty = "Clear filters"; error = Retry plus help; no permission = request access. Several empty regions on screen: tertiary buttons (Carbon).
Measures: text block about 464px wide, 304px in narrow containers (Atlassian); centred in large regions, left-aligned in tiles and panels (Carbon); title 16 to 18px/600, body 14px muted; 8 to 16px between lines; skeleton shapes match final layout and height (Primer).
States:
- Empty: replaces the region, headers and footers too (Carbon).
- Loading: skeleton for tables, cards, lists; spinner for one component or button; never on toasts, menus, modals (Carbon).
- Error: specific cause, fix, retry; keep user data.
- Partial: loaded part plus inline notice.
- Focus-visible on the action.
Avoid:
- Blank regions with no status (NN/g).
- "No results" flashing before load ends (NN/g).
- Jokes in error copy.
- Dead ends without a next step.
Sources:
- Carbon, Empty states pattern. https://carbondesignsystem.com/patterns/empty-states-pattern/ . No date. alta (maintained system). opinión.
- Primer, Loading. https://primer.style/product/ui-patterns/loading/ . No date. alta. dato (1/3/10s).
- NN/g, Designing Empty States in Complex Applications. https://www.nngroup.com/articles/empty-state-interface-design/ . Sep 19, 2021. alta. opinión.
- Atlassian, Empty state. https://atlassian.design/components/empty-state/usage . No date. alta. dato (464/304px).
