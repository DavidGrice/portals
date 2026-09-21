import * as THREE from 'three';
import { buildMaterial, parseColor as parseMaterialColor, resolveMaterial } from '../materials.js';
import { makeRecipeTexture } from '../tiles.js';
import { addColonnade, addRectVolume, addStairs, addWallWithHoles } from '../volumes.js';
import { createGratingMaterial } from '../../optics/gratingMaterial.js';
import { wavelengthToRgb } from '../../optics/grating.js';

export function parseColor(value, fallback = 0xffffff) {
  return parseMaterialColor(value, fallback);
}

export function paintYoungDiagram(mesh) {
  if (typeof document === 'undefined') {
    return mesh;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return mesh;
  }
  ctx.fillStyle = '#041018';
  ctx.fillRect(0, 0, 768, 256);
  ctx.fillStyle = '#6ad8ff';
  ctx.font = '16px monospace';
  const panels = [
    { x: 20, title: '1 slit', slits: 1 },
    { x: 268, title: '2 slits', slits: 2 },
    { x: 516, title: 'N slits = grating', slits: 11 },
  ];
  for (const panel of panels) {
    ctx.fillText(panel.title, panel.x + 8, 28);
    ctx.strokeStyle = '#2a4050';
    ctx.strokeRect(panel.x, 40, 232, 200);
    const mid = panel.x + 116;
    for (let i = 0; i < panel.slits; i += 1) {
      const sx = mid - ((panel.slits - 1) * 7) + i * 14;
      ctx.fillRect(sx, 56, 3, 52);
    }
    ctx.fillStyle = '#3dff6a';
    const orders = panel.slits === 1 ? [0] : panel.slits === 2 ? [-1, 0, 1] : [-2, -1, 0, 1, 2];
    const width = panel.slits === 1 ? 36 : panel.slits === 2 ? 10 : 4;
    for (const m of orders) {
      const px = mid + m * (panel.slits === 1 ? 0 : 28);
      ctx.fillRect(px - width * 0.5, 130, width, 88 / (1 + Math.abs(m) * 0.35));
    }
    ctx.fillStyle = '#6ad8ff';
  }
  const texture = new THREE.CanvasTexture(canvas);
  mesh.material.map = texture;
  mesh.material.color.setHex(0xffffff);
  mesh.material.needsUpdate = true;
  return mesh;
}

export function applyPose(object, entity) {
  if (entity.position) {
    object.position.set(...entity.position);
  }
  if (entity.rotation) {
    object.rotation.set(...entity.rotation);
  }
}

const runningLightMaterials = new Map();

export function runningLightMaterial(materialId) {
  let material = runningLightMaterials.get(materialId);
  if (!material) {
    material = buildMaterial(materialId, { roughness: 0.16, metalness: 0.28 });
    if (material.emissiveIntensity < 1.2) {
      material.emissiveIntensity = 1.35;
    }
    runningLightMaterials.set(materialId, material);
  }
  return material;
}

