# Form
Use when: the user enters or changes data and submits it as one unit.
Anatomy: heading + purpose → error summary (after failed submit) → field groups (label, hint, input, error) → buttons.
Content limits:
- One column; 2 or 3 related fields may share a row (city, state, ZIP) (Carbon).
- Labels 1 to 3 words, sentence case, no colon, always visible (Carbon, Primer). Hint: one short sentence.
- Dialog: under 5 inputs; side panel: over 5; dedicated page for long or multistep (Carbon).
- Mark only the minority: "(optional)" if most are required (Carbon).
Actions: one primary (verb + object, "Save changes"), at most one secondary (Cancel, ghost). On pages, left-align under the last field; in dialogs and panels, right-align with primary last (Carbon, Primer). Keep submit enabled on long forms; block double submit while saving.
Measures (Carbon): input 40px high; field gap 32px on a page, 24px in panel or modal, 16px tight; about 48px before buttons; section gap one step above field gap; width follows expected content; text 14px.
States:
- Rest, hover (border darkens).
- Focus-visible: 2px ring, never removed.
- Filled.
- Disabled: muted but readable.
- Read-only.
- Error: red border, icon, message, same wording in summary.
- Submitting: spinner in button.
Validation: per field on blur once touched (Carbon); whole form on submit with a summary (Primer: from 3 errors; GOV.UK: always). Keep values after an error.
Avoid:
- Placeholder as label.
- Browser-native validation bubbles.
- Multi-column just to save space.
- Disabled submit without explanation.
- Native date or select widgets.
Sources:
- Carbon, Forms pattern. https://carbondesignsystem.com/patterns/forms-pattern/ . No date. alta. dato (spacing, heights).
- Primer, Forms. https://primer.style/product/ui-patterns/forms/ . No date. alta. dato (3 words, 3 errors).
- GOV.UK, Error message. https://design-system.service.gov.uk/components/error-message/ . No date. alta (user-tested). opinión.
