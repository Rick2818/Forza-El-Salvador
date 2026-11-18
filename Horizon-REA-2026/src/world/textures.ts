import * as THREE from "three";

/**
 * All textures are generated procedurally at runtime with Canvas2D noise.
 * No external image assets => no third-party art licences to clear, and the
 * game ships as pure original content.
 */

const hash2 = (x: number, y: number, seed: number): number => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

const wrap = (n: number, period: number): number => ((n % period) + period) % period;

function tileNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = wrap(xi, period);
  const y0 = wrap(yi, period);
  const x1 = wrap(xi + 1, period);
  const y1 = wrap(yi + 1, period);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x: number, y: number, period: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * tileNoise(x * freq, y * freq, period * freq, seed + i * 71);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function canvas(size: number, h = size): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = h;
  return c;
}

function toTexture(c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export interface AsphaltMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export function createAsphaltMaps(): AsphaltMaps {
  const S = 512;
  const albedo = canvas(S);
  const rough = canvas(S);
  const height = new Float32Array(S * S);
  const actx = albedo.getContext("2d")!;
  const rctx = rough.getContext("2d")!;
  const aImg = actx.createImageData(S, S);
  const rImg = rctx.createImageData(S, S);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const grain = fbm(u * 24, v * 24, 24, 11, 4);
      const patch = fbm(u * 4, v * 4, 4, 29, 3);
      const speck = hash2(x, y, 7);
      const wear = 0.5 + 0.5 * Math.cos((u - 0.5) * Math.PI * 2.0);
      let base = 40 + grain * 26 + patch * 12;
      base -= wear * 7;
      if (speck > 0.955) base += 30;
      else if (speck < 0.03) base -= 16;
      base = Math.max(12, Math.min(96, base));

      const i = (y * S + x) * 4;
      // Neutral carbon-black aggregate: no blue bias under daylight.
      aImg.data[i] = base;
      aImg.data[i + 1] = base;
      aImg.data[i + 2] = base;
      aImg.data[i + 3] = 255;

      const r = 196 + grain * 46 + speck * 18;
      rImg.data[i] = r;
      rImg.data[i + 1] = r;
      rImg.data[i + 2] = r;
      rImg.data[i + 3] = 255;

      height[y * S + x] = grain * 0.72 + patch * 0.28 + (speck > 0.96 ? 0.32 : 0);
    }
  }
  actx.putImageData(aImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);

  // Sobel derived normal map keeps the tarmac reading as coarse aggregate.
  const normal = canvas(S);
  const nctx = normal.getContext("2d")!;
  const nImg = nctx.createImageData(S, S);
  const hAt = (x: number, y: number): number => height[wrap(y, S) * S + wrap(x, S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * 2.4;
      const dy = (hAt(x, y + 1) - hAt(x, y - 1)) * 2.4;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      nImg.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nImg.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      nImg.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nImg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nImg, 0, 0);

  return {
    map: toTexture(albedo, true),
    normalMap: toTexture(normal, false),
    roughnessMap: toTexture(rough, false)
  };
}

/** 2x2 twill carbon weave for aero parts and the tub. */
export function createCarbonTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0c0e12";
  ctx.fillRect(0, 0, S, S);
  const cell = 16;
  for (let y = 0; y < S; y += cell) {
    for (let x = 0; x < S; x += cell) {
      const horizontal = ((x / cell) + (y / cell)) % 4 < 2;
      const light = horizontal ? 34 : 18;
      const g = ctx.createLinearGradient(x, y, x + cell, y + cell);
      g.addColorStop(0, `rgb(${light + 12},${light + 14},${light + 18})`);
      g.addColorStop(0.48, `rgb(${light + 26},${light + 29},${light + 34})`);
      g.addColorStop(1, `rgb(${light},${light + 2},${light + 5})`);
      ctx.fillStyle = g;
      if (horizontal) {
        ctx.fillRect(x + 1, y + 3, cell - 3, cell - 7);
      } else {
        ctx.fillRect(x + 3, y + 1, cell - 7, cell - 3);
      }
    }
  }
  ctx.strokeStyle = "rgba(120,140,160,0.07)";
  ctx.lineWidth = 1;
  for (let i = -S; i < S * 2; i += cell * 2) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + S, S);
    ctx.stroke();
  }
  const t = toTexture(c, true);
  t.repeat.set(1, 1);
  return t;
}

