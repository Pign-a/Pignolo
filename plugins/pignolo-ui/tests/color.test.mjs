import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, contrastRatio, composite, toOklch, formatColor, detectFormat } from '../lib/color.mjs';

const RED = [1, 0, 0];

function rgbOf(input, opts) {
  const r = parseColor(input, opts);
  assert.equal(r.ok, true, `${input}: ${r.reason}`);
  return r.rgba;
}

function near(input, [r, g, b], a = 1, tol = 0.006, opts) {
  const c = rgbOf(input, opts);
  for (const [k, want] of [['r', r], ['g', g], ['b', b], ['a', a]]) {
    assert.ok(Math.abs(c[k] - want) <= tol, `${input}: ${k}=${c[k]} want ${want}`);
  }
}

test('hex with 3, 4, 6 and 8 digits', () => {
  near('#fff', [1, 1, 1]);
  near('#FFFF', [1, 1, 1], 1);
  near('#0b6bcb', [11 / 255, 107 / 255, 203 / 255]);
  near('#ffffff80', [1, 1, 1], 128 / 255);
  assert.equal(parseColor('#ggg').ok, false);
  assert.equal(parseColor('#12345').ok, false);
});

test('rgb and hsl in comma and space syntax, with alpha', () => {
  near('rgb(255, 0, 0)', RED);
  near('rgb(255 0 0)', RED);
  near('rgba(255,0,0,0.5)', RED, 0.5);
  near('rgb(100% 0% 0% / 50%)', RED, 0.5);
  near('hsl(0 100% 50%)', RED);
  near('hsl(120deg, 100%, 25%)', [0, 0.502, 0]);
  near('hsla(0.5turn 100% 50% / 0.25)', [0, 1, 1], 0.25);
  near('hwb(0 0% 0%)', RED);
  near('hwb(0 50% 50%)', [0.5, 0.5, 0.5]);
});

test('oklch, oklab, lab and lch (CSS Color 4, D50 for lab/lch)', () => {
  near('oklch(0.628 0.2577 29.23)', RED);
  near('oklch(62.8% 0.2577 29.23)', RED);
  near('oklab(0.628 0.2249 0.1258)', RED);
  near('lab(54.29 80.8 69.89)', RED);
  near('lch(54.29 106.84 40.85)', RED);
  // mid-gamut references (red clips at the gamut edge and would hide a wrong white point)
  near('lab(50 20 -30)', [133 / 255, 108 / 255, 170 / 255], 1, 0.004);
  near('lch(60 40 200)', [0, 163 / 255, 167 / 255], 1, 0.004);
  near('oklch(1 0 0 / 0.12)', [1, 1, 1], 0.12);
  near('oklch(0.5 none none)', [0.389, 0.389, 0.389], 1, 0.01);
});

test('out-of-gamut colors are clipped into sRGB and flagged', () => {
  const r = parseColor('oklch(0.9 0.4 150)');
  assert.equal(r.ok, true);
  assert.equal(r.clipped, true);
  for (const k of ['r', 'g', 'b']) assert.ok(r.rgba[k] >= 0 && r.rgba[k] <= 1);
  assert.equal(parseColor('#0b6bcb').clipped, false);
});

test('bare shadcn HSL and hsl(var(--x))', () => {
  near('0 0% 100%', [1, 1, 1]);
  near('222.2 84% 4.9%', [2 / 255, 8 / 255, 23 / 255], 1, 0.004);
  near('hsl(var(--primary))', [2 / 255, 8 / 255, 23 / 255], 1, 0.004, { vars: { '--primary': '222.2 84% 4.9%' } });
});

