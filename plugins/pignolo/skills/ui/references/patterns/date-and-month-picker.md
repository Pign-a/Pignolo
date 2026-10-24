# Date and month picker
Use when: the user enters a date, a month or a range. Typed fields for known or distant dates; calendar for near dates and ranges.
Anatomy: label → hint with format example → text field(s) → calendar button (optional) → popover calendar → error text.
Content limits:
- Known or far dates (birthday): three typed fields day / month / year (GOV.UK, NN/g).
- Within about a year, or a range: calendar popover, one month shown, two for ranges (Carbon, NN/g).
- Month and year only: two fields, or a 3 x 4 month grid with year stepper (grid is supuesto).
- Always allow typing (NN/g). Accept "3", "03", "mar", "march" and any separator (GOV.UK, NN/g).
- Hint: one example, "For example, 27 3 2007".
Actions: the picker has no primary button; the calendar closes on choosing a date (range: on the second click) (Carbon). Quick ranges ("Last 30 days") only for ranges, max 5 (supuesto).
Measures: day and month fields 2 digits wide, year 4 (GOV.UK); field height 40px, 32 compact, 48 airy (Carbon); calendar day cells 40px, 44px on touch (supuesto; WCAG 2.5.5); calendar width fixed, independent of input (Carbon).
States:
- Rest, hover.
- Focus-visible: ring on field and day.
- Today: outlined; selected: filled; in range: tint.
- Out of range: disabled, explained in hint (Carbon).
- Esc closes, focus returns.
- Error: say what is wrong ("Year must include 4 numbers") (GOV.UK).
Avoid:
- Native date inputs.
- Split day/month/year dropdowns (NN/g).
- Auto-tabbing between fields (GOV.UK).
- Format only in the placeholder (Carbon).
- Shifting visible range between related fields (NN/g).
Sources:
- GOV.UK, Date input. https://design-system.service.gov.uk/components/date-input/ . v6.4.0, Jul 2026. alta (user research). dato (widths), opinión.
- Carbon, Date picker usage. https://carbondesignsystem.com/components/date-picker/usage/ . No date. alta. dato (heights).
- NN/g, Date-Input Form Fields. https://www.nngroup.com/articles/date-input/ . Jan 22, 2017. alta. opinión.
