# Date and month picker
Use when: the user enters a date, a month or a range. Typed fields for known or distant dates; calendar for near dates and ranges.
Anatomy: label → hint with format example → text field(s) → calendar button (optional) → popover calendar → error text.
Content limits:
- Known or far dates (birthday): three typed fields day / month / year (GOV.UK, NN/g).
- Within about a year, or a range: calendar popover, one month at a time (Carbon, NN/g).
- Month and year only: two fields, or a 3 x 4 month grid with year stepper (grid is a convention).
- Always allow typing (NN/g). Accept "3", "03", "mar", "march" and any separator (GOV.UK, NN/g).
- Hint: one example, "For example, 27 3 2007" (GOV.UK).
Actions: the picker has no primary button; the calendar closes on choosing a single date or the range end (Carbon). Quick ranges ("Last 30 days") only for ranges, max 5 (convention).
Measures: day and month fields 2 characters wide, year 4 (GOV.UK); field height 32/40/48px, 40 default (Carbon); calendar day cells 40px, 44px on touch (convention; WCAG 2.5.5 for touch); calendar width fixed, independent of input (Carbon).
States:
- Rest, hover.
- Focus-visible: 2px ring on field and day.
- Today: outlined; selected: filled; in range: tint.
- Out of range: disabled, explained in hint (Carbon).
- Esc closes (Carbon), focus returns to the field.
- Error: say what is wrong ("Year must include 4 numbers") (GOV.UK).
Avoid:
- Native date inputs.
- Split day/month/year dropdowns (NN/g).
- Auto-tabbing between fields (GOV.UK).
- Format only in the placeholder (Carbon).
- Shifting visible range between related fields (NN/g).
Sources:
- GOV.UK, Date input. https://design-system.service.gov.uk/components/date-input/ . No page date. High reliability (user research). Data: widths, messages; opinion.
- Carbon, Date picker usage. https://carbondesignsystem.com/components/date-picker/usage/ . No date. High. Data: heights, closing behavior.
- NN/g, Date-Input Form Fields. https://www.nngroup.com/articles/date-input/ . Jan 22, 2017. High. Opinion: calendar for under a year.
