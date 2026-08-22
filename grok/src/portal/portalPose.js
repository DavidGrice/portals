import { Vector3 } from 'three';

const normal = new Vector3();
const local = new Vector3();

export function isFloorPortal(portal) {
  if (!portal) {
    return false;
  }
  portal.updateMatrixWorld(true);
  normal.set(0, 0, 1).transformDirection(portal.matrixWorld);
  return normal.y > 0.65;
}

export function emergeDistance(portal, eyeHeight = 1) {
  return isFloorPortal(portal) ? Math.max(Number(eyeHeight) || 1, 0.85) : 0.18;
}

export function overFloorPortal(portal, worldPosition) {
  if (!portal?.enabled || !worldPosition || !isFloorPortal(portal)) {
    return false;
  }
  local.copy(worldPosition);
  portal.worldToLocal(local);
  return Math.abs(local.x) <= portal.geometry.halfWidth
    && Math.abs(local.y) <= portal.geometry.halfHeight;
}

export function isOverFloorPortal(room, worldPosition) {
  for (const portal of room?.portals ?? []) {
    if (overFloorPortal(portal, worldPosition)) {
      return true;
    }
  }
  return false;
}

export function ignoreCleared(portal, worldPosition, { wallClear = 0.45 } = {}) {
  if (!portal || !worldPosition) {
    return true;
  }
  local.copy(worldPosition);
  portal.worldToLocal(local);
  if (isFloorPortal(portal)) {
    return Math.abs(local.x) > portal.geometry.halfWidth + 0.35
      || Math.abs(local.y) > portal.geometry.halfHeight + 0.35;
  }
  return Math.abs(local.z) > wallClear;
}
