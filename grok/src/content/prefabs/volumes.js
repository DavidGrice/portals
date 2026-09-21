import * as THREE from 'three';
import { buildMaterial, resolveMaterial } from '../materials.js';
import { makeRecipeTexture } from '../tiles.js';
import { addColonnade, addRectVolume, addStairs, addWallWithHoles } from '../volumes.js';
import { createGratingMaterial } from '../../optics/gratingMaterial.js';
import { wavelengthToRgb } from '../../optics/grating.js';
import {
  FRAME,
  addBox,
  addOpeningWall,
  addRunningLights,
  addSideWall,
  applyPose,
  attachRunningLights,
  foilMaterial,
  hydrateModel,
  paintCardPlate,
  paintYoungDiagram,
  parseColor,
  rotundaWallName,
  roundedRectPath,
  standardMaterial,
  surfaceMaterial,
  volumeMaterial,
} from './shared.js';

export const volumePrefabs = {
frame(entity) {
    const color = parseColor(entity.props?.color, 0xffffff);
    const group = new THREE.Group();
    group.userData.portalFrame = true;
    group.userData.coversPortalId = entity.props?.coversPortalId ?? null;
    applyPose(group, entity);

    const { outer, thickness, depth, walkUp, jambDepth, jambInner } = FRAME;
    const material = entity.props?.frameMaterial
      ? buildMaterial(entity.props.frameMaterial, { color })
      : standardMaterial(color, { roughness: 0.38, metalness: 0.72, clearcoat: 0.15 });
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    const lintels = [
      [0, outer / 2, walkUp, outer + thickness * 2, thickness, depth],
      [0, -outer / 2, walkUp, outer + thickness * 2, thickness, depth],
    ];
    const posts = [
      [-(outer / 2), 0, walkUp, thickness, outer, depth],
      [outer / 2, 0, walkUp, thickness, outer, depth],
    ];
    const jamb = (outer - jambInner) * 0.5;
    const liners = [
      [0, jambInner / 2 + jamb / 2, 0, jambInner + jamb * 2, jamb, jambDepth],
      [0, -(jambInner / 2 + jamb / 2), 0, jambInner + jamb * 2, jamb, jambDepth],
      [-(jambInner / 2 + jamb / 2), 0, 0, jamb, jambInner, jambDepth],
      [jambInner / 2 + jamb / 2, 0, 0, jamb, jambInner, jambDepth],
    ];

    const addPiece = (pose, { collide } = {}) => {
      const [x, y, z, sx, sy, sz] = pose;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (collide) {
        mesh.userData.collider = { type: 'aabb' };
      }
      group.add(mesh);
    };

    for (const pose of lintels) {
      addPiece(pose);
    }
    for (const pose of posts) {
      addPiece(pose, { collide: true });
    }
    for (const pose of liners) {
      addPiece(pose);
    }

    const glowColor = parseColor(entity.props?.glow, color);
    const glow = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lip = 0.03;
    const glowDepth = 0.04;
    const inner = jambInner;
    const glowPieces = [
      [0, inner / 2, walkUp + 0.02, inner, lip, glowDepth],
      [0, -inner / 2, walkUp + 0.02, inner, lip, glowDepth],
      [-(inner / 2), 0, walkUp + 0.02, lip, inner, glowDepth],
      [inner / 2, 0, walkUp + 0.02, lip, inner, glowDepth],
    ];
    for (const [x, y, z, sx, sy, sz] of glowPieces) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), glow);
      mesh.position.set(x, y, z);
      mesh.userData.portalGlow = true;
      group.add(mesh);
    }

    const occluder = new THREE.Mesh(
      new THREE.BoxGeometry(outer, outer, 0.05),
      standardMaterial(color, { roughness: 0.9, metalness: 0 }),
    );
    occluder.position.set(0, 0, -0.14);
    occluder.visible = false;
    occluder.userData.portalOccluder = true;
    group.add(occluder);

    return group;
  },

