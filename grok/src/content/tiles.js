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
  repeat = [4, 4],
} = {}) {
  const ctx = makeContext(size);
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  const step = size / cells;
  ctx.fillStyle = line;
  for (let i = 0; i < cells; i += 2) {
    ctx.fillRect(0, i * step, size, step * 0.35);
  }
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
