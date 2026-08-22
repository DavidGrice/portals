import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { makePbrSet, PBR_RECIPES } from './tiles-pbr.js';

export function makeRecipeTexture(recipe = 'tile', options = {}) {
  if (PBR_RECIPES.includes(recipe)) {
    return makePbrSet(recipe, options)?.map ?? makeTileTexture(options);
  }
  if (recipe === 'circuit') {
    return makeCircuitTexture(options);
  }
  if (recipe === 'stripe') {
    return makeStripeTexture(options);
  }
  if (recipe === 'speckle') {
    return makeSpeckleTexture(options);
  }
  if (recipe === 'cloud') {
    return makeCloudTexture(options);
  }
  return makeTileTexture(options);
}

export function makeRecipePbr(recipe = 'tile', options = {}) {
  if (PBR_RECIPES.includes(recipe)) {
    return makePbrSet(recipe, options);
  }
  const map = makeRecipeTexture(recipe, options);
  return { map, roughnessMap: null, normalMap: null };
}

export function makeTileTexture({
  color = '#4a5160',
  line = '#2a2e38',
  cells = 8,
  size = 256,
  repeat = [6, 6],
} = {}) {
  const ctx = makeContext(size);
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  const step = size / cells;
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  for (let i = 0; i <= cells; i += 1) {
    const p = i * step + 0.5;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      if ((x + y) % 2 === 0) {
        ctx.fillRect(x * step, y * step, step, step);
      }
    }
  }
  return finishTexture(ctx.canvas, repeat);
}

export function makeCircuitTexture({
  color = '#041018',
  line = '#2ee6ff',
  cells = 10,
  size = 256,
  repeat = [8, 8],
} = {}) {
  const ctx = makeContext(size);
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  const step = size / cells;
  ctx.strokeStyle = line;
  ctx.shadowColor = line;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 2;
  for (let i = 0; i <= cells; i += 1) {
    const p = i * step + 0.5;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = line;
  for (let i = 0; i <= cells; i += 1) {
    for (let j = 0; j <= cells; j += 1) {
      ctx.fillRect(i * step - 1.5, j * step - 1.5, 3, 3);
    }
  }
  return finishTexture(ctx.canvas, repeat);
}

export function makeStripeTexture({
  color = '#2a3038',
  line = '#6a8090',
  cells = 8,
  size = 256,
  repeat = [10, 1],
} = {}) {
  const ctx = makeContext(size);
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, size, size);
  const dashes = Math.max(6, cells);
  const step = size / dashes;
  for (let i = 0; i < dashes; i += 1) {
    const hot = i % 4 === 0;
    ctx.fillStyle = hot ? line : color;
    ctx.globalAlpha = hot ? 1 : 0.45;
    ctx.fillRect(0, i * step, size, step * (hot ? 0.42 : 0.18));
    if (hot) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, i * step, size, step * 0.08);
    }
  }
  ctx.globalAlpha = 1;
  return finishTexture(ctx.canvas, repeat);
}

export function makeSpeckleTexture({
  color = '#5a5348',
  line = '#3a342c',
  cells = 6,
  size = 256,
  repeat = [5, 5],
} = {}) {
  const ctx = makeContext(size);
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  let seed = 1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < cells * 48; i += 1) {
    ctx.fillStyle = i % 3 === 0 ? line : 'rgba(255,255,255,0.06)';
    const x = rand() * size;
    const y = rand() * size;
    const r = 1 + rand() * 2.4;
    ctx.fillRect(x, y, r, r);
  }
  return finishTexture(ctx.canvas, repeat);
}

export function makeCloudTexture({
  color = '#3a342c',
  line = '#8a8074',
  size = 256,
  repeat = [3, 3],
} = {}) {
  const ctx = makeContext(size);
  if (!ctx) {
    return null;
  }
  const image = ctx.createImageData(size, size);
  let seed = 19;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const noise = (x, y, s) => {
    const xs = x / s;
    const ys = y / s;
    const x0 = Math.floor(xs);
    const y0 = Math.floor(ys);
    const fx = xs - x0;
    const fy = ys - y0;
    const n = (ix, iy) => {
      const k = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
      return k - Math.floor(k);
    };
    const a = n(x0, y0);
    const b = n(x0 + 1, y0);
    const c = n(x0, y0 + 1);
    const d = n(x0 + 1, y0 + 1);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    return a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let v = 0;
      let amp = 0.5;
      let s = 48;
      for (let o = 0; o < 5; o += 1) {
        v += noise(x, y, s) * amp;
        s *= 0.5;
        amp *= 0.5;
      }
      v = Math.max(0, Math.min(1, (v - 0.42) * 2.2));
      const i = (y * size + x) * 4;
      const stain = Math.round(v * 180);
      image.data[i] = stain;
      image.data[i + 1] = stain;
      image.data[i + 2] = stain;
      image.data[i + 3] = Math.round(v * 220);
    }
  }
  ctx.putImageData(image, 0, 0);
  void color;
  void line;
  void rand;
  return finishTexture(ctx.canvas, repeat);
}

function makeContext(size) {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas.getContext('2d');
}

function finishTexture(canvas, repeat = [6, 6]) {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat[0] ?? 6, repeat[1] ?? 6);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
