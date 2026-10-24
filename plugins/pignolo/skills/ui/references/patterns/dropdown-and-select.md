# Dropdown and select
Use when: the user picks one or several values from a known list. A menu of actions is a different control (Radix).
Anatomy: label → trigger showing the value → option menu → helper or error text.
Content limits:
- 2 options: radios or a switch, not a dropdown (Carbon).
- 3 to 5: radios or segmented control (supuesto; GOV.UK treats select as a last resort).
- 6 to about 15: dropdown. More: combo box with search (Carbon; the 15 is supuesto).
- Option text 1 line, ellipsis plus tooltip (Carbon). Label always visible, never a placeholder.
- No pre-selected answer to a question (GOV.UK). Order by expected use or alphabetically.
- Hick's law: more choices, slower decisions.
Actions: the control is not an action; the form's primary button submits. Multiselect keeps the menu open while choosing, with a count tag that clears all (Carbon). Avoid an "All" parent in filters where all and none mean the same (Carbon).
Measures (Carbon): trigger 24/32/40/48px, 40px default; each option as tall as the field; show about half of the last visible option; scroll from roughly the 6th option; soft menu shadow; width at least the trigger; text 14px.
States:
- Rest, hover (border darkens).
- Focus-visible: 2px ring on trigger.
- Open: chevron flips; menu flips above if no space.
- Option highlighted; selected shows a check.
- Disabled: muted, reason in helper text.
- Read-only: text, no chevron.
- Loading: skeleton in menu.
- Error: red border, icon, message.
- Keyboard: arrows, Enter, Esc returns focus, type-ahead.
Avoid:
- Native select styling that ignores the identity.
- Dropdown for 2 options.
- Multiple selection in a native select (GOV.UK).
- Menus taller than the viewport.
Sources:
- Carbon, Dropdown usage. https://carbondesignsystem.com/components/dropdown/usage/ . No date. alta (maintained system). dato (heights, 6th option).
- GOV.UK, Select. https://design-system.service.gov.uk/components/select/ . No date. alta (user research). opinión.
- Radix, Dropdown Menu. https://www.radix-ui.com/primitives/docs/components/dropdown-menu . No date. media. dato (keyboard).
