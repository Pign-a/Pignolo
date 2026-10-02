// lib/captures-check.mjs: when is a screenshot valid evidence (hito 4e, R-4e-19).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePng } from './support/make-png.mjs';
import { checkCapture, samplePng, MIN_DISTINCT, MAX_DOMINANT, SAMPLE_STEP } from '../lib/captures-check.mjs';

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const SETTLED = { readyState: 'complete', runningAnimations: 0 };
// 320 x 320 gives a 20 x 20 sample of 400 points; `ink` paints that many sample points black.
const withInk = (ink, size = 320) => makePng({
  width: size, height: size,
  pixel: (x, y) => (x % SAMPLE_STEP === 0 && y % SAMPLE_STEP === 0 && (y / SAMPLE_STEP) * (size / SAMPLE_STEP) + x / SAMPLE_STEP < ink ? BLACK : WHITE),
});

test('constants of the validity rule', () => {
  assert.deepEqual([MIN_DISTINCT, MAX_DOMINANT, SAMPLE_STEP], [2, 0.995, 16]);
});

test('a flat image is invalid: white, black, or one value in 99.5 % of the sample', () => {
  const white = makePng({ width: 64, height: 64 });
  assert.deepEqual(checkCapture({ png: white, width: 64, settled: SETTLED }), { valid: false, reason: 'uniform' });
  const black = makePng({ width: 64, height: 64, pixel: () => BLACK });
  assert.deepEqual(checkCapture({ png: black, width: 64, settled: SETTLED }), { valid: false, reason: 'uniform' });
  assert.equal(checkCapture({ png: withInk(1), width: 320, settled: SETTLED }).reason, 'uniform', '399 of 400 is 99.75 %');
  assert.equal(checkCapture({ png: withInk(2), width: 320, settled: SETTLED }).reason, 'uniform', '398 of 400 is exactly 99.5 %: invalid');
  assert.deepEqual(checkCapture({ png: withInk(3), width: 320, settled: SETTLED }), { valid: true }, '397 of 400 is 99.25 %');
});

test('a white page with a block of content (10 % of the area) is valid, RGBA too', () => {
  const page = (alpha) => makePng({ width: 320, height: 320, alpha, pixel: (x, y) => (x < 100 && y < 100 ? [30, 30, 30, 255] : [255, 255, 255, 255]) });
  assert.deepEqual(checkCapture({ png: page(false), width: 320, settled: SETTLED }), { valid: true });
  assert.deepEqual(checkCapture({ png: page(true), width: 320, settled: SETTLED }), { valid: true });
  const s = samplePng(page(false));
  assert.ok(s.distinct === 2 && s.dominantRatio > 0.8 && s.dominantRatio < 0.995, JSON.stringify(s));
});

test('width, signature and settled state', () => {
  const ok = withInk(40, 160);
  assert.equal(checkCapture({ png: ok, width: 160, settled: SETTLED }).valid, true);
  assert.deepEqual(checkCapture({ png: ok, width: 161, settled: SETTLED }), { valid: false, reason: 'width-mismatch' });
  assert.deepEqual(checkCapture({ png: Buffer.from('not a png at all, just text'), width: 160, settled: SETTLED }), { valid: false, reason: 'bad-png' });
  assert.deepEqual(checkCapture({ png: ok, width: 160, settled: { readyState: 'loading', runningAnimations: 0 } }), { valid: false, reason: 'not-loaded' });
  assert.deepEqual(checkCapture({ png: ok, width: 160, settled: { readyState: 'complete', runningAnimations: 2 } }), { valid: false, reason: 'animating' });
});

test('samplePng undoes the line filters: a PNG with Sub, Up, Average and Paeth lines reads the same as filter 0', async () => {
  // Re-encode a gradient with each filter type on a different line.
  const { default: zlib } = await import('node:zlib');
  const width = 48;
  const height = 48;
  const pix = (x, y) => [(x * 5) & 255, (y * 5) & 255, ((x + y) * 3) & 255];
  const plain = makePng({ width, height, pixel: pix });
  const bpp = 3;
  const raw = Buffer.alloc((width * bpp + 1) * height);
  const lines = [];
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(width * bpp);
    for (let x = 0; x < width; x++) pix(x, y).forEach((v, k) => { line[x * bpp + k] = v; });
    lines.push(line);
  }
  for (let y = 0; y < height; y++) {
    const f = y % 5;
    const start = y * (width * bpp + 1);
    raw[start] = f;
    for (let i = 0; i < width * bpp; i++) {
      const a = i >= bpp ? lines[y][i - bpp] : 0;
      const b = y > 0 ? lines[y - 1][i] : 0;
      const c = y > 0 && i >= bpp ? lines[y - 1][i - bpp] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      raw[start + 1 + i] = (lines[y][i] - pred) & 255;
    }
  }
  const chunks = [];
  let pos = 8;
  while (pos < plain.length) { const len = plain.readUInt32BE(pos); chunks.push(plain.subarray(pos, pos + 12 + len)); pos += 12 + len; }
  const idat = Buffer.concat([Buffer.from('IDAT'), zlib.deflateSync(raw)]);
  const out = Buffer.alloc(idat.length + 8);
  out.writeUInt32BE(idat.length - 4, 0);
  idat.copy(out, 4);
  out.writeUInt32BE(zlib.crc32(idat) >>> 0, idat.length + 4);
  const filtered = Buffer.concat([plain.subarray(0, 8), chunks[0], out, chunks[2]]);
  assert.deepEqual(samplePng(filtered), samplePng(plain));
});
