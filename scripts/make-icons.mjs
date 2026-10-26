// Genera icons/icon{16,32,48,128}.png e icons/icon.svg sin dependencias:
// rasteriza figuras simples con supermuestreo y codifica PNG con zlib de Node.
//
// Diseño: cuadrado redondeado verde azulado, triángulo de reproducción blanco
// y una "barra espaciadora" ámbar debajo (reproducir + teclado).
//
// Uso: npm run icons

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const SIZES = [16, 32, 48, 128];
const SAMPLES = 4; // 4×4 muestras por píxel

const COLORS = {
  bg: [13, 110, 102],
  play: [255, 255, 255],
  bar: [245, 185, 66],
};

// Geometría en coordenadas unitarias (0–1).
const BG = { x0: 0, y0: 0, x1: 1, y1: 1, r: 0.22 };
const TRIANGLE = [
  [0.37, 0.2],
  [0.37, 0.62],
  [0.73, 0.41],
];
const BAR = { x0: 0.22, y0: 0.73, x1: 0.78, y1: 0.83, r: 0.05 };

function inRoundRect(x, y, { x0, y0, x1, y1, r }) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inTriangle(x, y, [[ax, ay], [bx, by], [cx, cy]]) {
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = s(x, y, ax, ay, bx, by);
  const d2 = s(x, y, bx, by, cx, cy);
  const d3 = s(x, y, cx, cy, ax, ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function sample(x, y) {
  if (!inRoundRect(x, y, BG)) return null;
  if (inTriangle(x, y, TRIANGLE)) return COLORS.play;
  if (inRoundRect(x, y, BAR)) return COLORS.bar;
  return COLORS.bg;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const c = sample((pxl + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
      const i = (py * size + pxl) * 4;
      if (a) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro "None"
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const s = (v) => +(v * 128).toFixed(2);
  const pts = TRIANGLE.map(([x, y]) => `${s(x)},${s(y)}`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <rect width="128" height="128" rx="${s(BG.r)}" fill="${hex(COLORS.bg)}"/>
  <polygon points="${pts}" fill="${hex(COLORS.play)}"/>
  <rect x="${s(BAR.x0)}" y="${s(BAR.y0)}" width="${s(BAR.x1 - BAR.x0)}" height="${s(BAR.y1 - BAR.y0)}" rx="${s(BAR.r)}" fill="${hex(COLORS.bar)}"/>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  writeFileSync(path.join(OUT, `icon${size}.png`), encodePng(size, render(size)));
}
writeFileSync(path.join(OUT, 'icon.svg'), svg());
console.log(`Íconos generados en ${OUT}: ${SIZES.join(', ')} px + icon.svg`);
