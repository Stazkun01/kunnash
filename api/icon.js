// Draws the Kunnash app icon as a PNG (used for the iPhone home screen).
// /apple-touch-icon.png and /icon-<size>.png are routed here by vercel.json.
import { deflateSync } from "node:zlib";

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

// Shapes on a 512 grid: the bar of the K and its two arms.
const BAR = [150, 128, 220, 384];
const ARMS = [[220, 262], [318, 128], [398, 128], [290, 268], [404, 384], [320, 384]];
const inPoly = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const STOPS = [[0, [0x7b, 0x2b, 0xff]], [0.55, [0xb4, 0x5c, 0xff]], [1, [0xff, 0x3d, 0xf2]]];
const grad = (t) => {
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i], [t0, c0] = STOPS[i - 1];
    if (t <= t1) { const k = (t - t0) / (t1 - t0); return c0.map((v, j) => v + (c1[j] - v) * k); }
  }
  return STOPS[STOPS.length - 1][1];
};

export function drawIcon(size) {
  const s = 512 / size, SS = 3; // 3x3 supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const X = (x + (sx + 0.5) / SS) * s, Y = (y + (sy + 0.5) / SS) * s;
        let c;
        const onBar = X >= BAR[0] && X <= BAR[2] && Y >= BAR[1] && Y <= BAR[3];
        if (onBar || inPoly(X, Y, ARMS)) c = [0x0b, 0x04, 0x14];
        else {
          c = grad((X + Y) / 1024);
          const d = Math.hypot(X - 154, Y - 102) / 410; // soft highlight, top left
          const h = Math.max(0, 1 - d) * 0.35;
          c = c.map((v) => v + (255 - v) * h);
        }
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3, n = SS * SS;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))
  ]);
}

const cache = new Map();
export default function handler(req, res) {
  const size = [180, 192, 512].includes(Number(req.query?.size)) ? Number(req.query.size) : 180;
  if (!cache.has(size)) cache.set(size, drawIcon(size));
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
  res.status(200).send(cache.get(size));
}
