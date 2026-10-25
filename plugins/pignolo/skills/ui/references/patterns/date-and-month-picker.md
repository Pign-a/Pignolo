# Date and month picker
Use when: the user enters a date, a month or a range. A calendar suits dates near today, typing suits far ones: offer both.
Anatomy: label → typed field with the calendar button inside → format hint → popover calendar → error. Month picker: `<  [Octubre 2026 v]  >` plus the same popover.
Header: `<  [March] [2026]  >`, month and year as two buttons. The month opens a 3 x 4 month grid, the year a 12 year grid per decade with decade arrows. The grid replaces the body (no popup in a popup, same height). Not two long dropdowns, not steppers alone (1900 is about 1500 clicks).
Typing (es-AR, day month year): `5/3/26`, `05.03.2026`, `5 mar 2026`, `2026-03-05`; months `3/26`, `mar 2026`. Any separator, accents and dots ignored, "sep" and "sept" both work. Two digit years use a fixed base (20xx, configurable). Ambiguous or impossible input (31/4, 29/2 in a common year) shows an error, never a guess. Validate min and max while typing.
Content limits:
- Hint: one example, "For example, 27 3 2007" (GOV.UK), as visible text, never only a placeholder (Carbon).
- Within about a year, or a range: calendar, one month at a time (Carbon, NN/g). Far known dates: typed fields.
Actions: no primary button; closes on choosing a date (Carbon). "Today" or "This month" button in the panel.
Keys (APG, days): arrows a day or week; Home and End the week; PageUp and PageDown a month, Shift a year; a shorter month clamps to its last day; Enter picks; Esc closes and returns focus. Month grid: PageUp and PageDown a year. Year grid: a decade (inference, no APG source).
Measures: day cells 40px, 44px on touch (WCAG 2.5.5); fixed calendar width (Carbon). On touch, the same panel in a bottom sheet, not a wheel.
States:
- Today outlined, selected filled, out of range disabled but focusable (Atlassian), focus-visible 2px ring.
- Month in an aria-live polite region; the focused day reads its full date.
- Error says what is wrong (GOV.UK).
Avoid: native date inputs; split day, month, year dropdowns (NN/g); auto-tabbing (GOV.UK); local midnight in code (count days as numbers).
Sources:
- NN/g, Date-Input Form Fields. https://www.nngroup.com/articles/date-input/ . Jan 22, 2017. High. Opinion: always allow typing.
- W3C APG, Date Picker Dialog. https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/ . No date. High. Data: key map.
- GOV.UK, Date input. https://design-system.service.gov.uk/components/date-input/ . No page date. High (user research). Data: messages.
- Carbon, Date picker usage. https://carbondesignsystem.com/components/date-picker/usage/ . No date. High. Data: heights, format hint.
- Atlassian, Datetime picker. https://atlassian.design/components/datetime-picker/examples . No date. Medium. Data: disabled dates stay focusable.
- Controller research, 2026-10-25. Confidence 75 header and grids, 60 parsing, 40 grid keys and year pivot (inference).
