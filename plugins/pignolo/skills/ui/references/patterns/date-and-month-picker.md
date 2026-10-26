# Date and month picker
Use when: the user enters a date, a month or a range (a stay, a period). A calendar suits dates near today, typing suits far ones: offer both.
Anatomy: floating label inside the field → typed field with the calendar button inside the same box → format hint → popover calendar → error. Month picker: `<  [Octubre 2026 v]  >` plus the same popover.
Header: `<  [March] [2026]  >`, month and year as two buttons. The month opens a 3 x 4 month grid, the year a 12 year grid per decade with decade arrows. The grid replaces the body (no popup in a popup, same height). Not two long dropdowns, not steppers alone (1900 is about 1500 clicks).
Typing (es-AR, day month year): `5/3/26`, `05.03.2026`, `5 mar 2026`, `2026-03-05`; months `3/26`, `mar 2026`. Any separator, accents and dots ignored, "sep" and "sept" both work. Two digit years use a fixed base (20xx, configurable). Ambiguous or impossible input (31/4, 29/2 in a common year) shows an error, never a guess. Validate min and max while typing.
Content limits:
- Hint: one example, "For example, 27 3 2007" (GOV.UK), as visible text, never only a placeholder (Carbon).
- Within about a year, or a range: calendar, one month at a time (Carbon, NN/g). Far known dates: typed fields.
Actions: no primary button; closes on choosing a date (Carbon). "Today" or "This month" button in the panel, right under the grid.
Opening: the whole field is one control. A click or tap anywhere on it opens the calendar and leaves the caret in the input; typing keeps working while it is open; ArrowDown or Alt+ArrowDown opens it, ArrowDown again enters the grid; Esc closes and returns focus to where it was. One hover state for the box and the calendar button together. On touch the field opens the sheet (no keyboard) and the sheet carries its own typed field.
Keys (APG, days): arrows a day or week; Home and End the week; PageUp and PageDown a month, Shift a year; a shorter month clamps to its last day; Enter picks; Esc closes and returns focus. Month grid: PageUp and PageDown a year. Year grid: a decade (inference, no APG source).
Measures: day cells 40px, 44px on touch (WCAG 2.5.5); fixed calendar width (Carbon). Always 6 week rows: days of the neighbour months fill them (muted, pickable), so the Today button is 8px under the grid in every month and the month and year grids take the same body height (the panel never resizes). On touch, the same panel in a bottom sheet, not a wheel; the sheet is 520px wide at most, centered, the panel fills it with 48px cells and 16px numbers (a 280px strip in a wide sheet looks tiny in a desktop browser).
Scroll: the popover is non-modal (no scroll lock), follows its field when the page scrolls and hides when the field leaves the viewport; only the sheet, a dialog, locks the page.
States:
- Today outlined, selected filled, out of range disabled but focusable (Atlassian), focus-visible 2px ring.
- Month in an aria-live polite region; the focused day reads its full date.
- Error says what is wrong (GOV.UK).
Range (DateRangePicker): two typed fields (start, end), first click sets the start, second the end and closes. A continuous band between the ends with solid ends and rounded outer caps, broken with rounded caps at the end of each week row; hovering or focusing a day before the second pick previews the band (lighter, outlined end). A click before the start moves the start; `minNights` disables the days too close; min and max keep days focusable. Two months side by side from 768px, one on narrow screens and in the sheet. Start typed after the end moves the end out; an end before the start is an error. Hidden inputs `name-start` and `name-end` (ISO). Band colors from tokens; forced colors: ends Highlight, band Mark, preview dashed. Not built: Shift+arrows to extend, a single field that types both dates, a month range.
Avoid: native date inputs; split day, month, year dropdowns (NN/g); auto-tabbing (GOV.UK); local midnight in code (count days as numbers).
Sources:
- NN/g, Date-Input Form Fields. https://www.nngroup.com/articles/date-input/ . Jan 22, 2017. High. Opinion: always allow typing.
- W3C APG, Date Picker Dialog. https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/ . No date. High. Data: key map.
- GOV.UK, Date input. https://design-system.service.gov.uk/components/date-input/ . No page date. High (user research). Data: messages.
- Carbon, Date picker usage. https://carbondesignsystem.com/components/date-picker/usage/ . No date. High. Data: heights, format hint.
- Atlassian, Datetime picker. https://atlassian.design/components/datetime-picker/examples . No date. Medium. Data: disabled dates stay focusable.
- Author hands-on feedback, 2026-10-25: sheet size on desktop, dead space above Today, whole-field hover and click to open, the range band (travel and lodging calendars). Data: the rules above under Measures, Opening and Range.
- Controller research, 2026-10-25. Confidence 75 header and grids, 60 parsing, 40 grid keys and year pivot (inference).