wall(entity) {
    const size = entity.props?.size ?? [4, 3, 0.24];
    const color = parseColor(entity.props?.color, 0x4a5160);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      surfaceMaterial(entity, color, { roughness: 0.9, metalness: 0.04, cells: 4 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    applyPose(mesh, entity);
    if (entity.props?.collide !== false) {
      mesh.userData.collider = { type: 'aabb' };
    }
    return mesh;
  },

opening(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const color = parseColor(entity.props?.color, 0x4a5160);
    const material = standardMaterial(color, { roughness: 0.9, metalness: 0.04 });
    addOpeningWall(group, material, {
      z: 0,
      halfX: entity.props?.halfX ?? 8,
      height: entity.props?.height ?? 3.2,
      thickness: entity.props?.thickness ?? 0.24,
      holeWidth: entity.props?.holeWidth ?? 2.5,
      holeHeight: entity.props?.holeHeight ?? 2.35,
    });
    return group;
  },

corridor(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const color = parseColor(entity.props?.color, 0x4a5160);
    const material = surfaceMaterial(entity, color, { roughness: 0.9, metalness: 0.04, cells: 4 });
    const halfX = entity.props?.halfX ?? 8;
    const zMin = entity.props?.zMin ?? -7;
    const zMax = entity.props?.zMax ?? 6;
    const height = entity.props?.height ?? 3.2;
    const thickness = entity.props?.thickness ?? 0.24;
    const holeWidth = entity.props?.holeWidth ?? 2.5;
    const holeHeight = entity.props?.holeHeight ?? 2.35;
    const openings = new Set((entity.props?.openings ?? []).map((entry) => Number(entry.z ?? entry)));
    const length = zMax - zMin;
    const midZ = (zMin + zMax) * 0.5;

    const sideOpenings = entity.props?.sideOpenings ?? [];
    const open = new Set(entity.props?.openWalls ?? []);
    if (!open.has('west')) {
      addSideWall(group, material, {
        x: -(halfX + thickness * 0.5),
        zMin,
        zMax,
        height,
        thickness,
        holes: sideOpenings.filter((hole) => Number(hole.side ?? -1) < 0),
      });
    }
    if (!open.has('east')) {
      addSideWall(group, material, {
        x: halfX + thickness * 0.5,
        zMin,
        zMax,
        height,
        thickness,
        holes: sideOpenings.filter((hole) => Number(hole.side ?? 1) > 0),
      });
    }
    addBox(group, material, 0, height + thickness * 0.5, midZ, halfX * 2 + thickness * 2, thickness, length, false);

    const wallZs = new Set([zMin, zMax, ...openings]);
    for (const z of wallZs) {
      const wall = z <= zMin ? 'north' : 'south';
      if (open.has(wall) && !openings.has(z)) {
        continue;
      }
      if (openings.has(z)) {
        addOpeningWall(group, material, { z, halfX, height, thickness, holeWidth, holeHeight });
      } else {
        addBox(group, material, 0, height * 0.5, z, halfX * 2, height, thickness);
      }
    }
    attachRunningLights(group, entity, {
      minX: -halfX, maxX: halfX, minZ: zMin, maxZ: zMax, height,
    });
    return group;
  },

chamber(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = volumeMaterial(entity);
    const halfX = entity.props?.halfX ?? 10;
    const zMin = entity.props?.zMin ?? -8;
    const zMax = entity.props?.zMax ?? 6;
    addRectVolume(group, material, {
      minX: -halfX,
      maxX: halfX,
      minZ: zMin,
      maxZ: zMax,
      height: entity.props?.height ?? 4,
      thickness: entity.props?.thickness ?? 0.24,
      holes: entity.props?.holes ?? [],
      openWalls: entity.props?.openWalls ?? [],
      roundCorners: entity.props?.roundCorners !== false,
      ceiling: entity.props?.ceiling !== false,
      floorHoles: entity.props?.floorHoles ?? [],
    });
    attachRunningLights(group, entity, {
      minX: -halfX, maxX: halfX, minZ: zMin, maxZ: zMax, height: entity.props?.height ?? 4,
    });
    group.userData.volume = { kind: 'chamber', halfX, zMin, zMax, open: entity.props?.openWalls ?? [] };
    return group;
  },

open(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = volumeMaterial(entity);
    const halfX = entity.props?.halfX ?? 10;
    const zMin = entity.props?.zMin ?? -9;
    const zMax = entity.props?.zMax ?? 6;
    const holes = entity.props?.holes ?? [];
    const holeWalls = new Set(holes.map((hole) => hole.wall));
    const openWalls = (entity.props?.openWalls ?? ['east', 'west']).filter((wall) => !holeWalls.has(wall));
    addRectVolume(group, material, {
      minX: -halfX,
      maxX: halfX,
      minZ: zMin,
      maxZ: zMax,
      height: entity.props?.height ?? 3.6,
      holes,
      openWalls,
      roundCorners: true,
      ceiling: false,
    });
    attachRunningLights(group, entity, {
      minX: -halfX, maxX: halfX, minZ: zMin, maxZ: zMax, height: entity.props?.height ?? 3.6,
    });
    group.userData.volume = { kind: 'open', halfX, zMin, zMax, openWalls };
    return group;
  },

arcade(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = volumeMaterial(entity);
    const halfX = entity.props?.halfX ?? 9;
    const zMin = entity.props?.zMin ?? -9;
    const zMax = entity.props?.zMax ?? 6;
    const height = entity.props?.height ?? 4.2;
    const holes = entity.props?.holes ?? [];
    addRectVolume(group, material, {
      minX: -halfX,
      maxX: halfX,
      minZ: zMin,
      maxZ: zMax,
      height,
      holes,
      openWalls: ['east', 'west'],
      roundCorners: true,
      ceiling: entity.props?.ceiling !== false,
    });
    addColonnade(group, material, { x: -halfX, z0: zMin + 1.2, z1: zMax - 1.2, height });
    addColonnade(group, material, { x: halfX, z0: zMin + 1.2, z1: zMax - 1.2, height });
    attachRunningLights(group, entity, { minX: -halfX, maxX: halfX, minZ: zMin, maxZ: zMax, height });
    group.userData.volume = { kind: 'arcade', halfX, zMin, zMax };
    return group;
  },

wing(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = volumeMaterial(entity);
    const height = entity.props?.height ?? 3.4;
    const thickness = entity.props?.thickness ?? 0.24;
    const holes = entity.props?.holes ?? [];
    addRectVolume(group, material, {
      minX: -4,
      maxX: 4,
      minZ: -8,
      maxZ: 4,
      height,
      thickness,
      holes: holes.filter((hole) => hole.wall !== 'east' || Number(hole.u ?? 0) < -1),
    });
    addRectVolume(group, material, {
      minX: 4,
      maxX: 12,
      minZ: -2,
      maxZ: 4,
      height,
      thickness,
      holes: holes.filter((hole) => hole.wall === 'east' || (hole.wall === 'north' && Number(hole.u ?? 0) > 4)),
      floor: true,
      ceiling: true,
    });
    group.userData.volume = { kind: 'wing' };
    return group;
  },

court(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = volumeMaterial(entity);
    const halfX = entity.props?.halfX ?? 11;
    const zMin = entity.props?.zMin ?? -10;
    const zMax = entity.props?.zMax ?? 6;
    const height = entity.props?.height ?? 4.4;
    const holes = entity.props?.holes ?? [];
    const holeWalls = new Set(holes.map((hole) => hole.wall));
    addRectVolume(group, material, {
      minX: -halfX,
      maxX: halfX,
      minZ: zMin,
      maxZ: zMax,
      height,
      holes,
      roundCorners: true,
      ceiling: false,
      openWalls: (entity.props?.openWalls ?? ['east', 'west']).filter((wall) => !holeWalls.has(wall)),
    });
    attachRunningLights(group, entity, { minX: -halfX, maxX: halfX, minZ: zMin, maxZ: zMax, height });
    group.userData.volume = { kind: 'court', halfX, zMin, zMax };
    return group;
  },

loft(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = volumeMaterial(entity);
    const halfX = entity.props?.halfX ?? 8;
    const zMin = entity.props?.zMin ?? -8;
    const zMax = entity.props?.zMax ?? 5;
    const height = entity.props?.height ?? 5.6;
    addRectVolume(group, material, {
      minX: -halfX,
      maxX: halfX,
      minZ: zMin,
      maxZ: zMax,
      height,
      holes: entity.props?.holes ?? [],
      openWalls: entity.props?.openWalls ?? [],
    });
    const stairEnd = -2.35;
    const walkZ0 = zMin + 0.35;
    const walkMid = (walkZ0 + stairEnd) * 0.5;
    const walkDepth = Math.max(1.6, Math.abs(stairEnd - walkZ0));
    addBox(group, material, 0, 2.25, walkMid, halfX * 2 - 0.8, 0.14, walkDepth);
    addBox(group, material, -halfX + 0.2, 2.72, walkMid, 0.1, 0.72, walkDepth);
    addBox(group, material, halfX - 0.2, 2.72, walkMid, 0.1, 0.72, walkDepth);
    addStairs(group, material, { x: 0, z0: 1.35, z1: stairEnd, y0: 0, y1: 2.18, width: 1.55, steps: 10 });
    attachRunningLights(group, entity, { minX: -halfX, maxX: halfX, minZ: zMin, maxZ: zMax, height });
    group.userData.volume = { kind: 'loft', halfX, zMin, zMax };
    return group;
  },

shaft(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = volumeMaterial(entity);
    const halfX = entity.props?.halfX ?? 5;
    const zMin = entity.props?.zMin ?? -5;
    const zMax = entity.props?.zMax ?? 5;
    const height = entity.props?.height ?? 10;
    addRectVolume(group, material, {
      minX: -halfX,
      maxX: halfX,
      minZ: zMin,
      maxZ: zMax,
      height,
      holes: entity.props?.holes ?? [],
      openWalls: entity.props?.openWalls ?? [],
      floorHoles: entity.props?.floorHoles ?? [],
    });
    addBox(group, material, -halfX + 1.3, 3.05, 0, 2.4, 0.18, 3.4);
    addBox(group, material, halfX - 1.3, 6.05, -0.6, 2.4, 0.18, 3.4);
    attachRunningLights(group, entity, { minX: -halfX, maxX: halfX, minZ: zMin, maxZ: zMax, height });
    group.userData.volume = { kind: 'shaft', halfX, zMin, zMax, height };
    return group;
  },

rotunda(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = volumeMaterial(entity);
    const radius = entity.props?.radius ?? 8;
    const height = entity.props?.height ?? 4.6;
    const thickness = entity.props?.thickness ?? 0.28;
    const holes = entity.props?.holes ?? [];
    addBox(group, material, 0, -thickness * 0.5, 0, radius * 2.1, thickness, radius * 2.1);
    addBox(group, material, 0, height + thickness * 0.5, 0, radius * 2.1, thickness, radius * 2.1, false);
    const sides = 8;
    for (let i = 0; i < sides; i += 1) {
      const angle = (i / sides) * Math.PI * 2 + Math.PI / sides;
      const wall = rotundaWallName(i);
      const hasHole = holes.some((hole) => hole.wall === wall);
      const x = Math.sin(angle) * radius;
      const z = -Math.cos(angle) * radius;
      const span = (2 * Math.PI * radius) / sides + 0.08;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(span, height, thickness),
        material,
      );
      mesh.position.set(x, height * 0.5, z);
      mesh.rotation.y = -angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.collider = { type: 'aabb' };
      if (hasHole) {
        mesh.scale.x = 0.35;
        mesh.position.y = height * 0.78;
        mesh.scale.y = 0.44;
      }
      group.add(mesh);
    }
    attachRunningLights(group, entity, {
      minX: -radius, maxX: radius, minZ: -radius, maxZ: radius, height,
    });
    group.userData.volume = { kind: 'rotunda', radius, height };
    return group;
  },

exhibit(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = volumeMaterial(entity);
    const inner = entity.props?.innerMaterial
      ? buildMaterial(entity.props.innerMaterial)
      : material;
    const radius = entity.props?.radius ?? 10;
    const height = entity.props?.height ?? 7.4;
    const thickness = entity.props?.thickness ?? 0.3;
    const sides = 16;
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.45, radius + 0.5, thickness, 48),
      material,
    );
    floor.position.y = -thickness * 0.5;
    floor.receiveShadow = true;
    floor.castShadow = false;
    floor.userData.collider = { type: 'aabb' };
    group.add(floor);
    const ceiling = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.45, radius + 0.45, thickness, 48),
      material,
    );
    ceiling.position.y = height + thickness * 0.5;
    ceiling.castShadow = false;
    group.add(ceiling);
    for (let i = 0; i < sides; i += 1) {
      const angle = (i / sides) * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const z = -Math.cos(angle) * radius;
      const span = (2 * Math.PI * radius) / sides + 0.05;
      const north = i === 0;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(span, height, thickness),
        i % 2 === 0 ? material : inner,
      );
      mesh.position.set(x, height * 0.5, z);
      mesh.rotation.y = -angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.collider = { type: 'aabb' };
      if (north) {
        mesh.scale.x = 0.28;
        mesh.position.y = height * 0.82;
        mesh.scale.y = 0.36;
      }
      group.add(mesh);
      if (!north) {
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, height - 0.3, 0.12),
          buildMaterial('optics.foil'),
        );
        rib.position.set(x * 0.985, height * 0.5, z * 0.985);
        rib.rotation.y = -angle;
        rib.castShadow = false;
        group.add(rib);
      }
    }
    attachRunningLights(group, entity, {
      minX: -radius, maxX: radius, minZ: -radius, maxZ: radius, height,
    });
    group.userData.volume = { kind: 'exhibit', radius, height };
    return group;
  },

