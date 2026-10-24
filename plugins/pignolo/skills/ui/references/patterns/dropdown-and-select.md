# Dropdown and select
Use when: the user picks one or several values from a known list. A menu of actions is a different control (Radix).
Anatomy: label → trigger showing the value → option menu → helper or error text.
Content limits:
- 2 options: radios, not a dropdown (Carbon).
- 3 to 5 (convention): radios or a segmented control; GOV.UK treats select as a last resort.
- Longer: dropdown; very long or open-ended: combo box with search (Carbon gives no number; "about 15" is a convention).
- Option text 1 line, ellipsis plus tooltip (Carbon). Label always visible, never a placeholder.
- No pre-selected answer to a question (GOV.UK). Order by expected use or alphabetically.
Actions: the control is not an action; the form's primary button submits. Multiselect keeps the menu open, with a tag showing the selected count (Carbon). Avoid an "All" parent in filters where all and none mean the same (Carbon).
Measures (Carbon): trigger 24/32/40/48px, 40px default; menu items 40px by default; start scrolling at the 6th option and show 50% of the last visible one; menu shadow 0 2px 6px rgba(0,0,0,.2); width follows the trigger, text 14px (conventions).
States:
- Rest, hover (border darkens).
- Focus-visible: 2px ring on trigger.
- Open: chevron flips; menu flips above if no space.
- Option highlighted; selected shows a check.
- Disabled: muted, reason in helper text. Read-only: text, no chevron.
- Loading: spinner row in menu (Carbon forbids skeletons for dropdown items).
- Error: red border, icon, message.
- Keyboard: arrows, Enter, Esc returns focus to trigger (Radix).
Avoid:
- Native select styling that ignores the identity.
- Dropdown for 2 options.
- Multiple selection in a native select (GOV.UK).
- Menus taller than the viewport.
Sources:
- Carbon, Dropdown usage. https://carbondesignsystem.com/components/dropdown/usage/ . Fetched 2026-10-24, no page date. High reliability. Data: heights, 6th option, 50%, shadow.
- GOV.UK, Select. https://design-system.service.gov.uk/components/select/ . No date. High. Opinion.
- Radix, Dropdown Menu. https://www.radix-ui.com/primitives/docs/components/dropdown-menu . No date. Medium. Data: keyboard.