export function addRunningLights(group, {
  minX,
  maxX,
  minZ,
  maxZ,
  height = 4,
  y0 = 0,
  materialId,
  speed = 0.32,
} = {}) {
  if (!materialId || !group) {
    return;
  }
  const inset = 0.11;
  const t = 0.05;
  const x0 = (minX + maxX) * 0.5;
  const z0 = (minZ + maxZ) * 0.5;
  const innerW = Math.max(0.5, maxX - minX - inset * 2);
  const innerD = Math.max(0.5, maxZ - minZ - inset * 2);
  const yFloor = y0 + 0.07;
  const yCeil = y0 + Math.max(height - 0.08, yFloor + 0.4);
  const yMid = y0 + height * 0.5;
  const segments = [
    { p: [x0, yFloor, minZ + inset], s: [innerW, t, t], scroll: [speed, 0] },
    { p: [x0, yFloor, maxZ - inset], s: [innerW, t, t], scroll: [-speed, 0] },
    { p: [minX + inset, yFloor, z0], s: [t, t, innerD], scroll: [0, speed] },
    { p: [maxX - inset, yFloor, z0], s: [t, t, innerD], scroll: [0, -speed] },
    { p: [x0, yCeil, minZ + inset], s: [innerW, t, t], scroll: [-speed, 0] },
    { p: [x0, yCeil, maxZ - inset], s: [innerW, t, t], scroll: [speed, 0] },
    { p: [minX + inset, yCeil, z0], s: [t, t, innerD], scroll: [0, -speed] },
    { p: [maxX - inset, yCeil, z0], s: [t, t, innerD], scroll: [0, speed] },
    { p: [minX + inset, yMid, minZ + inset], s: [t, height - 0.18, t], scroll: [0, speed * 0.55] },
    { p: [maxX - inset, yMid, minZ + inset], s: [t, height - 0.18, t], scroll: [0, speed * 0.55] },
    { p: [minX + inset, yMid, maxZ - inset], s: [t, height - 0.18, t], scroll: [0, -speed * 0.55] },
    { p: [maxX - inset, yMid, maxZ - inset], s: [t, height - 0.18, t], scroll: [0, -speed * 0.55] },
  ];
  const mat = runningLightMaterial(materialId);
  for (const spec of segments) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...spec.s), mat);
    mesh.position.set(...spec.p);
    if (!mat.userData.runningScroll) {
      mesh.userData.scroll = spec.scroll;
      mat.userData.runningScroll = true;
    }
    mesh.userData.runningLight = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }
}

export function attachRunningLights(group, entity, bounds) {
  if (entity.props?.runningLights === false) {
    return;
  }
  const materialId = entity.props?.stripMaterial
    ?? (entity.props?.runningLights ? 'cyber.strip.cyan' : null);
  if (!materialId) {
    return;
  }
  addRunningLights(group, { ...bounds, materialId });
}

export const FRAME = {
  outer: 2.16,
  thickness: 0.08,
  depth: 0.1,
  walkUp: 0.08,
  jambDepth: 0.16,
  jambInner: 1.88,
};

export function standardMaterial(color, extras = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    map: extras.map ?? null,
    roughness: extras.roughness ?? 0.82,
    metalness: extras.metalness ?? 0.08,
    emissive: extras.emissive ?? 0x000000,
    emissiveIntensity: extras.emissiveIntensity ?? 0,
  });
}

export function volumeMaterial(entity) {
  const color = parseColor(entity.props?.color, 0x4a5160);
  return surfaceMaterial(entity, color, { roughness: 0.9, metalness: 0.04, cells: 4 });
}

export function rotundaWallName(index) {
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][index] ?? 'north';
}

