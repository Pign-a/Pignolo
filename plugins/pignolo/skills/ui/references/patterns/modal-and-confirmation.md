# Modal and confirmation
Use when: a short, infrequent task or decision blocks the flow. For routine news use inline or toast; for long forms use a page (Carbon, Primer).
Anatomy: title (verb phrase) → 1 to 3 lines of body or a small form → footer buttons → close (X).
Content limits:
- Title: short verb phrase naming the object ("Delete project"); the primary button matches it (Atlassian).
- Body: what is lost, and whether undo exists; up to 3 lines (convention).
- Form inside: under 5 inputs (Carbon Forms). Too much scrolling: next size up, then a page (Carbon Modal).
- Nested modals: 2 max (Primer).
- Confirm only serious or irreversible actions; routine prompts train users to click through (NN/g).
Actions: footer right-aligned, primary rightmost, Cancel left of it (Primer, Atlassian; Carbon splits two buttons 50/50 full bleed). 2 buttons normal, 3 rare, one primary (Carbon). Labels name outcomes ("Delete file" / "Keep file"), never Yes/No (NN/g). Destructive: danger button replaces primary (Carbon); initial focus on Cancel is a convention (NN/g: no default Yes). Prefer undo over asking (NN/g).
Measures: Carbon gives sizes (xs to l) but no px; about 400 / 480 / 640px small / default / large is a convention. Safe area 16px, close button 8px from edges (Primer); body text 80% of width (Carbon); footer buttons 40px, padding 24px (conventions).
States:
- Open: focus to first input, else primary; focus trapped (Carbon).
- Hover and focus-visible (2px ring) on buttons and X.
- Loading: spinner in primary, modal stays open.
- Error: message above footer, entries kept.
- Dismiss: Esc, X, outside click (off with unsaved form changes, Primer); focus returns to trigger.
Avoid:
- Opening on page load.
- "Are you sure?" with OK/Cancel.
- Navigation or whole pages inside (Primer: no side navigation).
- Two filled buttons.
Sources:
- Carbon, Modal usage. https://carbondesignsystem.com/components/modal/usage/ . Fetched 2026-10-24, no page date. High reliability. Data: 80%, button layout; opinion.
- NN/g, Confirmation Dialogs Can Prevent User Errors. https://www.nngroup.com/articles/confirmation-dialog/ . Feb 18, 2018. High. Opinion.
- Primer, Dialog guidelines. https://primer.style/product/components/dialog/guidelines/ . No date. High. Data: 16px, 8px, 2 nested.
- Atlassian, Modal dialog usage. https://atlassian.design/components/modal-dialog/usage . No date. High. Opinion: button order.
