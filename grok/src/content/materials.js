import { MeshPhysicalMaterial, RepeatWrapping, SRGBColorSpace, Vector2 } from 'three';
import materials from '../../data/materials.json' with { type: 'json' };
import { makeCloudTexture, makeRecipePbr, makeRecipeTexture } from './tiles.js';

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
    roughnessMapPath: def?.roughnessMap ?? null,
    normalMapPath: def?.normalMap ?? null,
    surface: def?.surface ?? null,
    clearcoat: def?.clearcoat ?? 0,
    sheen: def?.sheen ?? 0,
    envMapIntensity: def?.envMapIntensity ?? 0.55,
    ior: def?.ior ?? 1.5,
    transmission: def?.transmission ?? 0,
    overlay: def?.overlay ?? null,
  };
}

export function buildMaterial(id, extras = {}) {
  const spec = resolveMaterial(id, extras);
  const pbr = extras.map
    ? { map: extras.map, roughnessMap: extras.roughnessMap ?? null, normalMap: extras.normalMap ?? null }
    : (makeRecipePbr(spec.recipe, {
      color: hex(spec.color),
      line: spec.line,
      cells: spec.cells,
      repeat: spec.repeat,
    }) ?? { map: makeRecipeTexture(spec.recipe, {
      color: hex(spec.color),
      line: spec.line,
      cells: spec.cells,
      repeat: spec.repeat,
    }) });
  const hasMap = Boolean(pbr.map);
  const material = new MeshPhysicalMaterial({
    color: hasMap ? 0xffffff : spec.color,
    map: pbr.map ?? null,
    roughnessMap: pbr.roughnessMap ?? null,
    normalMap: pbr.normalMap ?? null,
    normalScale: new Vector2(0.65, 0.65),
    roughness: extras.roughness ?? spec.roughness,
    metalness: extras.metalness ?? spec.metalness,
    emissive: spec.emissive,
    emissiveIntensity: spec.emissiveIntensity,
    clearcoat: spec.clearcoat,
    sheen: spec.sheen,
    sheenColor: spec.sheen ? spec.color : 0x000000,
    envMapIntensity: spec.envMapIntensity,
    ior: spec.ior,
    transmission: spec.transmission,
    thickness: spec.transmission ? 0.08 : 0,
    transparent: spec.transmission > 0,
  });
  if (spec.overlay === 'cloud' || spec.overlay === 'dirt') {
    applyCloudOverlay(material, spec);
  }
  material.userData.materialSpec = spec;
  if (extras.loader && spec.mapPath) {
    hydrateMaterialMaps(material, spec, extras);
  }
  return material;
}

export function hydrateMaterialMaps(material, spec, { loader, anisotropy = 8 } = {}) {
  const path = spec?.mapPath;
  if (!material || !path || !loader?.load) {
    return material;
  }
  try {
    const apply = (texture, key, colorSpace) => {
      if (!texture) {
        return;
      }
      if ('wrapS' in texture) {
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
      }
      if (texture.repeat?.set) {
        texture.repeat.set(spec.repeat?.[0] ?? 1, spec.repeat?.[1] ?? 1);
      }
      if (colorSpace) {
        texture.colorSpace = colorSpace;
      }
      texture.anisotropy = anisotropy;
      material[key] = texture;
    };
    apply(loader.load(path), 'map', SRGBColorSpace);
    if (spec.roughnessMapPath) {
      apply(loader.load(spec.roughnessMapPath), 'roughnessMap', null);
    }
    if (spec.normalMapPath) {
      apply(loader.load(spec.normalMapPath), 'normalMap', null);
    }
    material.color.setHex(0xffffff);
    material.needsUpdate = true;
  } catch {
    // recipe maps stay
  }
  return material;
}

export function hydrateRoomMaterials(rooms, { loader = null, anisotropy = 8 } = {}) {
  if (!loader) {
    return 0;
  }
  let count = 0;
  for (const room of rooms ?? []) {
    room.scene?.traverse((object) => {
      const spec = object.material?.userData?.materialSpec;
      if (!spec?.mapPath) {
        return;
      }
      hydrateMaterialMaps(object.material, spec, { loader, anisotropy });
      count += 1;
    });
  }
  return count;
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

export function tickMaterials(rooms, dt = 0.016) {
  if (!rooms?.length) {
    return 0;
  }
  let count = 0;
  for (const room of rooms) {
    room.scene?.traverse((object) => {
      const spin = object.userData?.spin;
      if (spin) {
        object.rotation.x += (spin[0] ?? 0) * dt;
        object.rotation.y += (spin[1] ?? 0) * dt;
        object.rotation.z += (spin[2] ?? 0) * dt;
        count += 1;
      }
      const scroll = object.userData?.scroll;
      const maps = [object.material?.map, object.material?.roughnessMap, object.material?.normalMap];
      if (!scroll) {
        return;
      }
      for (const map of maps) {
        if (!map) {
          continue;
        }
        map.offset.x = (map.offset.x + (scroll[0] ?? 0) * dt) % 1;
        map.offset.y = (map.offset.y + (scroll[1] ?? 0) * dt) % 1;
      }
      count += 1;
    });
  }
  return count;
}

function applyCloudOverlay(material, spec) {
  const cloud = makeCloudTexture({
    color: spec.line,
    line: spec.line,
    repeat: spec.repeat,
  });
  if (!cloud || !material.map) {
    if (cloud) {
      material.alphaMap = cloud;
    }
    return;
  }
  material.aoMap = cloud;
  material.aoMapIntensity = 0.85;
}

function hex(value) {
  return `#${Number(value).toString(16).padStart(6, '0')}`;
}
