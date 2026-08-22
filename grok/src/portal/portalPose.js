import { Euler, Vector3 } from 'three';

const normal = new Vector3();
const local = new Vector3();
const dropEuler = new Euler(0, 0, 0, 'YXZ');

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

export function landBesideFloorPortal(portal, worldPosition, eyeHeight = 1) {
  if (!portal || !worldPosition) {
    return worldPosition;
  }
  portal.updateMatrixWorld(true);
  local.copy(worldPosition);
  portal.worldToLocal(local);
  const stand = emergeDistance(portal, eyeHeight);
  if (local.z < stand) {
    local.z = stand;
  }
  const hw = portal.geometry.halfWidth;
  const hh = portal.geometry.halfHeight;
  if (Math.abs(local.x) <= hw && Math.abs(local.y) <= hh) {
    local.x = (local.x >= 0 ? 1 : -1) * (hw + 0.7);
  }
  portal.localToWorld(local);
  worldPosition.copy(local);
  return worldPosition;
}

export function dropThroughFloor(destination, camera, { fallHeight = 2.7, eyeHeight = 1 } = {}) {
  if (!destination || !camera) {
    return camera;
  }
  destination.updateMatrixWorld(true);
  dropEuler.setFromQuaternion(camera.quaternion, 'YXZ');
  dropEuler.x = Math.max(-0.55, Math.min(0.12, dropEuler.x));
  dropEuler.z = 0;
  camera.rotation.order = 'YXZ';
  camera.quaternion.setFromEuler(dropEuler);
  camera.rotation.copy(dropEuler);
  const stand = emergeDistance(destination, eyeHeight);
  local.set(destination.geometry.halfWidth + 0.75, 0, Math.max(fallHeight, stand + 1.15));
  destination.localToWorld(local);
  camera.position.copy(local);
  camera.updateMatrixWorld();
  return camera;
}
