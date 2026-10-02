// What counts as "a control" in a CSS selector, shared by the static rules that only judge
// controls (MOTION-05, MOTION-06, STRESS-04). A selector is a control when any of its
// comma-separated parts names a control tag, a control role, a `btn*` class or a
// hover/focus/active state.
const TAGS = /(^|[\s>+~(])(button|a|input|select|textarea|summary)(?![\w-])/i;
const ROLE = /\[\s*role\s*[~|^$*]?=\s*["']?[\w-]+["']?\s*\]/i;
const BTN_CLASS = /\.btn[\w-]*/i;
const STATE = /:(hover|focus|focus-visible|focus-within|active)\b/i;

export function isControlSelector(selector) {
  return String(selector).split(',').some((part) => TAGS.test(part) || ROLE.test(part) || BTN_CLASS.test(part) || STATE.test(part));
}