export function roundedRectPath(Ctor, width, height, radius) {
  const path = new Ctor();
  const x = -width * 0.5;
  const y = -height * 0.5;
  const r = Math.min(radius, width * 0.22, height * 0.16);
  path.moveTo(x + r, y);
  path.lineTo(x + width - r, y);
  path.quadraticCurveTo(x + width, y, x + width, y + r);
  path.lineTo(x + width, y + height - r);
  path.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  path.lineTo(x + r, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

export function foilMaterial(id) {
  const material = buildMaterial(id);
  material.iridescence = 1;
  material.iridescenceIOR = 1.18;
  if (material.iridescenceThicknessRange?.set) {
    material.iridescenceThicknessRange.set(140, 520);
  }
  material.clearcoat = Math.max(material.clearcoat ?? 0, 0.72);
  material.clearcoatRoughness = 0.14;
  return material;
}

export function paintCardPlate(mesh, text) {
  if (!mesh?.material || typeof document === 'undefined') {
    return mesh;
  }
  const line = String(text ?? '');
  if (mesh.userData.plateText === line && mesh.userData.platePainted) {
    return mesh;
  }
  mesh.userData.plateText = line;
  let canvas = mesh.userData.plateCanvas;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    mesh.userData.plateCanvas = canvas;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return mesh;
  }
  ctx.fillStyle = '#120e08';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#e8c86a';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = '#f0d080';
  ctx.font = 'bold 36px serif';
  ctx.textAlign = 'center';
  ctx.fillText(line.slice(0, 28), canvas.width * 0.5, 58);
  if (!mesh.userData.plateTexture) {
    mesh.userData.plateTexture = new THREE.CanvasTexture(canvas);
    mesh.material.map = mesh.userData.plateTexture;
    mesh.material.color.setHex(0xffffff);
  }
  mesh.userData.plateTexture.needsUpdate = true;
  mesh.userData.platePainted = true;
  mesh.material.needsUpdate = true;
  return mesh;
}

export function surfaceMaterial(entity, fallbackColor, extras = {}) {
  if (entity.props?.material) {
    return buildMaterial(entity.props.material, { color: fallbackColor, ...extras });
  }
  const color = parseColor(entity.props?.color, fallbackColor);
  return standardMaterial(color, {
    ...extras,
    map: extras.map ?? makeRecipeTexture('tile', {
      color: `#${color.toString(16).padStart(6, '0')}`,
      line: extras.line ?? '#2a2e38',
      cells: extras.cells ?? 8,
    }),
  });
}


export function addBox(group, material, x, y, z, sx, sy, sz, collide = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (collide) {
    mesh.userData.collider = { type: 'aabb' };
  }
  group.add(mesh);
}

export function addSideWall(group, material, { x, zMin, zMax, height, thickness, holes }) {
  const holeWidth = 2.5;
  const holeHeight = 2.35;
  if (!holes.length) {
    addBox(group, material, x, height * 0.5, (zMin + zMax) * 0.5, thickness, height, zMax - zMin);
    return;
  }
  const cuts = holes
    .map((hole) => Number(hole.z))
    .sort((a, b) => a - b);
  let cursor = zMin;
  for (const z of cuts) {
    const start = z - holeWidth * 0.5;
    const end = z + holeWidth * 0.5;
    if (start - cursor > 0.08) {
      addBox(group, material, x, height * 0.5, (cursor + start) * 0.5, thickness, height, start - cursor);
    }
    const lintel = Math.max(height - holeHeight, 0.08);
    addBox(group, material, x, holeHeight + lintel * 0.5, z, thickness, lintel, holeWidth);
    cursor = end;
  }
  if (zMax - cursor > 0.08) {
    addBox(group, material, x, height * 0.5, (cursor + zMax) * 0.5, thickness, height, zMax - cursor);
  }
}

export function addOpeningWall(group, material, { z, halfX, height, thickness, holeWidth, holeHeight }) {
  const holeHalf = holeWidth * 0.5;
  const sideWidth = Math.max(halfX - holeHalf, 0.1);
  addBox(group, material, -halfX + sideWidth * 0.5, height * 0.5, z, sideWidth, height, thickness);
  addBox(group, material, halfX - sideWidth * 0.5, height * 0.5, z, sideWidth, height, thickness);
  const lintel = Math.max(height - holeHeight, 0.08);
  addBox(group, material, 0, holeHeight + lintel * 0.5, z, holeWidth, lintel, thickness);
}

export async function hydrateModel(group, { load } = {}) {
  const src = group?.userData?.model?.src;
  if (!src) {
    return false;
  }
  const proxy = group.children.find((child) => child.userData?.modelProxy);
  try {
    const scene = load
      ? await load(src)
      : await import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new Promise((resolve, reject) => {
        new GLTFLoader().load(src, (gltf) => resolve(gltf.scene), undefined, reject);
      }));
    if (!scene) {
      return false;
    }
    const wanted = group.userData.model?.size ?? [1, 1, 1];
    const box = new THREE.Box3().setFromObject(scene);
    const have = new THREE.Vector3();
    box.getSize(have);
    const maxHave = Math.max(have.x, have.y, have.z, 0.001);
    const maxWant = Math.max(wanted[0] ?? 1, wanted[1] ?? 1, wanted[2] ?? 1);
    scene.scale.multiplyScalar(maxWant / maxHave);
    box.setFromObject(scene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    scene.position.sub(center);
    scene.position.y += (wanted[1] ?? 1) * 0.5;
    const importedLights = [];
    scene.traverse((child) => {
      if (child.isLight) {
        importedLights.push(child);
      }
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    for (const light of importedLights) {
      light.parent?.remove(light);
    }
    if (proxy) {
      proxy.visible = false;
    }
    group.add(scene);
    return true;
  } catch {
    if (proxy) {
      proxy.visible = true;
    }
    return false;
  }
}