plus(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = volumeMaterial(entity);
    const arm = entity.props?.arm ?? 3.6;
    const zMin = entity.props?.zMin ?? -10;
    const zMax = entity.props?.zMax ?? 8;
    const minX = entity.props?.minX ?? -10;
    const maxX = entity.props?.maxX ?? 10;
    const height = entity.props?.height ?? 4.2;
    const thickness = entity.props?.thickness ?? 0.24;
    const holes = entity.props?.holes ?? [
      { wall: 'north', u: 0 },
      { wall: 'south', u: 0 },
      { wall: 'west', u: 0 },
      { wall: 'east', u: 0 },
    ];
    const open = new Set(entity.props?.openWalls ?? []);
    addBox(group, material, (minX + maxX) * 0.5, -thickness * 0.5, (zMin + zMax) * 0.5, maxX - minX, thickness, zMax - zMin);
    if (entity.props?.ceiling !== false) {
      addBox(group, material, (minX + maxX) * 0.5, height + thickness * 0.5, (zMin + zMax) * 0.5, maxX - minX, thickness, zMax - zMin, false);
    }
    if (!open.has('north')) {
      addWallWithHoles(group, material, {
        wall: 'north', minX: -arm, maxX: arm, minZ: zMin, maxZ: zMax, height, thickness, holes,
      });
    }
    if (!open.has('south')) {
      addWallWithHoles(group, material, {
        wall: 'south', minX: -arm, maxX: arm, minZ: zMin, maxZ: zMax, height, thickness, holes,
      });
    }
    if (!open.has('west')) {
      addWallWithHoles(group, material, {
        wall: 'west', minX, maxX, minZ: -arm, maxZ: arm, height, thickness, holes,
      });
    }
    if (!open.has('east')) {
      addWallWithHoles(group, material, {
        wall: 'east', minX, maxX, minZ: -arm, maxZ: arm, height, thickness, holes,
      });
    }
    addBox(group, material, -arm, height * 0.5, (zMin - arm) * 0.5, thickness, height, Math.max(0.2, -arm - zMin));
    addBox(group, material, arm, height * 0.5, (zMin - arm) * 0.5, thickness, height, Math.max(0.2, -arm - zMin));
    addBox(group, material, -arm, height * 0.5, (zMax + arm) * 0.5, thickness, height, Math.max(0.2, zMax - arm));
    addBox(group, material, arm, height * 0.5, (zMax + arm) * 0.5, thickness, height, Math.max(0.2, zMax - arm));
    addBox(group, material, (minX - arm) * 0.5, height * 0.5, -arm, Math.max(0.2, -arm - minX), height, thickness);
    addBox(group, material, (minX - arm) * 0.5, height * 0.5, arm, Math.max(0.2, -arm - minX), height, thickness);
    addBox(group, material, (maxX + arm) * 0.5, height * 0.5, -arm, Math.max(0.2, maxX - arm), height, thickness);
    addBox(group, material, (maxX + arm) * 0.5, height * 0.5, arm, Math.max(0.2, maxX - arm), height, thickness);
    attachRunningLights(group, entity, { minX, maxX, minZ: zMin, maxZ: zMax, height });
    group.userData.volume = { kind: 'plus', arm, zMin, zMax, minX, maxX, height };
    return group;
  },
};
