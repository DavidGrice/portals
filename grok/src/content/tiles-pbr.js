import { CanvasTexture, LinearSRGBColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';

function makeContext(size) {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas.getContext('2d', { willReadFrequently: true });
}

function rng(seed = 1) {
  let state = (Number(seed) || 1) >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function hash2(x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  return (Math.imul(n, 1274126177) >>> 0) / 4294967296;
}

function valueNoise(x, y, scale) {
  const xs = x / scale;
  const ys = y / scale;
  const x0 = Math.floor(xs);
  const y0 = Math.floor(ys);
  const fx = xs - x0;
  const fy = ys - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy;
}

function fbm(x, y, octaves = 4, scale = 32) {
  let sum = 0;
  let amp = 0.5;
  let s = scale;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x, y, s) * amp;
    s *= 0.5;
    amp *= 0.5;
  }
  return sum;
}

function hexRgb(hex) {
  const n = Number.parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function finish(canvas, { repeat = [4, 4], colorSpace = SRGBColorSpace, anisotropy = 8 } = {}) {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat[0] ?? 4, repeat[1] ?? 4);
  texture.colorSpace = colorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

export function heightToNormal(height, strength = 2.4) {
  const { width: w, height: h } = height;
  const src = height.getContext('2d').getImageData(0, 0, w, h).data;
  const out = height.createImageData(w, h);
  const sample = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * strength;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = Math.round(((-dx * inv) * 0.5 + 0.5) * 255);
      out.data[i + 1] = Math.round(((-dy * inv) * 0.5 + 0.5) * 255);
      out.data[i + 2] = Math.round((1 * inv * 0.5 + 0.5) * 255);
      out.data[i + 3] = 255;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').putImageData(out, 0, 0);
  return canvas;
}

export function heightToRoughness(height, { invert = false, contrast = 1.1, lift = 0.28 } = {}) {
  const { width: w, height: h } = height;
  const src = height.getContext('2d').getImageData(0, 0, w, h).data;
  const out = height.createImageData(w, h);
  for (let i = 0; i < src.length; i += 4) {
    let v = src[i] / 255;
    v = invert ? 1 - v : v;
    v = Math.max(0, Math.min(1, (v - 0.5) * contrast + 0.5));
    v = lift + v * (1 - lift);
    const g = Math.round(v * 255);
    out.data[i] = g;
    out.data[i + 1] = g;
    out.data[i + 2] = g;
    out.data[i + 3] = 255;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').putImageData(out, 0, 0);
  return canvas;
}

function fillAlbedo(ctx, size, color, line, shadeFn) {
  const [r, g, b] = hexRgb(color);
  const [lr, lg, lb] = hexRgb(line);
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = shadeFn(x, y);
      const i = (y * size + x) * 4;
      image.data[i] = Math.round(mix(r, lr, t));
      image.data[i + 1] = Math.round(mix(g, lg, t));
      image.data[i + 2] = Math.round(mix(b, lb, t));
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function writeHeight(ctx, size, fn) {
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const v = Math.max(0, Math.min(1, fn(x, y)));
      const g = Math.round(v * 255);
      const i = (y * size + x) * 4;
      image.data[i] = g;
      image.data[i + 1] = g;
      image.data[i + 2] = g;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

export function makeWoodSet({
  color = '#6a4a28',
  line = '#3a2814',
  size = 256,
  repeat = [4, 4],
  cells = 8,
} = {}) {
  const albedo = makeContext(size);
  const height = makeContext(size);
  if (!albedo || !height) {
    return { map: null, roughnessMap: null, normalMap: null };
  }
  const boards = Math.max(4, cells);
  const boardW = size / boards;
  fillAlbedo(albedo, size, color, line, (x, y) => {
    const board = Math.floor(x / boardW);
    const grain = fbm(x * 0.35 + board * 17, y * 2.4, 5, 18);
    const ring = Math.abs(Math.sin((y + board * 40) * 0.11 + grain * 4)) * 0.18;
    const gap = x % boardW < 1.6 ? 0.55 : 0;
    return Math.max(0, Math.min(1, grain * 0.55 + ring + gap));
  });
  writeHeight(height, size, (x, y) => {
    const board = Math.floor(x / boardW);
    const grain = fbm(x * 0.35 + board * 17, y * 2.4, 5, 18);
    const gap = x % boardW < 1.6 ? 0.15 : 0.62 + grain * 0.3;
    return gap;
  });
  return pack(albedo, height, repeat, 2.8, { invert: true, lift: 0.32 });
}

export function makePlasterSet({
  color = '#8a8074',
  line = '#5a5248',
  size = 256,
  repeat = [3, 3],
} = {}) {
  const albedo = makeContext(size);
  const height = makeContext(size);
  if (!albedo || !height) {
    return emptySet();
  }
  fillAlbedo(albedo, size, color, line, (x, y) => {
    const n = fbm(x, y, 5, 40);
    const crack = Math.abs(Math.sin(x * 0.07 + n * 6) * Math.cos(y * 0.05)) ** 8;
    return n * 0.45 + crack * 0.5;
  });
  writeHeight(height, size, (x, y) => {
    const n = fbm(x, y, 5, 40);
    const crack = Math.abs(Math.sin(x * 0.07 + n * 6) * Math.cos(y * 0.05)) ** 8;
    return 0.55 + n * 0.3 - crack * 0.35;
  });
  return pack(albedo, height, repeat, 1.6, { lift: 0.5 });
}

export function makeBrickSet({
  color = '#4a2824',
  line = '#2a1814',
  size = 256,
  repeat = [3, 3],
} = {}) {
  const albedo = makeContext(size);
  const height = makeContext(size);
  if (!albedo || !height) {
    return emptySet();
  }
  const bw = size / 6;
  const bh = size / 8;
  fillAlbedo(albedo, size, color, line, (x, y) => {
    const row = Math.floor(y / bh);
    const ox = row % 2 === 0 ? 0 : bw * 0.5;
    const lx = (x + ox) % bw;
    const ly = y % bh;
    const mortar = lx < 2.2 || ly < 2.2 ? 0.72 : 0;
    const n = fbm(x + row * 9, y, 3, 16);
    return mortar + n * 0.28;
  });
  writeHeight(height, size, (x, y) => {
    const row = Math.floor(y / bh);
    const ox = row % 2 === 0 ? 0 : bw * 0.5;
    const lx = (x + ox) % bw;
    const ly = y % bh;
    return lx < 2.2 || ly < 2.2 ? 0.25 : 0.7 + fbm(x, y, 3, 16) * 0.2;
  });
  return pack(albedo, height, repeat, 3.2, { invert: false, lift: 0.4 });
}

export function makeStoneSet({
  color = '#5a5348',
  line = '#3a342c',
  size = 256,
  repeat = [3, 3],
} = {}) {
  const albedo = makeContext(size);
  const height = makeContext(size);
  if (!albedo || !height) {
    return emptySet();
  }
  fillAlbedo(albedo, size, color, line, (x, y) => {
    const n = fbm(x, y, 6, 48);
    const cell = fbm(x * 0.4, y * 0.4, 2, 80);
    const edge = Math.abs(Math.sin(cell * 18));
    return n * 0.55 + (edge < 0.12 ? 0.35 : 0);
  });
  writeHeight(height, size, (x, y) => {
    const n = fbm(x, y, 6, 48);
    const cell = fbm(x * 0.4, y * 0.4, 2, 80);
    const edge = Math.abs(Math.sin(cell * 18));
    return edge < 0.12 ? 0.3 : 0.55 + n * 0.35;
  });
  return pack(albedo, height, repeat, 2.4, { lift: 0.38 });
}

export function makeMetalSet({
  color = '#2a2c2e',
  line = '#6a8090',
  size = 256,
  repeat = [2, 2],
} = {}) {
  const albedo = makeContext(size);
  const height = makeContext(size);
  if (!albedo || !height) {
    return emptySet();
  }
  fillAlbedo(albedo, size, color, line, (x, y) => {
    const scratch = Math.abs(Math.sin((y + x * 0.08) * 0.7 + fbm(x, y, 2, 20) * 8)) ** 16;
    const n = fbm(x, y, 4, 28);
    return n * 0.35 + scratch * 0.55;
  });
  writeHeight(height, size, (x, y) => {
    const scratch = Math.abs(Math.sin((y + x * 0.08) * 0.7 + fbm(x, y, 2, 20) * 8)) ** 16;
    return 0.5 + fbm(x, y, 4, 28) * 0.2 - scratch * 0.25;
  });
  return pack(albedo, height, repeat, 1.8, { invert: true, lift: 0.18, contrast: 1.4 });
}

export function makeFabricSet({
  color = '#4a1828',
  line = '#2a1018',
  size = 256,
  repeat = [2, 2],
} = {}) {
  const albedo = makeContext(size);
  const height = makeContext(size);
  if (!albedo || !height) {
    return emptySet();
  }
  fillAlbedo(albedo, size, color, line, (x, y) => {
    const weave = ((x + y) % 4 < 2 ? 0.12 : 0) + ((x - y) % 6 < 2 ? 0.08 : 0);
    return fbm(x, y, 3, 22) * 0.35 + weave;
  });
  writeHeight(height, size, (x, y) => 0.45 + (((x + y) % 4 < 2 ? 0.12 : 0)) + fbm(x, y, 3, 22) * 0.2);
  return pack(albedo, height, repeat, 1.2, { lift: 0.55 });
}

export function makeDirtSet({
  color = '#6a4a28',
  line = '#3a2814',
  size = 256,
  repeat = [3, 3],
} = {}) {
  const albedo = makeContext(size);
  const height = makeContext(size);
  if (!albedo || !height) {
    return emptySet();
  }
  const roll = rng(42);
  fillAlbedo(albedo, size, color, line, (x, y) => fbm(x + roll() * 0, y, 6, 36));
  writeHeight(height, size, (x, y) => 0.4 + fbm(x, y, 6, 36) * 0.5);
  return pack(albedo, height, repeat, 2.1, { lift: 0.45 });
}

function emptySet() {
  return { map: null, roughnessMap: null, normalMap: null };
}

function pack(albedoCtx, heightCtx, repeat, normalStrength, roughnessOpts) {
  const map = finish(albedoCtx.canvas, { repeat, colorSpace: SRGBColorSpace });
  const roughnessMap = finish(heightToRoughness(heightCtx.canvas, roughnessOpts), {
    repeat,
    colorSpace: LinearSRGBColorSpace,
  });
  const normalMap = finish(heightToNormal(heightCtx.canvas, normalStrength), {
    repeat,
    colorSpace: LinearSRGBColorSpace,
  });
  return { map, roughnessMap, normalMap };
}

export function makePbrSet(recipe, options = {}) {
  if (recipe === 'wood') {
    return makeWoodSet(options);
  }
  if (recipe === 'plaster') {
    return makePlasterSet(options);
  }
  if (recipe === 'brick') {
    return makeBrickSet(options);
  }
  if (recipe === 'stone') {
    return makeStoneSet(options);
  }
  if (recipe === 'metal') {
    return makeMetalSet(options);
  }
  if (recipe === 'fabric') {
    return makeFabricSet(options);
  }
  if (recipe === 'dirt') {
    return makeDirtSet(options);
  }
  return null;
}

export const PBR_RECIPES = ['wood', 'plaster', 'brick', 'stone', 'metal', 'fabric', 'dirt'];
