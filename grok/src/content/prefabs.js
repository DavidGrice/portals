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

export const prefabs = {
  sky(entity) {
    const color = parseColor(entity.props?.color, 0x111111);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(80, 16, 12),
      new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }),
    );
    applyPose(mesh, entity);
    return mesh;
  },

  floor(entity) {
    const color = parseColor(entity.props?.color, 0x333333);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color }));
    mesh.rotation.x = -Math.PI / 2;
    applyPose(mesh, entity);
    return mesh;
  },

  box(entity) {
    const color = parseColor(entity.props?.color, 0xffffff);
    const size = entity.props?.size ?? [1, 1, 1];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ color }));
    applyPose(mesh, entity);
    return mesh;
  },

  frame(entity) {
    const color = parseColor(entity.props?.color, 0xffffff);
    const group = new THREE.Group();
    group.userData.portalFrame = true;
    group.userData.coversPortalId = entity.props?.coversPortalId ?? null;
    applyPose(group, entity);
    group.translateZ(0.08);

    const thickness = 0.08;
    const width = 2.16;
    const height = 2.16;
    const depth = 0.1;
    const material = new THREE.MeshBasicMaterial({
      color,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const pieces = [
      [0, height / 2, 0, width + thickness * 2, thickness, depth],
      [0, -height / 2, 0, width + thickness * 2, thickness, depth],
      [-(width / 2), 0, 0, thickness, height, depth],
      [width / 2, 0, 0, thickness, height, depth],
    ];

    for (const [x, y, z, sx, sy, sz] of pieces) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
      mesh.position.set(x, y, z);
      group.add(mesh);
    }

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
