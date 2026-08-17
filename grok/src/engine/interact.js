import { Vector3 } from 'three';

const scratch = new Vector3();

export function findInteract(room, position, { maxDistance = 2 } = {}) {
  let best = null;
  let bestDistance = maxDistance;
  if (!room?.scene || !position) {
    return null;
  }
  room.scene.traverse((object) => {
    const spec = object.userData.interact;
    if (!spec) {
      return;
    }
    object.getWorldPosition(scratch);
    const distance = position.distanceTo(scratch);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = { object, spec, distance };
    }
  });
  return best;
}

export function runInteract(target, { controller } = {}) {
  if (!target?.spec) {
    return null;
  }
  if (target.spec.action === 'unlock') {
    const portal = controller?.getPortal(target.spec.portalId);
    if (portal) {
      portal.enabled = true;
    }
    return { type: 'unlock', portalId: target.spec.portalId, ok: Boolean(portal) };
  }
  if (target.spec.action === 'launch') {
    return { type: 'launch', impulse: target.spec.impulse ?? [0, 8, 0], text: target.spec.text ?? '' };
  }
  return { type: target.spec.action ?? 'look', text: target.spec.text ?? '' };
}
