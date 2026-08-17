import { Box3, Vector3 } from 'three';

const worldBox = new Box3();
const scratch = new Vector3();
const cornerPool = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];

export function collectColliders(room) {
  const colliders = [];
  if (!room?.scene) {
    return colliders;
  }

  room.scene.traverse((object) => {
    if (object.userData.portalOccluder) {
      return;
    }
    const spec = object.userData.collider;
    if (!spec) {
      return;
    }
    if (spec.type === 'aabb') {
      worldBox.setFromObject(object);
      if (worldBox.isEmpty()) {
        return;
      }
      colliders.push({
        type: 'aabb',
        minX: worldBox.min.x,
        maxX: worldBox.max.x,
        minY: worldBox.min.y,
        maxY: worldBox.max.y,
        minZ: worldBox.min.z,
        maxZ: worldBox.max.z,
      });
      return;
    }
    if (spec.type === 'bounds') {
      object.getWorldPosition(scratch);
      colliders.push({
        type: 'bounds',
        cx: scratch.x,
        cz: scratch.z,
        half: spec.half ?? 10,
      });
    }
  });

  for (const portal of room.portals ?? []) {
    if (portal.enabled) {
      continue;
    }
    portal.updateMatrixWorld(true);
    const hx = portal.geometry.halfWidth;
    const hy = portal.geometry.halfHeight;
    const hz = 0.1;
    const locals = [
      [-hx, -hy, -hz],
      [hx, -hy, -hz],
      [-hx, hy, hz],
      [hx, hy, hz],
    ];
    for (let i = 0; i < 4; i += 1) {
      cornerPool[i].set(...locals[i]);
      portal.localToWorld(cornerPool[i]);
    }
    worldBox.setFromPoints(cornerPool);
    colliders.push({
      type: 'aabb',
      minX: worldBox.min.x,
      maxX: worldBox.max.x,
      minY: worldBox.min.y,
      maxY: worldBox.max.y,
      minZ: worldBox.min.z,
      maxZ: worldBox.max.z,
    });
  }

  return colliders;
}

export function resolveColliders(position, { radius = 0.28, eyeHeight = 1 } = {}, colliders) {
  const feet = position.y - eyeHeight;
  const head = position.y + 0.25;

  for (const collider of colliders) {
    if (collider.type === 'bounds') {
      const limit = Math.max(collider.half - radius, 0);
      position.x = Math.min(collider.cx + limit, Math.max(collider.cx - limit, position.x));
      position.z = Math.min(collider.cz + limit, Math.max(collider.cz - limit, position.z));
      continue;
    }

    if (collider.type !== 'aabb') {
      continue;
    }
    if (head < collider.minY || feet > collider.maxY) {
      continue;
    }

    const minX = collider.minX - radius;
    const maxX = collider.maxX + radius;
    const minZ = collider.minZ - radius;
    const maxZ = collider.maxZ + radius;
    if (position.x <= minX || position.x >= maxX || position.z <= minZ || position.z >= maxZ) {
      continue;
    }

    const left = position.x - minX;
    const right = maxX - position.x;
    const near = position.z - minZ;
    const far = maxZ - position.z;
    const smallest = Math.min(left, right, near, far);
    if (smallest === left) {
      position.x = minX;
    } else if (smallest === right) {
      position.x = maxX;
    } else if (smallest === near) {
      position.z = minZ;
    } else {
      position.z = maxZ;
    }
  }

  return position;
}
