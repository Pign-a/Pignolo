# Kit component checklist

A component is done when all hold:

- Keyboard operable; Radix semantics kept.
- Focus-visible ring from tokens (`.kit-focus`).
- Rest, hover, active and disabled states exist.
- Tier named in the header comment.
- Reduced motion honored (cross-fade, no travel).
- Exit faster than enter; interruptible by spamming.
- Only transform and opacity animate; no `transition: all`.
- No hardcoded colors; no em dashes in any text.
- No pill shapes, except status tags and removable chips.
- Copy comes from props, in the app's language.
- A preview page and an interaction test in the sandbox.
