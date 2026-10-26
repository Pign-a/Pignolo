// Shared measurements for the calendar family (date-picker, month-picker, date-range-picker).

/** Panel size, number of date rows and the gap between the last row of the grid and a footer button. */
export const geometry = (t, buttonText) =>
  t.eval((txt) => {
    const d = document.querySelector('[role="dialog"]');
    const r = (e) => e.getBoundingClientRect();
    const slide = d.querySelector('[data-view-slide]:not([inert])');
    const grids = slide.matches('[role="grid"]') ? [slide] : [...slide.querySelectorAll('[role="grid"]')];
    const rows = grids.flatMap((g) => [...g.querySelectorAll('[role="row"]')].filter((x) => x.querySelector('button')));
    const last = rows.reduce((a, b) => (r(b).bottom > r(a).bottom ? b : a), rows[0]);
    const real = new Set(rows.filter((x) => x.querySelector('[data-day-cell]')).map((x) => Math.round(r(x).top))).size;
    const btn = [...d.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === txt);
    return { h: r(d).height, w: r(d).width, realRows: real, gridBottom: r(last).bottom, gap: btn ? r(btn).top - r(last).bottom : null };
  }, buttonText);

/** A real click at a point (the helpers click element centers only). */
export const clickAt = async (t, x, y) => {
  await t.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await t.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await t.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
};

/** A key with modifiers (1 alt, 2 ctrl, 4 meta, 8 shift). */
export const keyWith = async (t, key, modifiers) => {
  const vk = { ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Enter: 13 }[key];
  await t.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  await t.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
};

export const wheel = (t, x, y, deltaY) => t.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });

/** A finger tap on an element (under `t.coarse(true)` mouse events are not delivered, touch ones are). */
export const tap = async (t, sel) => {
  const r = await t.rect(sel);
  await t.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.cx, y: r.cy }] });
  await t.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