test('var() chains with fallback; missing or cyclic vars are unverified', () => {
  const vars = { '--a': 'var(--b)', '--b': '#000', '--loop1': 'var(--loop2)', '--loop2': 'var(--loop1)' };
  near('var(--a)', [0, 0, 0], 1, 0.001, { vars });
  near('var(--nope, #fff)', [1, 1, 1], 1, 0.001, { vars });
  near('var(--nope, var(--b))', [0, 0, 0], 1, 0.001, { vars });
  assert.match(parseColor('var(--nope)', { vars }).reason, /undefined/);
  assert.match(parseColor('var(--loop1)', { vars }).reason, /cycle/);
  assert.equal(parseColor('var(--a)').ok, false);
});

test('color-mix in srgb and oklch; other spaces are unverified', () => {
  near('color-mix(in srgb, #ff0000 50%, #0000ff)', [0.5, 0, 0.5]);
  near('color-mix(in srgb, #000 25%, #fff)', [0.75, 0.75, 0.75]);
  near('color-mix(in srgb, #ff0000 20%, #0000ff 20%)', [0.5, 0, 0.5], 0.4);
  near('color-mix(in oklch, #ff0000, #ff0000)', RED);
  const mid = rgbOf('color-mix(in oklch, #000, #fff)');
  const l = toOklch(mid).l;
  assert.ok(Math.abs(l - 0.5) < 0.01, `L=${l}`);
  assert.match(parseColor('color-mix(in hsl, red, blue)').reason, /not supported/);
});

test('named colors, currentColor, color() and relative syntax are unverified', () => {
  for (const s of ['red', 'transparent', 'currentColor', 'color(display-p3 1 0 0)', 'rgb(from #fff r g b)', 'rgb(1 2)', '', 'linear-gradient(#fff, #000)']) {
    const r = parseColor(s);
    assert.equal(r.ok, false, s);
    assert.equal(typeof r.reason, 'string');
  }
});

test('WCAG contrast ratio, with alpha composited over the background', () => {
  const white = rgbOf('#fff');
  assert.equal(Math.round(contrastRatio(rgbOf('#000'), white) * 100) / 100, 21);
  assert.equal(Math.round(contrastRatio(rgbOf('#777'), white) * 100) / 100, 4.48);
  assert.equal(Math.round(contrastRatio(rgbOf('#0b6bcb'), white) * 100) / 100, 5.28);
  const half = rgbOf('rgb(0 0 0 / 0.5)');
  assert.equal(contrastRatio(half, white), contrastRatio(composite(half, white), white));
  assert.ok(contrastRatio(half, white) < 4.5);
});

test('formatColor writes hex, rgb, hsl, bare hsl and oklch that parse back', () => {
  const c = rgbOf('#0b6bcb');
  assert.equal(formatColor(c, 'hex'), '#0b6bcb');
  assert.equal(formatColor(rgbOf('#ffffff80'), 'hex'), '#ffffff80');
  assert.equal(formatColor(rgbOf('#ffffff'), 'hsl-bare'), '0 0% 100%');
  assert.equal(formatColor(rgbOf('#ff0000'), 'rgb'), 'rgb(255 0 0)');
  assert.match(formatColor(c, 'oklch'), /^oklch\(0\.\d+ 0\.\d+ \d+(\.\d+)?\)$/);
  for (const f of ['hex', 'rgb', 'hsl', 'hsl-bare', 'oklch']) {
    const back = rgbOf(formatColor(c, f));
    for (const k of ['r', 'g', 'b']) assert.ok(Math.abs(back[k] - c[k]) < 0.004, `${f} ${k}`);
  }
});

test('detectFormat names the notation used', () => {
  assert.equal(detectFormat('#fff'), 'hex');
  assert.equal(detectFormat('0 0% 100%'), 'hsl-bare');
  assert.equal(detectFormat('hsl(0 0% 100%)'), 'hsl');
  assert.equal(detectFormat('rgba(0,0,0,.1)'), 'rgb');
  assert.equal(detectFormat('oklch(0.5 0.1 200)'), 'oklch');
  assert.equal(detectFormat('var(--x)'), 'var');
  assert.equal(detectFormat('red'), null);
});
