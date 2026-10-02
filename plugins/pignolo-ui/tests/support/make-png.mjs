// Builds a PNG for tests with node:zlib only (no dependencies).
// makePng({ width, height, pixel = () => [255, 255, 255], alpha = false }) -> Buffer
//   pixel(x, y) -> [r, g, b] (or [r, g, b, a] with alpha). 8-bit RGB or RGBA, filter 0, no interlace.
import zlib from 'node:zlib';

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(zlib.crc32(body) >>> 0, body.length + 4);
  return out;
};

export function makePng({ width, height, pixel = () => [255, 255, 255], alpha = false }) {
  const bpp = alpha ? 4 : 3;
  const raw = Buffer.alloc((width * bpp + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * bpp + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const p = pixel(x, y);
      for (let k = 0; k < bpp; k++) raw[row + 1 + x * bpp + k] = p[k] ?? 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
