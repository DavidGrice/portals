import { Box3, Vector3 } from 'three';

const worldBox = new Box3();
const scratch = new Vector3();
const cornerPool = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];

/** How far below a top we still snap (landing), in world units. */
export const LAND_WINDOW = 0.28;
/** How far above a top we still count as standing on it. */
export const SNAP_DOWN = 0.08;
/** Horizontal pad so the capsule center can sit near a cube edge. */
export const SUPPORT_PAD = 0.12;

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
      const cached = !object.userData.spin && object.userData.worldCollider;
      if (cached) {
        colliders.push(cached);
        return;
      }
      worldBox.setFromObject(object);
      if (worldBox.isEmpty()) {
        return;
      }
      const entry = {
        type: 'aabb',
        walkable: Boolean(spec.walkable),
        minX: worldBox.min.x,
        maxX: worldBox.max.x,
        minY: worldBox.min.y,
        maxY: worldBox.max.y,
        minZ: worldBox.min.z,
        maxZ: worldBox.max.z,
      };
      if (!object.userData.spin) {
        object.userData.worldCollider = entry;
      }
      colliders.push(entry);
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

export function overlapsSupport(position, collider) {
  return (
    position.x >= collider.minX - SUPPORT_PAD &&
    position.x <= collider.maxX + SUPPORT_PAD &&
    position.z >= collider.minZ - SUPPORT_PAD &&
    position.z <= collider.maxZ + SUPPORT_PAD
  );
}

export function isOnAabbTop(position, collider, { eyeHeight = 1, velocityY = 0, prevY = null } = {}) {
  if (collider.type !== 'aabb' || !overlapsSupport(position, collider)) {
    return false;
  }
  const feet = position.y - eyeHeight;
  const top = collider.maxY;
  const prevFeet = (prevY ?? position.y) - eyeHeight;
  const window = collider.walkable ? 0.46 : LAND_WINDOW;
  if (velocityY > 0 && feet > top) {
    return false;
  }
  if (prevFeet >= top - window && feet <= top + SNAP_DOWN) {
    return true;
  }
  return feet <= top + SNAP_DOWN && feet >= top - window;
}

export function findSupportY(position, body, colliders, prevY = position.y) {
  let supportY = 0;
  const eyeHeight = body.eyeHeight ?? 1;
  const velocityY = body.velocity?.y ?? 0;
  for (const collider of colliders) {
    if (collider.type !== 'aabb') {
      continue;
    }
    if (!isOnAabbTop(position, collider, { eyeHeight, velocityY, prevY })) {
      continue;
    }
    if (collider.maxY > supportY) {
      supportY = collider.maxY;
    }
  }
  return supportY;
}

export function resolveColliders(position, body = {}, colliders) {
  const radius = body.radius ?? 0.28;
  const eyeHeight = body.eyeHeight ?? 1;
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

    if (collider.walkable) {
      continue;
    }
    // Above or landing on the top: walkable, never a side wall.
    if (overlapsSupport(position, collider) && feet >= collider.maxY - LAND_WINDOW) {
      continue;
    }

    if (head < collider.minY || feet >= collider.maxY) {
      continue;
    }
    if (
      position.x <= collider.minX - radius ||
      position.x >= collider.maxX + radius ||
      position.z <= collider.minZ - radius ||
      position.z >= collider.maxZ + radius
    ) {
      continue;
    }

    const minX = collider.minX - radius;
    const maxX = collider.maxX + radius;
    const minZ = collider.minZ - radius;
    const maxZ = collider.maxZ + radius;
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

export function resolveGround(position, body, colliders, prevY) {
  const supportY = findSupportY(position, body, colliders, prevY);
  body.supportY = supportY;
  const groundedY = supportY + (body.eyeHeight ?? 1);
  if ((body.velocity?.y ?? 0) <= 0 && position.y <= groundedY) {
    position.y = groundedY;
    if (body.velocity) {
      body.velocity.y = 0;
    }
    body.onGround = true;
  } else {
    body.onGround = false;
  }
  return supportY;
}
