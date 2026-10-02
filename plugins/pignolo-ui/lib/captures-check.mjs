// Is a screenshot valid evidence? (hito 4e, R-4e-19). An invalid capture is never deleted and
// never produces a finding or a pass: it is `unverified` with the reason.
//
// checkCapture({ png, width, settled }) -> { valid: true } | { valid: false, reason }
//   reason: bad-png | width-mismatch | uniform | not-loaded | animating
//   width    the width asked for (deviceScaleFactor 1: the image has the same width)
//   settled  { readyState, runningAnimations } read just before capturing (optional)
// samplePng(buf) -> { distinct, dominantRatio }   1 pixel out of 16 in both axes; 8-bit RGB and
//   RGBA PNG without interlace only (anything else throws).
import zlib from 'node:zlib';
import { checkPng } from './png.mjs';

export const MIN_DISTINCT = 2;
export const MAX_DOMINANT = 0.995;
export const SAMPLE_STEP = 16;

function readChunks(buf) {
  const chunks = [];
  for (let pos = 8; pos + 8 <= buf.length;) {
    const len = buf.readUInt32BE(pos);
    chunks.push({ type: buf.toString('ascii', pos + 4, pos + 8), data: buf.subarray(pos + 8, pos + 8 + len) });
    pos += 12 + len;
  }
  return chunks;
}

export function samplePng(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR')?.data;
  if (!ihdr || ihdr.length < 13) throw new Error('no IHDR');
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const [depth, colorType, , , interlace] = [ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]];
  if (depth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) throw new Error(`unsupported PNG (depth ${depth}, type ${colorType}, interlace ${interlace})`);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const stride = width * bpp;
  if (raw.length < (stride + 1) * height) throw new Error('truncated image data');
  // Undo the line filters, keeping only the previous line.
  let prev = Buffer.alloc(stride);
  const counts = new Map();
  let total = 0;
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    const line = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad filter ${filter}`);
      line[i] = (line[i] + add) & 255;
    }
    if (y % SAMPLE_STEP === 0) {
      for (let x = 0; x < width; x += SAMPLE_STEP) {
        const k = line.readUIntBE(x * bpp, 3) * 256 + (bpp === 4 ? line[x * bpp + 3] : 0);
        counts.set(k, (counts.get(k) ?? 0) + 1);
        total++;
      }
    }
    prev = line;
  }
  return { distinct: counts.size, dominantRatio: total ? Math.max(...counts.values()) / total : 1 };
}

export function checkCapture({ png, width, settled } = {}) {
  const head = checkPng(png, { maxSide: 100000 });
  if (!head.ok) return { valid: false, reason: 'bad-png' };
  if (head.width !== width) return { valid: false, reason: 'width-mismatch' };
  if (settled && settled.readyState !== 'complete') return { valid: false, reason: 'not-loaded' };
  if (settled && settled.runningAnimations > 0) return { valid: false, reason: 'animating' };
  let sample;
  try { sample = samplePng(png); } catch { return { valid: false, reason: 'bad-png' }; }
  if (sample.distinct < MIN_DISTINCT || sample.dominantRatio >= MAX_DOMINANT) return { valid: false, reason: 'uniform' };
  return { valid: true };
}
