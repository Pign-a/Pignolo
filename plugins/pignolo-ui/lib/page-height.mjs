// The real height of a screen at the width of its row (R-15, D-4c-9). The browser reads it; the canvas
// frame uses it within 400..8000 px (the type allows 40..8000; below 400 a screen looks lost).
//
// clampHeight(v) -> integer | null      NaN, Infinity or a non-number is null (the caller keeps the default size)
// measureHeight(page) -> number         the largest scrollHeight of <html> and <body>
export const MIN_HEIGHT = 400;
export const MAX_HEIGHT = 8000;

export function clampHeight(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(v)));
}

// Serialized and run in the page: it must not close over anything from this module.
function read() {
  const de = document.documentElement;
  const body = document.body;
  return Math.max(de ? de.scrollHeight : 0, body ? body.scrollHeight : 0);
}

export function measureHeight(page) {
  return page.evaluate(read);
}
