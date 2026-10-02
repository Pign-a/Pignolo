// Real height of a screen, for the frames of the canvas (R-15, D-4c-9). The page is opened at the width of
// its row; what is measured is how tall the document is, never what it says.
//
// clampHeight(v) -> integer in [400, 8000] | null     rounds up (a fraction must not clip the frame); a bad number gives null
// heightKey(option, file, width) -> '<option>/<file>@<width>'     the key canvas-index build --heights reads
// pageHeight(page) -> Promise<number>                 page: the page object of browser-session
export const MIN_HEIGHT = 400;
export const MAX_HEIGHT = 8000;

export function clampHeight(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(v)));
}

export const heightKey = (option, file, width) => `${option}/${file}@${width}`;

// Serialized and run in the page: it must not close over anything from this module.
function measure() {
  const de = document.documentElement;
  const body = document.body;
  return Math.max(de ? de.scrollHeight : 0, body ? body.scrollHeight : 0);
}

export function pageHeight(page) {
  return page.evaluate(measure);
}
