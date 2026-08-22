import * as THREE from 'three';
import { buildMaterial, parseColor as parseMaterialColor, resolveMaterial } from './materials.js';
import { makeRecipeTexture } from './tiles.js';
import { addColonnade, addRectVolume, addStairs, addWallWithHoles } from './volumes.js';

export function parseColor(value, fallback = 0xffffff) {
  return parseMaterialColor(value, fallback);
}

function applyPose(object, entity) {
  if (entity.position) {
    object.position.set(...entity.position);
  }
  if (entity.rotation) {
    object.rotation.set(...entity.rotation);
  }
}

export const FRAME = {
  outer: 2.16,
  thickness: 0.08,
  depth: 0.1,
  walkUp: 0.08,
  jambDepth: 0.16,
  jambInner: 1.88,
};

function standardMaterial(color, extras = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    map: extras.map ?? null,
    roughness: extras.roughness ?? 0.82,
    metalness: extras.metalness ?? 0.08,
    emissive: extras.emissive ?? 0x000000,
    emissiveIntensity: extras.emissiveIntensity ?? 0,
  });
}

function volumeMaterial(entity) {
  const color = parseColor(entity.props?.color, 0x4a5160);
  return surfaceMaterial(entity, color, { roughness: 0.9, metalness: 0.04, cells: 4 });
}

function rotundaWallName(index) {
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][index] ?? 'north';
}

