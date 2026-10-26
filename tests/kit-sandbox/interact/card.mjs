// Card: no hover lift (decision 4), shadow layer, press 0.985, disabled, actions (primary/secondary/destructive apart), loading, keyboard.
export default async function (t) {
  const tf = (sel) => t.eval((s) => {
    const cs = getComputedStyle(document.querySelector(s));
    const m = new DOMMatrixReadOnly(cs.transform);
    return { y: m.f, s: m.a * (parseFloat(cs.scale) || 1), top: document.querySelector(s).getBoundingClientRect().top + window.scrollY };
  }, sel);
  const card = '[data-testid="card-press-wrap"] button';
  const shadowOpacity = () => t.eval((s) => parseFloat(getComputedStyle(document.querySelector(s + ' > span[aria-hidden]')).opacity), card);

  // Hover: the shadow fades in and nothing moves (it lifted -3 px before decision 4)
  t.expect((await shadowOpacity()) < 0.05, 'shadow hidden at rest');
  const top0 = (await tf(card)).top;
  await t.hover(card);
  await t.wait(600);
  let p = await tf(card);
  t.expect(Math.abs(p.y) < 0.01 && Math.abs(p.top - top0) < 0.01, `card does not lift on hover (y=${p.y}, moved ${(p.top - top0).toFixed(2)})`);
  t.expect((await shadowOpacity()) > 0.95, 'shadow layer visible on hover');

  // Press: 0.985 while held
  await t.mouseDown(card);
  await t.wait(110);
  p = await tf(card);
  await t.mouseUp();
  if (t.reducedMotion) t.expect(Math.abs(p.s - 1) < 0.001, 'reduced: no press scale');
  else t.expect(p.s > 0.975 && p.s < 0.995, `press scale near 0.985 (got ${p.s.toFixed(3)})`);
  await t.wait(200);
  t.expectEqual(await t.text('[data-testid="opened"]'), '1', 'click opens the card once');
  await t.hover('h1');
  await t.wait(600);
  p = await tf(card);
  t.expect(Math.abs(p.y) < 0.2 && Math.abs(p.s - 1) < 0.005, `back at rest (y=${p.y.toFixed(2)}, s=${p.s.toFixed(3)})`);

  // Keyboard: Tab reaches the card, ring is visible, Enter and Space activate
  await t.focus(card);
  await t.press("Enter");
  await t.press("Space");
  await t.wait(150);
  t.expectEqual(await t.text('[data-testid="opened"]'), "3", "Enter and Space activate the card");
  await t.eval(() => document.querySelector('[role="group"] button:last-child').focus());
  await t.press("Tab");
  const ring = await t.eval(() => { const a = document.activeElement; return { tag: a.tagName, txt: a.textContent.slice(0, 20), outline: getComputedStyle(a).outlineStyle }; });
  t.expect(ring.outline === "solid" && ring.txt.includes("Resumen"), `focus-visible ring on the first card after Tab (${ring.tag} ${ring.txt} ${ring.outline})`);

  // Disabled card: no lift, no click
  const dis = '[data-testid="card-press-wrap"] ~ a ~ button, button[disabled]';
  await t.hover('button[disabled]');
  await t.wait(400);
  p = await tf('button[disabled]');
  t.expect(Math.abs(p.y) < 0.1, 'disabled card does not lift');
  await t.click('button[disabled]');
  await t.wait(100);
  t.expectEqual(await t.text('[data-testid="opened"]'), '3', 'disabled card ignores clicks');

  // Anchor card is a link
  t.expectEqual(await t.eval(() => document.querySelector('a[href="#/card"]').tagName), 'A', 'href card renders an anchor');

  // Actions mode: primary, secondary, destructive apart
  await t.eval(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Renovar ahora").setAttribute("data-testid", "renew"));
  const primary = '[data-testid="renew"]';
  const destructive = 'button[aria-label="Cancelar plan"]';
  const dy = await t.eval(() => { const a = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Renovar ahora").getBoundingClientRect(); const d = document.querySelector('button[aria-label="Cancelar plan"]').getBoundingClientRect(); return Math.abs(a.y - d.y); });
  t.expect(dy > 150, `destructive is apart from the primary (dy=${Math.round(dy)}px)`);
  await t.click(destructive);
  await t.wait(100);
  t.expectEqual(await t.text('[data-testid="removed"]'), '1', 'destructive action fires');
  await t.click(primary);
  await t.wait(150);
  t.expectEqual(await t.text('[data-testid="renewed"]'), '1', 'primary fires once');
  t.expectEqual(await t.attr(primary, 'aria-busy'), 'true', 'primary shows loading');
  await t.click(primary);
  await t.wait(100);
  t.expectEqual(await t.text('[data-testid="renewed"]'), '1', 'primary ignores clicks while loading');
  await t.wait(1400);
  t.expectEqual(await t.attr(primary, 'aria-busy'), null, 'loading ends');

  // Static actions card: shadow on hover, no lift, no press scale
  await t.hover(primary);
  await t.wait(600);
  const staticCard = 'button[aria-label="Cancelar plan"]';
  const st = await t.eval((s) => { let e = document.querySelector(s); while (e && !e.className.includes('group')) e = e.parentElement; const cs = getComputedStyle(e); return { y: new DOMMatrixReadOnly(cs.transform).f, shadow: parseFloat(getComputedStyle(e.querySelector(':scope > span[aria-hidden]')).opacity) }; }, staticCard);
  t.expect(Math.abs(st.y) < 0.01, `actions card does not lift (got ${st.y.toFixed(2)})`);
  t.expect(st.shadow > 0.95, 'actions card shows its shadow on hover');

  // Loading skeleton keeps a status message
  t.expect(await t.exists('[role="status"]'), 'loading card exposes a status text');
  await t.screenshot(`card-interact${t.reducedMotion ? '-reduced' : ''}`);
}
