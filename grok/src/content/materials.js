import { MeshStandardMaterial } from 'three';
import materials from '../../data/materials.json' with { type: 'json' };
import { makeRecipeTexture } from './tiles.js';

export function listMaterials(library = materials) {
  return Object.keys(library?.materials ?? {});
}

export function getMaterialDef(id, library = materials) {
  if (!id) {
    return null;
  }
  return library.materials?.[id] ?? null;
}

export function resolveMaterial(id, { color, library = materials } = {}) {
  const def = getMaterialDef(id, library);
  const tint = parseColor(def?.color ?? color, 0x4a5160);
  return {
    id: def ? id : null,
    recipe: def?.recipe ?? 'tile',
    color: tint,
    line: def?.line ?? '#1a1d24',
    cells: def?.cells ?? 8,
    repeat: def?.repeat ?? [6, 6],
    roughness: def?.roughness ?? 0.82,
    metalness: def?.metalness ?? 0.08,
    emissive: parseColor(def?.emissive, 0x000000),
    emissiveIntensity: def?.emissiveIntensity ?? 0,
    mapPath: def?.map ?? null,
  };
}

export function buildMaterial(id, extras = {}) {
  const spec = resolveMaterial(id, extras);
  const map = extras.map ?? makeRecipeTexture(spec.recipe, {
    color: hex(spec.color),
    line: spec.line,
    cells: spec.cells,
    repeat: spec.repeat,
  });
  return new MeshStandardMaterial({
    color: spec.color,
    map,
    roughness: extras.roughness ?? spec.roughness,
    metalness: extras.metalness ?? spec.metalness,
    emissive: spec.emissive,
    emissiveIntensity: spec.emissiveIntensity,
  });
}

export function parseColor(value, fallback = 0xffffff) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return Number.parseInt(value.replace('#', ''), 16);
  }
  return fallback;
}

function hex(value) {
  return `#${Number(value).toString(16).padStart(6, '0')}`;
}
