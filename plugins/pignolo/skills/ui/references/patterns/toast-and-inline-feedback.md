# Toast and inline feedback
Use when: the system must say what just happened or what needs attention. Pick the channel by where the news belongs.
Anatomy: status icon → title or one sentence → optional single action → close button.
Content limits:
- Toast max 2 lines, success auto-dismiss around 5s; longer means "View more" (Carbon).
- Body 1 to 2 short sentences; action label 1 to 2 words; 1 action (Carbon) or 2 links (Atlassian).
- Errors and warnings never auto-dismiss (Atlassian).
- One banner per page, before the title (GOV.UK, Atlassian).
Channel: change in place without reload = inline message next to it; page reloaded = banner; background action confirmed = toast; validation error = inline plus summary (Primer, GOV.UK). In forms, inline notices go above the buttons (Carbon). Prefer Undo in the toast to a confirm dialog.
Actions: one optional action, link or tertiary style, never filled.
Measures: stack gap 8px (Carbon); toast width about 320 to 400px (supuesto), bottom-left (Atlassian) or top-right (Carbon); padding 12 to 16px; text 14px, title 14px/600; icon 16 to 20px; close target 24px floor, 44px on touch; inline messages match content width (GOV.UK).
States:
- Enter/exit: fade plus 8px slide, under 200ms (supuesto); respect reduced motion.
- Hover pauses auto-dismiss.
- Focus-visible on action and close.
- Types: success, info, warning, error: icon plus colour plus words.
- Loading toast resolves into success or error in place.
- Stacked: newest on top; never mix dismissible and persistent (Atlassian).
Avoid:
- Toasts for validation errors.
- Several banners.
- Colour as the only status cue (GOV.UK).
- A toast on every save.
- Covering the primary button.
Sources:
- Carbon, Notification usage. https://carbondesignsystem.com/components/notification/usage/ . No date. alta (maintained system). dato (5s, 2 lines).
- Atlassian, Flag usage. https://atlassian.design/components/flag/usage . No date. alta. dato (2 links).
- GOV.UK, Notification banner. https://design-system.service.gov.uk/components/notification-banner/ . No date. alta (user-tested). opinión.
- Primer, Saving. https://primer.style/product/ui-patterns/saving/ . No date. alta. opinión.
