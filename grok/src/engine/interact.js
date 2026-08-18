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
  if (target.spec.setFlag) {
    controller.flags = controller.flags ?? {};
    controller.flags[target.spec.setFlag] = true;
  }
  if (target.spec.action === 'unlock') {
    if (target.spec.require && !controller?.flags?.[target.spec.require]) {
      return { type: 'unlock', portalId: target.spec.portalId, ok: false, need: target.spec.require };
    }
    const portal = controller?.getPortal(target.spec.portalId);
    if (portal) {
      portal.enabled = true;
    }
    return { type: 'unlock', portalId: target.spec.portalId, ok: Boolean(portal) };
  }
  if (target.spec.action === 'launch') {
    return { type: 'launch', impulse: target.spec.impulse ?? [0, 8, 0], text: target.spec.text ?? '' };
  }
  if (target.spec.action === 'stoke' && target.object?.userData) {
    const fire = target.object.userData.fire;
    if (fire) {
      fire.base = Math.min((fire.base ?? 1.2) + 0.35, 2.6);
    }
    return { type: 'stoke', text: target.spec.text ?? 'The fire lifts.' };
  }
  return { type: target.spec.action ?? 'look', text: target.spec.text ?? '' };
}
