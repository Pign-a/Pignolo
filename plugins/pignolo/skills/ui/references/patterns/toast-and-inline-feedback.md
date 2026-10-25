# Toast and inline feedback
Use when: the system must say what just happened or what needs attention. Pick the channel by where the news belongs.
Anatomy: status icon → title or one sentence → optional single action → close button.
Content limits:
- Toast max 2 lines; Carbon can auto-dismiss after 5s; longer text means a "View more" link (Carbon). 1 action (Carbon).
- Errors and warnings never auto-dismiss (Atlassian). A toast whose action is the only way back (Undo) lasts 10s or more, or stays (WCAG 2.2.1).
- One banner per page, immediately before the h1 (GOV.UK).
Channel: change in place = inline message; page reloaded or redirected = banner (Primer); validation error = inline plus summary, never a banner (GOV.UK). Background action confirmed = toast (convention). Prefer Undo in the toast to a confirm dialog (NN/g).
Actions: one optional action, link or tertiary style, never filled. Show its hotkey (Alt+Z); F8 focuses the newest toast.
Measures: stack gap 8px (Carbon); width 320 to 400px; padding 12 to 16px, text 14px, icon 16 to 20px (conventions); close target 24px floor (WCAG 2.5.8), 44px on touch.
Placement and motion (kit, the author's blind vote): bottom-right, newest nearest the edge it enters from. Enter rises 28px with a spring (0.35s, bounce 0.2), exit 10px in 0.13s, others reflow in under 300ms. Carbon sits top-right and Atlassian bottom-left; the kit keeps the vote. Reduced motion: fade only.
States:
- Hover, focus inside and a blurred window pause every timer; focus-visible ring on action and close.
- Types: success, info, warning, error, loading: icon plus colour plus words (GOV.UK). Loading resolves in place.
- Announce through live regions that exist before the text: polite for most, alert for errors and warnings.
- Over the max, drop the oldest auto-dismissing toast; never expel an error or an action toast unseen.
Avoid: toasts for validation errors; colour as the only cue; a toast on every save; covering the primary button.
Sources:
- Carbon, Notification usage. https://carbondesignsystem.com/components/notification/usage/ . Fetched 2026-10-24, no page date. High reliability. Data: 5s, 2 lines, 1 action, top-right.
- Atlassian, Flag usage. https://atlassian.design/components/flag/usage . No date. High. Data: bottom-left, persistence.
- W3C, WCAG 2.2 Timing Adjustable (2.2.1). https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html . Not re-fetched this session. High. Rule: a time limit can be turned off, adjusted or extended.
- GOV.UK, Notification banner. https://design-system.service.gov.uk/components/notification-banner/ . No date. High (user-tested). Opinion.
- Primer, Saving. https://primer.style/product/ui-patterns/saving/ . No date. High. Opinion: inline vs banner.
- NN/g, Confirmation Dialogs Can Prevent User Errors. https://www.nngroup.com/articles/confirmation-dialog/ . Feb 18, 2018. High. Opinion: undo.
