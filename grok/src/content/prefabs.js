import * as THREE from 'three';

export function parseColor(value, fallback = 0xffffff) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return Number.parseInt(value.replace('#', ''), 16);
  }
  return fallback;
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
    roughness: extras.roughness ?? 0.82,
    metalness: extras.metalness ?? 0.08,
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
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), standardMaterial(color, { roughness: 0.94, metalness: 0 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    applyPose(mesh, entity);
    mesh.userData.collider = { type: 'bounds', half: size * 0.5 };
    return mesh;
  },

  box(entity) {
    const color = parseColor(entity.props?.color, 0xffffff);
    const size = entity.props?.size ?? [1, 1, 1];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), standardMaterial(color, { roughness: 0.45, metalness: 0.12 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    applyPose(mesh, entity);
    mesh.userData.collider = { type: 'aabb' };
    return mesh;
  },

  light(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const ambient = parseColor(entity.props?.ambient, 0x3a3d4d);
    const sun = parseColor(entity.props?.sun, 0xfff4e5);
    group.add(new THREE.AmbientLight(ambient, entity.props?.ambientIntensity ?? 0.45));
    const directional = new THREE.DirectionalLight(sun, entity.props?.sunIntensity ?? 0.85);
    const aim = entity.props?.aim ?? [4, 8, 3];
    directional.position.set(...aim);
    directional.castShadow = true;
    directional.shadow.mapSize.set(1024, 1024);
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 40;
    group.add(directional);
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

    const occluder = new THREE.Mesh(
      new THREE.BoxGeometry(outer, outer, 0.05),
      standardMaterial(color, { roughness: 0.9, metalness: 0 }),
    );
    occluder.position.set(0, 0, -0.14);
    occluder.userData.portalOccluder = true;
    group.add(occluder);

    return group;
  },

  wall(entity) {
    const size = entity.props?.size ?? [4, 3, 0.24];
    const color = parseColor(entity.props?.color, 0x4a5160);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), standardMaterial(color, { roughness: 0.9, metalness: 0.04 }));
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
    const material = standardMaterial(color, { roughness: 0.9, metalness: 0.04 });
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

    addBox(group, material, -(halfX + thickness * 0.5), height * 0.5, midZ, thickness, height, length);
    addBox(group, material, halfX + thickness * 0.5, height * 0.5, midZ, thickness, height, length);
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
    };
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

function addOpeningWall(group, material, { z, halfX, height, thickness, holeWidth, holeHeight }) {
  const holeHalf = holeWidth * 0.5;
  const sideWidth = Math.max(halfX - holeHalf, 0.1);
  addBox(group, material, -halfX + sideWidth * 0.5, height * 0.5, z, sideWidth, height, thickness);
  addBox(group, material, halfX - sideWidth * 0.5, height * 0.5, z, sideWidth, height, thickness);
  const lintel = Math.max(height - holeHeight, 0.08);
  addBox(group, material, 0, holeHeight + lintel * 0.5, z, holeWidth, lintel, thickness);
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
  return object;
}
