// One-off generator for PWA icons (no image deps — hand-rolled PNG encoder).
// Run: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "icons");
mkdirSync(OUT_DIR, { recursive: true });

const ACCENT = [37, 99, 235]; // matches --brand accent (blue-600-ish)

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  let t = abLen2 === 0 ? 0 : (apx * abx + apy * aby) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

function renderPNG(size) {
  const width = size;
  const height = size;
  const data = Buffer.alloc(width * height * 4);

  // Checkmark geometry, generous margin so it stays inside maskable safe zones.
  const s = size;
  const p1 = [s * 0.28, s * 0.52];
  const p2 = [s * 0.44, s * 0.68];
  const p3 = [s * 0.74, s * 0.32];
  const thickness = s * 0.09;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const cx = x + 0.5;
      const cy = y + 0.5;

      const d1 = distToSegment(cx, cy, p1[0], p1[1], p2[0], p2[1]);
      const d2 = distToSegment(cx, cy, p2[0], p2[1], p3[0], p3[1]);
      const d = Math.min(d1, d2);

      let r = ACCENT[0];
      let g = ACCENT[1];
      let b = ACCENT[2];
      let a = 255;

      if (d <= thickness / 2) {
        r = 255;
        g = 255;
        b = 255;
      } else if (d <= thickness / 2 + 1) {
        // 1px anti-alias blend
        const t = d - thickness / 2;
        r = Math.round(255 * (1 - t) + ACCENT[0] * t);
        g = Math.round(255 * (1 - t) + ACCENT[1] * t);
        b = Math.round(255 * (1 - t) + ACCENT[2] * t);
      }

      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }

  // Raw scanlines with filter byte 0 (none) prefixed per row.
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 9 });

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512, 180]) {
  const png = renderPNG(size);
  const name =
    size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`wrote ${name} (${png.length} bytes)`);
}
