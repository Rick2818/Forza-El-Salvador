// Generates assets/horizon.ico: a 256x256 + 32x32 PNG-in-ICO icon drawn
// procedurally (no external assets). Run with: node tools/make-icon.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const SS = 3;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;

function shade(x, y) {
  // x,y in 0..256 design space.
  const cx = 128;
  const cy = 150;
  const r = 58;

  // Rounded-square mask (radius 46).
  const m = 46;
  const qx = Math.max(Math.abs(x - 128) - (128 - m), 0);
  const qy = Math.max(Math.abs(y - 128) - (128 - m), 0);
  if (qx * qx + qy * qy > m * m) return [0, 0, 0, 0];

  // Sky gradient.
  const t = clamp01(y / 256);
  let r0 = mix(13, 4, t);
  let g0 = mix(24, 8, t);
  let b0 = mix(44, 16, t);

  // Horizon glow.
  const gd = Math.hypot(x - 128, y - 176);
  const glow = Math.pow(clamp01(1 - gd / 150), 2.2);
  r0 = mix(r0, 120, glow * 0.55);
  g0 = mix(g0, 42, glow * 0.5);
  b0 = mix(b0, 34, glow * 0.45);

  // Stars.
  if (y < 150) {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    const n = h - Math.floor(h);
    if (n > 0.996) {
      const k = (n - 0.996) / 0.004;
      r0 = mix(r0, 235, k);
      g0 = mix(g0, 244, k);
      b0 = mix(b0, 255, k);
    }
  }

  // Sun disc with retro bands.
  const sd = Math.hypot(x - cx, y - cy);
  if (sd < r) {
    const v = clamp01((y - (cy - r)) / (2 * r));
    let sr = mix(255, 255, v);
    let sg = mix(214, 90, v);
    let sb = mix(92, 31, v);
    const band = y > 162 && y < 166 ? 0.9 : y > 172 && y < 179 ? 0.9 : 0;
    sr = mix(sr, 8, band);
    sg = mix(sg, 12, band);
    sb = mix(sb, 22, band);
    r0 = sr;
    g0 = sg;
    b0 = sb;
  }

  // Ground below the horizon.
  if (y > 176) {
    r0 = 7;
    g0 = 11;
    b0 = 19;
  }

  // Horizon line.
  if (Math.abs(y - 176) < 1.4) {
    r0 = 69;
    g0 = 230;
    b0 = 255;
  }

  // Road trapezoid.
  const tt = clamp01((y - 176) / 80);
  const half = mix(6, 34, tt);
  if (y > 176 && Math.abs(x - 128) < half) {
    r0 = 20;
    g0 = 26;
    b0 = 36;
    if (Math.abs(x - 128) > half - 3) {
      r0 = 46;
      g0 = 56;
      b0 = 70;
    }
  }

  // Centre dashes.
  if (y > 186 && y < 250 && Math.abs(x - 128) < mix(1.6, 3.4, tt)) {
    const seg = Math.floor((y - 186) / 16) % 2;
    if (seg === 0) {
      r0 = 255;
      g0 = 90;
      b0 = 31;
    }
  }

  return [r0, g0, b0, 255];
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = 256 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const p = shade((x + (sx + 0.5) / SS) * scale, (y + (sy + 0.5) / SS) * scale);
          r += p[0] * p[3];
          g += p[1] * p[3];
          b += p[2] * p[3];
          a += p[3];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      if (a > 0) {
        rgba[o] = Math.round(r / a);
        rgba[o + 1] = Math.round(g / a);
        rgba[o + 2] = Math.round(b / a);
      }
      rgba[o + 3] = Math.round(a / n);
    }
  }
  return rgba;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function makeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = [];
  for (const img of images) {
    const e = Buffer.alloc(16);
    e[0] = img.size >= 256 ? 0 : img.size;
    e[1] = img.size >= 256 ? 0 : img.size;
    e[2] = 0;
    e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(img.png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += img.png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const sizes = [256, 64, 32, 16];
const images = sizes.map((size) => ({ size, png: encodePng(size, render(size)) }));
const outDir = join(root, "assets");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "horizon.ico");
writeFileSync(out, makeIco(images));
console.log(`wrote ${out} (${makeIco(images).length} bytes, sizes ${sizes.join("/")})`);
