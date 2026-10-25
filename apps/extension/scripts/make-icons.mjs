// Draws the extension icon (a green ability die with a success burst) and
// writes it as PNGs in the sizes Chrome wants. No image libraries: shapes are
// rasterized with 4x4 supersampling and encoded with node:zlib.
//
//   node scripts/make-icons.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const SIZES = [16, 32, 48, 128];
const OUT_DIR = new URL("../public/icons/", import.meta.url);
const SAMPLES = 4;

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function inPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundedSquare(x, y, inset, radius) {
  const lo = inset + radius;
  const hi = 1 - inset - radius;
  const dx = Math.max(lo - x, 0, x - hi);
  const dy = Math.max(lo - y, 0, y - hi);
  return x >= inset && x <= 1 - inset && y >= inset && y <= 1 - inset && dx * dx + dy * dy <= radius * radius;
}

function burst(cx, cy, outer, inner, points) {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / points - Math.PI / 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

// Painted in order; later shapes cover earlier ones. Coordinates are 0..1.
const SHAPES = [
  { color: hex("#1d1a24"), hit: (x, y) => inRoundedSquare(x, y, 0.02, 0.2) },
  { color: hex("#4cb05a"), hit: (x, y) => inPolygon(x, y, [[0.5, 0.1], [0.5, 0.9], [0.12, 0.5]]) },
  { color: hex("#2f8a3c"), hit: (x, y) => inPolygon(x, y, [[0.5, 0.1], [0.88, 0.5], [0.5, 0.9]]) },
  { color: hex("#0d1f10"), hit: (x, y) => inPolygon(x, y, burst(0.5, 0.5, 0.21, 0.1, 8)) },
];

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          let color = null;
          for (const shape of SHAPES) if (shape.hit(x, y)) color = shape.color;
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 255;
          }
        }
      }
      const n = SAMPLES * SAMPLES;
      const covered = a / 255;
      const o = (py * size + px) * 4;
      // Store un-premultiplied color so edges don't darken.
      rgba[o] = covered ? Math.round(r / covered) : 0;
      rgba[o + 1] = covered ? Math.round(g / covered) : 0;
      rgba[o + 2] = covered ? Math.round(b / covered) : 0;
      rgba[o + 3] = Math.round(a / n);
    }
  }
  return rgba;
}

function chunk(type, data) {
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  typed.copy(out, 4);
  out.writeUInt32BE(crc32(typed), 8 + data.length);
  return out;
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  writeFileSync(new URL(`icon-${size}.png`, OUT_DIR), encodePng(size, render(size)));
  console.log(`icons/icon-${size}.png`);
}
