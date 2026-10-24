# Modal and confirmation
Use when: a short, infrequent task or decision blocks the flow. For routine news use inline or toast; for long forms use a page (Carbon, Primer).
Anatomy: title (verb phrase) → 1 to 3 lines of body or a small form → footer buttons → close (X).
Content limits:
- Title: short verb phrase naming the object ("Delete project").
- Body up to 3 lines (Atlassian example): what is lost, and whether undo exists.
- Form inside: under 5 inputs (Carbon). If it scrolls much, go up one size, then to a page (Carbon).
- Nested modals: 2 max (Primer).
- Confirm only serious or irreversible actions; routine prompts train users to click through (NN/g).
Actions: footer right-aligned, primary rightmost, Cancel left of it; 2 buttons normal, 3 rare, one primary (Carbon, Atlassian). Labels name outcomes ("Delete file" / "Keep file"), never Yes/No (NN/g). Destructive: danger button replaces primary, initial focus on Cancel (NN/g: no default Yes). Prefer undo over asking.
Measures: widths about 400 / 480 / 640px small / default / large (supuesto); safe area 16px, close button 8px from edges (Primer); body about 80% width (Carbon); footer buttons 40px; padding 24px (supuesto).
States:
- Open: focus to first input, else primary; focus trapped (Carbon).
- Focus-visible rings throughout.
- Loading: spinner in primary, modal stays open.
- Error: message above footer, entries kept.
- Dismiss: Esc, X, outside click; outside click off with unsaved entries (Primer); focus returns to trigger.
Avoid:
- Opening on page load.
- "Are you sure?" with OK/Cancel.
- Navigation or whole pages inside (Primer).
- Two filled buttons.
- Confirming what undo can cover.
Sources:
- Carbon, Modal usage. https://carbondesignsystem.com/components/modal/usage/ . No date. alta (maintained system). dato (layout), opinión.
- NN/g, Confirmation Dialogs Can Prevent User Errors. https://www.nngroup.com/articles/confirmation-dialog/ . Feb 18, 2018; reviewed Aug 2026. alta. opinión.
- Primer, Dialog guidelines. https://primer.style/product/components/dialog/guidelines/ . No date. alta. dato (16px, 8px, 2 nested).
