# Dropdown and select
Use when: the user picks one value from a known list. A menu of actions is a different control.
Anatomy: label → trigger showing the value → option list → helper or error text.
Content limits:
- 2 options: radios (Carbon). 3 to 5 (convention): radios or a segmented control; GOV.UK treats select as a last resort.
- Longer: dropdown; very long or open-ended: combo box with search (Carbon gives no number).
- Option text 1 line (Carbon). Label always visible, never a placeholder. No pre-selected answer to a question (GOV.UK).
Measures (Carbon): trigger 40px; items 40px; scroll from the 6th option and show 50% of the last visible one; width follows the trigger.
Semantics (APG select-only combobox): trigger role="combobox" with aria-expanded and aria-controls; list role="listbox" of role="option". Not a menu: menuitemradio is the wrong role for a value. aria-required and aria-invalid go on the combobox, never on a plain button. DOM focus stays on the trigger and aria-activedescendant names the highlighted option (the APG model), so Esc, Tab and closing need no focus juggling. Inside forms keep a hidden native select that mirrors the value so name, required, reset and autofill work; an invalid required one focuses its trigger.
Scrolling: the popup never locks the page. Wheel or touch over the page scrolls the page; the popup follows its trigger (flips above when there is no room) and closes when the trigger leaves the viewport; over the list the wheel scrolls the list and stops at its ends (overscroll contain). Only a modal dialog locks scroll. Same for action menus and popovers: Radix DropdownMenu modal={false}, Popover non modal, hideWhenDetached. Radix Select cannot do this (no switch, it also makes the page inert), so the kit builds the select-only combobox on a non modal Popover.
Keys (APG): Enter, Space, Down or Up open on the selected option; arrows, Home, End move (no wrap); letters jump, also when closed; Enter or Space picks; Esc closes without changing; Tab picks the highlighted option and moves on; letters on the closed trigger change the value without opening. A click outside closes and still reaches what it hit.
States:
- Rest, hover (border darkens), focus-visible 2px ring, open (chevron flips; flips above if no space), selected shows a check.
- Disabled: faded (0.38), reason in helper text. Read-only: a different state, not a faded one: filled surface, border, value at full contrast, a muted lock mark, no chevron, no hover, no popup, still focusable and copyable (forced colors: dashed border).
- Press: no scale on the trigger (the popup opening is the feedback; a squeeze at the same instant read as a glitch, and it only showed on some opens).
- Loading or empty: one disabled option with the text, plus a polite live region (Carbon forbids skeletons here).
- Error: red border, icon, message.
Motion: direct tier, about 0.2s in, 0.1s out, no bounce, no per-item stagger (author decision). Reduced motion: fade only.
Avoid: native styling that ignores the identity; a dropdown for 2 options; lists taller than the viewport.
Sources:
- W3C APG, Select-Only Combobox example. https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/ . Fetched 2026-10-25, no page date. High reliability. Data: roles, keys.
- Radix, Select. https://www.radix-ui.com/primitives/docs/components/select . Fetched 2026-10-25, no page date. Medium. Data: hidden native select, name, required, popper.
- Radix, primitives issue 1159 (react-remove-scroll cannot be switched off). https://github.com/radix-ui/primitives/issues/1159 . Fetched 2026-10-25. Medium. Data: Select always locks.
- MUI, Modal API (disableScrollLock default false) https://mui.com/material-ui/api/modal/ and Headless UI, Listbox (modal prop defaults true) https://headlessui.com/react/listbox . Fetched 2026-10-25. High. Data: the big libraries lock by default and offer an opt out; the kit opts out on purpose (author decision). No Apple, Material 3 or GOV.UK guidance on scroll lock for pickers was found.
- Carbon, Dropdown usage. https://carbondesignsystem.com/components/dropdown/usage/ . Fetched 2026-10-24, no page date. High. Data: heights, 6th option, 50%.
- GOV.UK, Select. https://design-system.service.gov.uk/components/select/ . No date. High. Opinion.