function surfaceMaterial(entity, fallbackColor, extras = {}) {
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

export const prefabs = {
  sky(entity) {
    const color = parseColor(entity.props?.color, 0x111111);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(90, 48, 32),
      new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, depthWrite: false }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    applyPose(mesh, entity);
    return mesh;
  },

  floor(entity) {
    const color = parseColor(entity.props?.color, 0x333333);
    const size = entity.props?.size ?? 20;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      surfaceMaterial(entity, color, { roughness: 0.94, metalness: 0, line: '#1a1d24', cells: 8 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    applyPose(mesh, entity);
    mesh.userData.collider = { type: 'bounds', half: size * 0.5 };
    mesh.userData.materialId = entity.props?.material ?? null;
    mesh.userData.surface = entity.props?.surface ?? resolveMaterial(entity.props?.material)?.surface ?? null;
    return mesh;
  },

  box(entity) {
    const color = parseColor(entity.props?.color, 0xffffff);
    const size = entity.props?.size ?? [1, 1, 1];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      entity.props?.material
        ? buildMaterial(entity.props.material, { color })
        : standardMaterial(color, { roughness: 0.45, metalness: 0.12 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    applyPose(mesh, entity);
    mesh.userData.collider = { type: 'aabb' };
    if (entity.props?.scroll) {
      mesh.userData.scroll = entity.props.scroll;
    }
    if (entity.props?.spin) {
      mesh.userData.spin = entity.props.spin;
    }
    return mesh;
  },

  light(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const ambient = parseColor(entity.props?.ambient, 0x3a3d4d);
    const sun = parseColor(entity.props?.sun, 0xfff4e5);
    const hemi = new THREE.HemisphereLight(0xb8c8e0, ambient, (entity.props?.ambientIntensity ?? 0.45) * 0.85);
    hemi.userData.hemiLight = true;
    group.add(hemi);
    group.add(new THREE.AmbientLight(ambient, (entity.props?.ambientIntensity ?? 0.45) * 0.28));
    const directional = new THREE.DirectionalLight(sun, entity.props?.sunIntensity ?? 0.85);
    const aim = entity.props?.aim ?? [6, 11, 4];
    directional.position.set(...aim);
    directional.castShadow = true;
    directional.shadow.mapSize.set(2048, 2048);
    directional.shadow.bias = -0.00035;
    directional.shadow.normalBias = 0.03;
    directional.shadow.camera.near = 0.4;
    directional.shadow.camera.far = 48;
    directional.shadow.camera.left = -16;
    directional.shadow.camera.right = 16;
    directional.shadow.camera.top = 16;
    directional.shadow.camera.bottom = -16;
    group.add(directional);
    const fill = new THREE.DirectionalLight(0x8899bb, 0.18);
    fill.position.set(-5, 4, -3);
    fill.userData.isFillLight = true;
    group.add(fill);
    return group;
  },

  frame(entity) {
    const color = parseColor(entity.props?.color, 0xffffff);
    const group = new THREE.Group();
    group.userData.portalFrame = true;
    group.userData.coversPortalId = entity.props?.coversPortalId ?? null;
    applyPose(group, entity);

    const { outer, thickness, depth, walkUp, jambDepth, jambInner } = FRAME;
    const material = standardMaterial(color, { roughness: 0.55, metalness: 0.22 });
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
    addSideWall(group, material, {
      x: -(halfX + thickness * 0.5),
      zMin,
      zMax,
      height,
      thickness,
      holes: sideOpenings.filter((hole) => Number(hole.side ?? -1) < 0),
    });
    addSideWall(group, material, {
      x: halfX + thickness * 0.5,
      zMin,
      zMax,
      height,
      thickness,
      holes: sideOpenings.filter((hole) => Number(hole.side ?? 1) > 0),
    });
    addBox(group, material, 0, height + thickness * 0.5, midZ, halfX * 2 + thickness * 2, thickness, length, false);

    const wallZs = new Set([zMin, zMax, ...openings]);
    for (const z of wallZs) {
      if (openings.has(z)) {
        addOpeningWall(group, material, { z, halfX, height, thickness, holeWidth, holeHeight });
      } else {
        addBox(group, material, 0, height * 0.5, z, halfX * 2, height, thickness);
      }
    }
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
    const inner = 3.2;
    addRectVolume(group, material, {
      minX: -inner,
      maxX: inner,
      minZ: -inner - 1,
      maxZ: inner - 1,
      height: 0.95,
      y0: 0,
      holes: [],
      floor: false,
      ceiling: false,
    });
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
    });
    addBox(group, material, 0, 2.25, (zMin - 0.4) * 0.5, halfX * 2 - 0.4, 0.16, Math.abs(zMin) - 1.2);
    addBox(group, material, -halfX + 0.2, 3.1, (zMin - 0.4) * 0.5, 0.12, 0.9, Math.abs(zMin) - 1.2);
    addBox(group, material, halfX - 0.2, 3.1, (zMin - 0.4) * 0.5, 0.12, 0.9, Math.abs(zMin) - 1.2);
    addStairs(group, material, { x: 0, z0: 1.2, z1: -2.2, y0: 0.08, y1: 2.2, width: 1.8, steps: 9 });
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
      floorHoles: entity.props?.floorHoles ?? [],
    });
    addBox(group, material, -halfX + 1.3, 3.05, 0, 2.4, 0.18, 3.4);
    addBox(group, material, halfX - 1.3, 6.05, -0.6, 2.4, 0.18, 3.4);
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
    group.userData.volume = { kind: 'rotunda', radius, height };
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
    addBox(group, material, 0, -thickness * 0.5, (zMin + zMax) * 0.5, arm * 2, thickness, zMax - zMin);
    addBox(group, material, (minX + maxX) * 0.5, -thickness * 0.5, 0, maxX - minX, thickness, arm * 2);
    addBox(group, material, 0, height + thickness * 0.5, (zMin + zMax) * 0.5, arm * 2, thickness, zMax - zMin, false);
    addBox(group, material, (minX + maxX) * 0.5, height + thickness * 0.5, 0, maxX - minX, thickness, arm * 2, false);
    addWallWithHoles(group, material, {
      wall: 'north', minX: -arm, maxX: arm, minZ: zMin, maxZ: zMax, height, thickness, holes,
    });
    addWallWithHoles(group, material, {
      wall: 'south', minX: -arm, maxX: arm, minZ: zMin, maxZ: zMax, height, thickness, holes,
    });
    addWallWithHoles(group, material, {
      wall: 'west', minX, maxX, minZ: -arm, maxZ: arm, height, thickness, holes,
    });
    addWallWithHoles(group, material, {
      wall: 'east', minX, maxX, minZ: -arm, maxZ: arm, height, thickness, holes,
    });
    addBox(group, material, -arm, height * 0.5, (zMin - arm) * 0.5, thickness, height, Math.max(0.2, -arm - zMin));
    addBox(group, material, arm, height * 0.5, (zMin - arm) * 0.5, thickness, height, Math.max(0.2, -arm - zMin));
    addBox(group, material, -arm, height * 0.5, (zMax + arm) * 0.5, thickness, height, Math.max(0.2, zMax - arm));
    addBox(group, material, arm, height * 0.5, (zMax + arm) * 0.5, thickness, height, Math.max(0.2, zMax - arm));
    addBox(group, material, (minX - arm) * 0.5, height * 0.5, -arm, Math.max(0.2, -arm - minX), height, thickness);
    addBox(group, material, (minX - arm) * 0.5, height * 0.5, arm, Math.max(0.2, -arm - minX), height, thickness);
    addBox(group, material, (maxX + arm) * 0.5, height * 0.5, -arm, Math.max(0.2, maxX - arm), height, thickness);
    addBox(group, material, (maxX + arm) * 0.5, height * 0.5, arm, Math.max(0.2, maxX - arm), height, thickness);
    group.userData.volume = { kind: 'plus', arm, zMin, zMax, minX, maxX, height };
    return group;
  },

  point(entity) {
    const light = new THREE.PointLight(
      parseColor(entity.props?.color, 0xffcc88),
      entity.props?.intensity ?? 1.1,
      entity.props?.distance ?? 8,
      entity.props?.decay ?? 2,
    );
    applyPose(light, entity);
    light.userData.localLight = true;
    light.castShadow = entity.props?.shadow === true;
    return light;
  },

  spot(entity) {
    const light = new THREE.SpotLight(
      parseColor(entity.props?.color, 0xc8d8ff),
      entity.props?.intensity ?? 1.4,
      entity.props?.distance ?? 14,
      entity.props?.angle ?? 0.55,
      entity.props?.penumbra ?? 0.4,
      entity.props?.decay ?? 2,
    );
    applyPose(light, entity);
    light.target.position.set(...(entity.props?.target ?? [0, 0, -2]));
    light.add(light.target);
    light.userData.localLight = true;
    light.castShadow = entity.props?.shadow === true;
    return light;
  },

  water(entity) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(entity.props?.width ?? 8, 0.08, entity.props?.depth ?? 8),
      new THREE.MeshPhysicalMaterial({
        color: parseColor(entity.props?.color, 0x143038),
        roughness: 0.08,
        metalness: 0.04,
        transmission: 0.55,
        thickness: 0.2,
        ior: 1.33,
        transparent: true,
        opacity: 0.82,
      }),
    );
    applyPose(mesh, entity);
    mesh.userData.water = true;
    mesh.userData.collider = { type: 'aabb' };
    return mesh;
  },

  column(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0xc8b898), { roughness: 0.72 });
    const h = entity.props?.height ?? 3.4;
    const r = entity.props?.radius ?? 0.22;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 10), material);
    shaft.position.y = h * 0.5;
    shaft.castShadow = true;
    shaft.userData.collider = { type: 'aabb' };
    group.add(shaft);
    addBox(group, material, 0, 0.08, 0, r * 2.4, 0.16, r * 2.4);
    addBox(group, material, 0, h, 0, r * 2.2, 0.12, r * 2.2);
    return group;
  },

  pipe(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0x6a7068), { roughness: 0.4, metalness: 0.65 });
    const length = entity.props?.length ?? 3.2;
    const r = entity.props?.radius ?? 0.12;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, length, 8), material);
    tube.rotation.z = Math.PI / 2;
    tube.position.y = entity.props?.lift ?? 2.4;
    tube.castShadow = true;
    group.add(tube);
    return group;
  },

  chair(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const wood = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0x3a2818), { roughness: 0.86 });
    const cloth = entity.props?.upholstery
      ? buildMaterial(entity.props.upholstery)
      : standardMaterial(parseColor(entity.props?.cloth, 0x4a1828), { roughness: 0.9 });
    addBox(group, wood, 0, 0.24, 0, 0.48, 0.06, 0.48);
    addBox(group, wood, -0.2, 0.12, -0.2, 0.06, 0.24, 0.06);
    addBox(group, wood, 0.2, 0.12, -0.2, 0.06, 0.24, 0.06);
    addBox(group, wood, -0.2, 0.12, 0.2, 0.06, 0.24, 0.06);
    addBox(group, wood, 0.2, 0.12, 0.2, 0.06, 0.24, 0.06);
    addBox(group, cloth, 0, 0.58, -0.2, 0.46, 0.62, 0.07);
    addBox(group, cloth, 0, 0.28, 0, 0.44, 0.05, 0.42);
    group.userData.collider = { type: 'aabb' };
    return group;
  },

  table(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const wood = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0x3a2818), { roughness: 0.84 });
    const w = entity.props?.width ?? 2.4;
    const d = entity.props?.depth ?? 1.05;
    const h = entity.props?.height ?? 0.76;
    addBox(group, wood, 0, h, 0, w, 0.07, d);
    addBox(group, wood, -w * 0.42, h * 0.48, -d * 0.38, 0.08, h * 0.96, 0.08);
    addBox(group, wood, w * 0.42, h * 0.48, -d * 0.38, 0.08, h * 0.96, 0.08);
    addBox(group, wood, -w * 0.42, h * 0.48, d * 0.38, 0.08, h * 0.96, 0.08);
    addBox(group, wood, w * 0.42, h * 0.48, d * 0.38, 0.08, h * 0.96, 0.08);
    group.userData.collider = { type: 'aabb' };
    return group;
  },

  sideboard(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const wood = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0x322418), { roughness: 0.86 });
    addBox(group, wood, 0, 0.48, 0, 1.8, 0.96, 0.46);
    addBox(group, wood, 0, 1.02, 0, 1.86, 0.08, 0.5);
    group.userData.collider = { type: 'aabb' };
    return group;
  },

  portrait(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const frame = standardMaterial(parseColor(entity.props?.frame, 0x4a3820), { roughness: 0.5, metalness: 0.2 });
    const canvas = standardMaterial(parseColor(entity.props?.color, 0x3a2a28), { roughness: 0.8 });
    addBox(group, frame, 0, 1.45, 0, 0.86, 1.05, 0.06);
    addBox(group, canvas, 0, 1.45, 0.02, 0.68, 0.86, 0.02, false);
    return group;
  },

  curtain(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const cloth = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0x4a1828), { roughness: 0.92 });
    addBox(group, cloth, -0.28, 1.15, 0, 0.34, 2.2, 0.08);
    addBox(group, cloth, 0.28, 1.15, 0, 0.34, 2.2, 0.08);
    addBox(group, cloth, 0, 2.28, 0, 0.9, 0.08, 0.1);
    return group;
  },

  window(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const frame = standardMaterial(parseColor(entity.props?.frame, 0x3a2a1c), { roughness: 0.6, metalness: 0.08 });
    const night = standardMaterial(parseColor(entity.props?.color, 0x6a88a8), { roughness: 0.15, metalness: 0.05 });
    addBox(group, frame, 0, 1.35, 0, 1.15, 1.5, 0.08);
    addBox(group, night, 0, 1.35, 0.02, 0.92, 1.26, 0.02, false);
    addBox(group, frame, 0, 1.35, 0.03, 0.05, 1.26, 0.03, false);
    addBox(group, frame, 0, 1.35, 0.03, 0.92, 0.05, 0.03, false);
    group.userData.window = true;
    return group;
  },

  rug(entity) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(entity.props?.width ?? 2.8, 0.03, entity.props?.depth ?? 1.4),
      entity.props?.material
        ? buildMaterial(entity.props.material)
        : standardMaterial(parseColor(entity.props?.color, 0x4a1824), { roughness: 0.95 }),
    );
    applyPose(mesh, entity);
    mesh.position.y = entity.position?.[1] ?? 0.02;
    mesh.receiveShadow = true;
    mesh.userData.collider = { type: 'aabb' };
    return mesh;
  },

  books(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const colors = [0x3a2030, 0x2a3040, 0x4a3820, 0x203028];
    for (let i = 0; i < 5; i += 1) {
      addBox(group, standardMaterial(colors[i % colors.length], { roughness: 0.88 }), (i - 2) * 0.09, 0.16, 0, 0.08, 0.32, 0.22);
    }
    return group;
  },

  trunk(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const wood = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0x4a3420), { roughness: 0.88 });
    const iron = buildMaterial('haunt.iron');
    addBox(group, wood, 0, 0.32, 0, 1.15, 0.64, 0.62);
    addBox(group, iron, 0, 0.64, 0, 1.18, 0.05, 0.64);
    group.userData.collider = { type: 'aabb' };
    return group;
  },

  plaque(entity) {
    const color = parseColor(entity.props?.color, 0xcfd3e5);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.7, 0.06),
      standardMaterial(color, { roughness: 0.5, metalness: 0.15 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    applyPose(mesh, entity);
    mesh.userData.plaque = entity.props?.text ?? '';
    return mesh;
  },

  pad(entity) {
    const color = parseColor(entity.props?.color, 0xb5abfc);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20),
      standardMaterial(color, { roughness: 0.35, metalness: 0.2 }),
    );
    applyPose(mesh, entity);
    mesh.userData.interact = {
      action: entity.props?.action ?? 'look',
      portalId: entity.props?.portalId ?? null,
      text: entity.props?.text ?? '',
      impulse: entity.props?.impulse ?? null,
      setFlag: entity.props?.setFlag ?? null,
      require: entity.props?.require ?? null,
    };
    return mesh;
  },

  glass(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const width = entity.props?.width ?? 1.72;
    const height = entity.props?.height ?? 2.05;
    const frameT = 0.07;
    const depth = 0.09;
    const frameColor = parseColor(entity.props?.frame, 0x8a93a8);
    const tint = parseColor(entity.props?.color, 0xb8d4e8);
    const frame = entity.props?.frameMaterial
      ? buildMaterial(entity.props.frameMaterial)
      : standardMaterial(frameColor, { roughness: 0.32, metalness: 0.62 });
    addBox(group, frame, 0, height / 2, 0, width + frameT, frameT, depth);
    addBox(group, frame, 0, -height / 2, 0, width + frameT, frameT, depth);
    addBox(group, frame, -width / 2, 0, 0, frameT, height, depth);
    addBox(group, frame, width / 2, 0, 0, frameT, height, depth);

    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(width - frameT, height - frameT),
      new THREE.MeshPhysicalMaterial({
        color: tint,
        metalness: 0.04,
        roughness: 0.06,
        transmission: 0.82,
        thickness: 0.045,
        ior: 1.5,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: true,
      }),
    );
    pane.userData.glass = true;
    group.add(pane);

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(width + frameT, height + frameT, 0.08),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    slab.userData.collider = { type: 'aabb' };
    group.add(slab);
    return group;
  },

  screen(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const width = entity.props?.width ?? 0.92;
    const height = entity.props?.height ?? 0.54;
    const bezel = 0.045;
    const frameColor = parseColor(entity.props?.frame, 0x1a1c22);
    const housing = standardMaterial(frameColor, { roughness: 0.42, metalness: 0.38 });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width + bezel * 2, height + bezel * 2, 0.08),
      housing,
    );
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.collider = { type: 'aabb' };
    group.add(body);

    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color: 0x101218 }),
    );
    surface.position.z = 0.044;
    surface.userData.screenSurface = true;
    group.add(surface);

    if (entity.props?.stand !== false) {
      addBox(group, housing, 0, -(height / 2 + 0.24), 0, 0.08, 0.42, 0.08);
      addBox(group, housing, 0, -(height / 2 + 0.46), 0.02, 0.42, 0.05, 0.22);
    }

    group.userData.screen = {
      cameraPosition: entity.props?.cameraPosition ?? [4.8, 2.3, 5.2],
      lookAt: entity.props?.lookAt ?? [0, 1.05, 0.2],
      fov: entity.props?.fov ?? 58,
      width: entity.props?.resolution?.[0] ?? 320,
      height: entity.props?.resolution?.[1] ?? 180,
      video: entity.props?.video ?? null,
    };
    return group;
  },

  hearth(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const width = entity.props?.width ?? 1.85;
    const height = entity.props?.height ?? 1.45;
    const depth = entity.props?.depth ?? 0.58;
    const stone = parseColor(entity.props?.color, 0x3a322c);
    const ember = parseColor(entity.props?.ember, 0xff6a22);
    const mat = standardMaterial(stone, { roughness: 0.92, metalness: 0.06 });
    addBox(group, mat, 0, height * 0.5, -depth * 0.42, width, height, 0.16);
    addBox(group, mat, -width * 0.5 + 0.08, height * 0.38, 0.02, 0.16, height * 0.76, depth);
    addBox(group, mat, width * 0.5 - 0.08, height * 0.38, 0.02, 0.16, height * 0.76, depth);
    addBox(group, mat, 0, 0.08, 0.04, width - 0.1, 0.16, depth);
    addBox(group, mat, 0, height * 0.84, 0.06, width + 0.14, 0.12, depth + 0.08);

    const wood = standardMaterial(parseColor(entity.props?.wood, 0x4a3020), { roughness: 0.9, metalness: 0 });
    const log = (y, z, yaw) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.68, 8), wood);
      mesh.rotation.z = Math.PI / 2;
      mesh.rotation.y = yaw;
      mesh.position.set(0, y, z);
      mesh.castShadow = true;
      group.add(mesh);
    };
    log(0.22, 0.08, 0.22);
    log(0.28, 0, -0.32);

    const count = entity.props?.flames ?? 56;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const lives = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 0.52;
      positions[i * 3 + 1] = 0.26 + Math.random() * 0.4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.16;
      lives[i] = Math.random();
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const flames = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: ember,
        size: 0.09,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    flames.frustumCulled = false;
    flames.userData.flames = { lives, rise: 0.95 };
    group.add(flames);

    const light = new THREE.PointLight(ember, entity.props?.intensity ?? 1.45, 9, 2);
    light.position.set(0, 0.55, 0.14);
    light.userData.fireLight = true;
    group.add(light);
    group.userData.fire = {
      base: entity.props?.intensity ?? 1.45,
      seed: Math.random() * Math.PI * 2,
    };
    return group;
  },

  candle(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const wax = standardMaterial(parseColor(entity.props?.color, 0xe8d8b8), { roughness: 0.72, metalness: 0 });
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.22, 8), wax);
    stick.position.y = 0.11;
    stick.castShadow = true;
    group.add(stick);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc66 }),
    );
    flame.position.y = 0.24;
    flame.scale.set(0.65, 1.35, 0.65);
    group.add(flame);
    const light = new THREE.PointLight(0xffb060, entity.props?.intensity ?? 0.32, 3.6, 2);
    light.position.y = 0.26;
    light.userData.fireLight = true;
    group.add(light);
    group.userData.fire = {
      base: entity.props?.intensity ?? 0.32,
      seed: Math.random() * 10,
      candle: true,
    };
    return group;
  },

  model(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const size = entity.props?.size ?? [1, 1.6, 0.8];
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      standardMaterial(parseColor(entity.props?.color, 0x2a2a2a), { roughness: 0.85, metalness: 0.05 }),
    );
    proxy.castShadow = true;
    proxy.userData.collider = { type: 'aabb' };
    proxy.userData.modelProxy = true;
    group.add(proxy);
    group.userData.model = { src: entity.props?.src ?? null, size };
    if (entity.props?.src && typeof document !== 'undefined') {
      hydrateModel(group).catch(() => {});
    }
    return group;
  },

  npc(entity) {
    const size = entity.props?.size ?? [0.5, 1.6, 0.4];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      standardMaterial(parseColor(entity.props?.color, 0x3a3030), { roughness: 0.8, metalness: 0.04 }),
    );
    applyPose(mesh, entity);
    mesh.position.y = (entity.position?.[1] ?? 0) + size[1] * 0.5;
    mesh.userData.collider = { type: 'aabb' };
    mesh.userData.npc = { lookAtPlayer: entity.props?.lookAtPlayer !== false };
    return mesh;
  },
};

function addBox(group, material, x, y, z, sx, sy, sz, collide = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (collide) {
    mesh.userData.collider = { type: 'aabb' };
  }
  group.add(mesh);
}

function addSideWall(group, material, { x, zMin, zMax, height, thickness, holes }) {
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

function addOpeningWall(group, material, { z, halfX, height, thickness, holeWidth, holeHeight }) {
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

export function spawnEntity(entity, catalog) {
  const kind = catalog.kinds?.[entity.kind];
  if (!kind) {
    throw new Error(`Unknown kind: ${entity.kind}`);
  }
  const build = prefabs[kind.prefab];
  if (!build) {
    throw new Error(`Unknown prefab: ${kind.prefab}`);
  }
  const object = build(entity);
  object.name = entity.id;
  object.userData.kind = entity.kind;
  object.userData.tags = entity.tags ?? kind.tags ?? [];
  object.userData.category = kind.category;
  if (entity.props?.action && !object.userData.interact) {
    object.userData.interact = {
      action: entity.props.action,
      portalId: entity.props.portalId ?? null,
      text: entity.props.text ?? '',
      impulse: entity.props.impulse ?? null,
      setFlag: entity.props.setFlag ?? null,
      require: entity.props.require ?? null,
    };
  }
  return object;
}
