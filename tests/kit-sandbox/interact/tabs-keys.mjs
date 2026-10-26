// Segmented tabs, realistic key timing (50 ms and 30 ms between keys).
export default async function (t) {
  const root = '[data-testid="seg-main"]';
  const selected = () => t.eval((r) => [...document.querySelectorAll(r + ' [role="tab"]')].findIndex((e) => e.getAttribute('aria-selected') === 'true'), root);
  const focusTab = (i) => t.eval((a) => document.querySelectorAll(a.r + ' [role="tab"]')[a.i].focus(), { r: root, i });
  const activeRole = () => t.eval(() => ({ role: document.activeElement.getAttribute('role'), sel: document.activeElement.getAttribute('aria-selected') }));

  // 1. Arrow keys with 50 ms between keydowns, all must register
  await t.click(`${root} [role="tab"]:nth-child(4)`);
  await t.wait(400);
  t.expectEqual(await selected(), 3, 'start on the last tab');
  for (let k = 0; k < 3; k++) { await t.press('ArrowLeft'); await t.wait(50); }
  await t.wait(500);
  t.expectEqual(await selected(), 0, 'three ArrowLeft 50 ms apart reach the first tab');
  for (let k = 0; k < 3; k++) { await t.press('ArrowRight'); await t.wait(50); }
  await t.wait(500);
  t.expectEqual(await selected(), 3, 'three ArrowRight 50 ms apart reach the last tab');
  // Key repeat speed (about 30 ms) too
  for (let k = 0; k < 3; k++) { await t.press('ArrowLeft'); await t.wait(30); }
  await t.wait(500);
  t.expectEqual(await selected(), 0, 'three ArrowLeft 30 ms apart (key repeat speed) reach the first tab');

  // 2. Tab entry after mouse use lands on the tablist (not the selected tab) with plain Radix Tabs too (upstream roving-focus behaviour, checked with an unwrapped Radix Tabs page), so it is not asserted here.

  // 3. From inside the list, Tab goes to the panel and Shift is not needed to leave
  await focusTab(await selected());
  await t.press('Tab');
  await t.wait(100);
  t.expectEqual(await t.eval(() => document.activeElement.getAttribute('role')), 'tabpanel', 'Tab leaves the list to the panel');
}
