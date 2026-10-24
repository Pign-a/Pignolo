# Form
Use when: the user enters or changes data and submits it as one unit.
Anatomy: heading + purpose → error summary (after failed submit) → field groups (label, hint, input, error) → buttons.
Content limits:
- One column; 2 or 3 related fields may share a row (first name, MI, last name) (Carbon).
- Labels 1 to 3 words, sentence case, no colon, always visible (Carbon, Primer). Hint: one short sentence (GOV.UK).
- Dialog: under 5 inputs; side panel: over 5; dedicated page for long or multistep (Carbon).
- Mark only the minority: "(optional)" if most are required (Carbon).
Actions: one primary (verb + object, "Save changes"), at most one secondary (Cancel, ghost) (convention). On pages, left-align under the last field, primary first (Carbon, GOV.UK); in dialogs, panels and wizards, right-align with primary last (Carbon, Primer, Atlassian). Keep submit enabled and explain problems through validation (Atlassian, GOV.UK, Primer; Carbon disables it on short forms); block double submit while saving.
Measures (Carbon): input 40px high; field gap 32px on a page, 24px or 16px in panel or modal; 48px before buttons; section gap one step above field gap (32px with 24px fields, 40px with 32px); text 14px and width by expected content (conventions).
States:
- Rest, hover (border darkens).
- Focus-visible: 2px ring, never removed.
- Filled, disabled (muted but readable), read-only.
- Error: red border, icon, message, same wording in summary (GOV.UK).
- Submitting: spinner in button.
Validation: per field on blur (Carbon) or on submit, then per field once changed and left (Primer). Whole form on submit with a summary (Primer: optional from 3 errors; GOV.UK: always). Keep values after an error.
Avoid:
- Placeholder as label (Primer).
- Browser-native validation bubbles.
- Multi-column just to save space (Carbon).
- Disabled submit without explanation.
Sources:
- Carbon, Forms pattern. https://carbondesignsystem.com/patterns/forms-pattern/ . Fetched 2026-10-24, no page date. High reliability. Data: spacing, 40px, 3 words, 5 inputs.
- Primer, Forms. https://primer.style/product/ui-patterns/forms/ . No date. High. Data: 3 words, 3 errors; opinion.
- GOV.UK, Error message. https://design-system.service.gov.uk/components/error-message/ . No date. High (user-tested). Opinion.
- Carbon, Button usage; Atlassian, Button usage (alignment and disabled): see the button sheet.