export function createGrassTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = canvas(S);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const n = fbm(u * 8, v * 8, 8, 3, 4);
      const blades = fbm(u * 90, v * 90, 90, 17, 2);
      const dry = fbm(u * 3, v * 3, 3, 41, 2);
      const i = (y * S + x) * 4;
      const g = 84 + n * 46 + blades * 26;
      img.data[i] = g * 0.55 + dry * 42;
      img.data[i + 1] = g * 0.95;
      img.data[i + 2] = g * 0.42;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, true);
}

export function createCloudTexture(): THREE.CanvasTexture {
  const S = 1024;
  const c = canvas(S);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const n = fbm(u * 6, v * 6, 6, 91, 5);
      const detail = fbm(u * 22, v * 22, 22, 12, 3);
      const a = Math.max(0, (n * 0.85 + detail * 0.15 - 0.52) * 3.4);
      const edge = Math.sin(v * Math.PI) * Math.sin(u * Math.PI);
      const i = (y * S + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255 * Math.pow(edge, 0.6));
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createCheckerTexture(): THREE.CanvasTexture {
  const c = canvas(256, 32);
  const ctx = c.getContext("2d")!;
  const cell = 32;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#f2f4f7" : "#0d0f12";
      ctx.fillRect(x * cell, y * (c.height / 2), cell, c.height / 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function textCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = canvas(width, height);
  return [c, c.getContext("2d")!];
}

export function createBannerTexture(main: string, sub: string, accent = "#ff5a1f"): THREE.CanvasTexture {
  const [c, ctx] = textCanvas(2048, 256);
  const grad = ctx.createLinearGradient(0, 0, 2048, 0);
  grad.addColorStop(0, "#0a0d12");
  grad.addColorStop(0.55, "#12161d");
  grad.addColorStop(1, "#0a0d12");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2048, 256);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 226, 2048, 10);
  ctx.font = "900 128px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f4f7fb";
  ctx.fillText(main, 1024, 110);
  ctx.font = "700 34px 'Segoe UI', Arial, sans-serif";
  ctx.fillStyle = accent;
  ctx.fillText(sub, 1024, 188);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createSponsorTexture(label: string, bg: string, fg: string): THREE.CanvasTexture {
  const [c, ctx] = textCanvas(1024, 256);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, 996, 228);
  ctx.fillStyle = fg;
  ctx.font = "900 92px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 512, 122);
  ctx.font = "700 26px 'Segoe UI', Arial, sans-serif";
  ctx.globalAlpha = 0.7;
  ctx.fillText("HORIZON MOTORSPORT SERIES", 512, 206);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createNumberDecal(number: number, accent: string): THREE.CanvasTexture {
  const c = canvas(256, 256);
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 104, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 150px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), 128, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft radial white sprite used for lamp/moon halos and additive glows. */
export function createGlowTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.85)");
  g.addColorStop(0.45, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c, true);
}

/** Elongated headlight pool projected on the tarmac. */
export function createHeadlightPoolTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 256;
  const c = canvas(W, H);
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(W / 2, 8, 4, W / 2, 8, 230);
  g.addColorStop(0, "rgba(255,246,214,1)");
  g.addColorStop(0.22, "rgba(255,240,196,0.72)");
  g.addColorStop(0.55, "rgba(255,232,178,0.24)");
  g.addColorStop(1, "rgba(255,226,160,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Narrow the pool towards the car nose.
  const img = ctx.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const half = (0.18 + t * 0.32) * W;
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x - W / 2);
      const edge = 1 - Math.min(1, Math.max(0, (d - half) / (W * 0.18)));
      const i = (y * W + x) * 4;
      img.data[i + 3] *= edge * (1 - t * 0.35);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
