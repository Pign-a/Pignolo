// Screenshot validation (spec §11.3): PNG signature, IHDR first, both sides > 0 and <= maxSide,
// and the sha256 of the bytes. checkPng(buf, { maxSide }) -> { ok, width, height, sha256 } | { ok: false, reason }
import crypto from 'node:crypto';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function checkPng(buf, { maxSide = 2000 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) return { ok: false, reason: 'not a PNG (bad signature)' };
  if (buf.length < 33 || buf.toString('ascii', 12, 16) !== 'IHDR') return { ok: false, reason: 'truncated PNG (no IHDR)' };
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) return { ok: false, reason: 'empty image (0 px side)' };
  if (width > maxSide || height > maxSide) return { ok: false, reason: `image ${width}x${height} exceeds ${maxSide} px` };
  return { ok: true, width, height, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}
