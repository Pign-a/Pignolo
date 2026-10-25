# Modal and confirmation
Use when: a short, infrequent task or decision blocks the flow. For routine news use inline or toast; for long forms use a page (Carbon, Primer).
Anatomy: title (verb phrase) → 1 to 3 lines of body or a small form → footer buttons → close (X).
Content limits:
- Title: short verb phrase naming the object ("Delete project"); the primary button matches it (Atlassian).
- Body: what is lost, and whether undo exists; up to 3 lines (convention).
- Form inside: under 5 inputs (Carbon Forms). Too much scrolling: next size up, then a page (Carbon Modal). Nested modals: 2 max (Primer).
- Confirm only serious or irreversible actions (NN/g).
Actions: footer right-aligned, primary rightmost, Cancel left of it (Primer, Atlassian). 2 buttons normal, one primary (Carbon). Labels name outcomes ("Delete file" / "Keep file"), never Yes/No (NN/g). Destructive: danger button (Carbon); initial focus on Cancel (convention). Prefer undo over asking (NN/g).
Measures: about 400 / 480 / 640px small / default / large (convention). Safe area 16px, close button 8px from edges (Primer); footer buttons 40px, 44px on touch, padding 24px (conventions).
Narrow screens: below 640px or with a coarse pointer show the same dialog as a bottom sheet, buttons stacked full width with the primary first (convention).
Motion (kit): direct tier to enter (0.22s, no bounce, from scale 0.96); a large overlay leaves in 150 to 180ms (convention), so 0.16s. Reduced motion: fade only.
States:
- Open: focus to first input, else primary; focus trapped (Carbon).
- Hover and focus-visible (2px ring) on buttons and X.
- Loading: spinner in primary (pulses under reduced motion), modal stays open.
- Error: message above footer, entries kept.
- Dismiss: Esc, X, outside click (off with unsaved changes, Primer); focus returns to trigger.
Avoid: opening on page load; "Are you sure?" with OK/Cancel; navigation inside (Primer); two filled buttons.
Sources:
- Carbon, Modal usage. https://carbondesignsystem.com/components/modal/usage/ . Fetched 2026-10-24, no page date. High reliability. Data: button layout; opinion.
- NN/g, Confirmation Dialogs Can Prevent User Errors. https://www.nngroup.com/articles/confirmation-dialog/ . Feb 18, 2018. High. Opinion.
- Primer, Dialog guidelines. https://primer.style/product/components/dialog/guidelines/ . No date. High. Data: 16px, 8px, 2 nested.
- Atlassian, Modal dialog usage. https://atlassian.design/components/modal-dialog/usage . No date. High. Opinion: button order.
- Design critic review F19, 2026-10-25. Medium, 55. 150 to 180ms for large overlays is a convention without a measured source.
