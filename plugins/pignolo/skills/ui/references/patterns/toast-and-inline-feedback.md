# Toast and inline feedback
Use when: the system must say what just happened or what needs attention. Pick the channel by where the news belongs.
Anatomy: status icon → title or one sentence → optional single action → close button.
Content limits:
- Toast max 2 lines; Carbon can auto-dismiss after 5s ("coded to"); longer text means a "View more" link (Carbon).
- Body 1 to 2 short sentences, action label 1 to 2 words (conventions); 1 action (Carbon) or max 2 links (Atlassian).
- Errors and warnings never auto-dismiss (Atlassian).
- One banner per page, immediately before the h1 (GOV.UK).
Channel: change in place without reload = inline message next to it; page reloaded or redirected = banner (Primer); validation error = inline plus summary, never a banner (GOV.UK). Background action confirmed = toast (convention; Primer avoids toasts on github.com for accessibility). Inline notices above the buttons in forms (convention). Prefer Undo in the toast to a confirm dialog (NN/g).
Actions: one optional action, link or tertiary style, never filled.
Measures: stack gap 8px (Carbon spacing-03); width about 320 to 400px (convention); bottom-left (Atlassian) or top-right (Carbon); padding 12 to 16px, text 14px, icon 16 to 20px (conventions); close target 24px floor (WCAG 2.5.8), 44px on touch (WCAG 2.5.5).
States:
- Enter/exit: fade plus 8px slide, under 200ms (convention); respect reduced motion.
- Hover pauses auto-dismiss; hover and focus-visible (2px ring) on action and close.
- Types: success, info, warning, error: icon plus colour plus words (GOV.UK).
- Loading toast resolves into success or error in place.
- Stacked: newest on top; never mix dismissible and persistent (Atlassian).
Avoid:
- Toasts for validation errors.
- Several banners (GOV.UK).
- Colour as the only status cue (GOV.UK).
- A toast on every save.
- Covering the primary button.
Sources:
- Carbon, Notification usage. https://carbondesignsystem.com/components/notification/usage/ . Fetched 2026-10-24, no page date. High reliability. Data: 5s, 2 lines, 1 action, top-right.
- Atlassian, Flag usage. https://atlassian.design/components/flag/usage . No date. High. Data: 2 links, bottom-left, persistence.
- GOV.UK, Notification banner. https://design-system.service.gov.uk/components/notification-banner/ . No date. High (user-tested). Opinion.
- Primer, Saving. https://primer.style/product/ui-patterns/saving/ . No date. High. Opinion: inline message vs banner.
- NN/g, Confirmation Dialogs Can Prevent User Errors. https://www.nngroup.com/articles/confirmation-dialog/ . Feb 18, 2018. High. Opinion: undo.
