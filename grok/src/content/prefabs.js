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
      new THREE.SphereGeometry(80, 16, 12),
      new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }),
    );
    mesh.frustumCulled = false;
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
};

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
