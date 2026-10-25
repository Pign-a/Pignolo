# Dropdown and select
Use when: the user picks one value from a known list. A menu of actions is a different control.
Anatomy: label → trigger showing the value → option list → helper or error text.
Content limits:
- 2 options: radios (Carbon). 3 to 5 (convention): radios or a segmented control; GOV.UK treats select as a last resort.
- Longer: dropdown; very long or open-ended: combo box with search (Carbon gives no number).
- Option text 1 line (Carbon). Label always visible, never a placeholder. No pre-selected answer to a question (GOV.UK).
Measures (Carbon): trigger 40px; items 40px; scroll from the 6th option and show 50% of the last visible one; width follows the trigger.
Semantics (APG select-only combobox): trigger role="combobox" with aria-expanded and aria-controls; list role="listbox" of role="option". Not a menu: menuitemradio is the wrong role for a value. aria-required and aria-invalid go on the combobox, never on a plain button. Inside forms use a native select (Radix Select renders one) so name, required, reset and autofill work.
Keys (APG): Enter, Space, Down or Up open on the selected option; arrows, Home, End move (no wrap); letters jump, also when closed; Enter or Space picks; Esc closes without changing; Tab picks the focused option and moves on.
States:
- Rest, hover (border darkens), focus-visible 2px ring, open (chevron flips; flips above if no space), selected shows a check.
- Disabled: muted, reason in helper text. Read-only: text, no chevron.
- Loading or empty: one disabled option with the text, plus a polite live region (Carbon forbids skeletons here).
- Error: red border, icon, message.
Motion: direct tier, about 0.2s in, 0.1s out, no bounce, no per-item stagger (author decision). Reduced motion: fade only.
Avoid: native styling that ignores the identity; a dropdown for 2 options; lists taller than the viewport.
Sources:
- W3C APG, Select-Only Combobox example. https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/ . Fetched 2026-10-25, no page date. High reliability. Data: roles, keys.
- Radix, Select. https://www.radix-ui.com/primitives/docs/components/select . Fetched 2026-10-25, no page date. Medium. Data: hidden native select, name, required, popper.
- Carbon, Dropdown usage. https://carbondesignsystem.com/components/dropdown/usage/ . Fetched 2026-10-24, no page date. High. Data: heights, 6th option, 50%.
- GOV.UK, Select. https://design-system.service.gov.uk/components/select/ . No date. High. Opinion.
