const SAVE_KEY = 'portals-grok-save';

export function loadSave() {
  try {
    const raw = globalThis.localStorage?.getItem(SAVE_KEY);
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw);
    if (!data?.worldId || !data.roomId || !Array.isArray(data.position)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  globalThis.localStorage?.setItem(SAVE_KEY, JSON.stringify(data));
  return data;
}

export function clearSave() {
  globalThis.localStorage?.removeItem(SAVE_KEY);
}

export function isWorldPose(position = []) {
  return Math.abs(Number(position[0]) || 0) > 80 || Math.abs(Number(position[2]) || 0) > 80;
}

export function poseFromSession(session, worldId) {
  const euler = { x: 0, y: 0, z: 0 };
  session.camera.rotation.setFromQuaternion(session.camera.quaternion, 'YXZ');
  euler.x = session.camera.rotation.x;
  euler.y = session.camera.rotation.y;
  const origin = session.controller.currentRoom?.origin ?? [0, 0, 0];
  return {
    worldId,
    roomId: session.controller.currentRoom.id,
    position: [
      session.camera.position.x - origin[0],
      session.camera.position.y,
      session.camera.position.z - origin[2],
    ],
    yaw: euler.y,
    pitch: euler.x,
    seed: session.controller?.drift?.seed,
    depth: session.controller?.drift?.depth ?? session.controller.currentRoom?.depth,
    kitId: session.controller.currentRoom?.kitId ?? session.controller?.drift?.kitId,
    topologyId: session.controller.currentRoom?.topologyId ?? null,
    branch: session.controller.currentRoom?.branch ?? 0,
  };
}

export function applyPose(session, pose) {
  if (!pose) {
    return session;
  }
  if (pose.roomId && session.controller.currentRoom?.id !== pose.roomId) {
    try {
      session.controller.setCurrentScene(pose.roomId);
    } catch {
      // keep spawn room if the save names a hall that is gone
    }
  }
  if (pose.position) {
    const origin = session.controller.currentRoom?.origin ?? [0, 0, 0];
    const world = isWorldPose(pose.position)
      ? pose.position
      : [pose.position[0] + origin[0], pose.position[1], pose.position[2] + origin[2]];
    session.camera.position.set(...world);
  }
  session.camera.rotation.order = 'YXZ';
  session.camera.rotation.y = pose.yaw ?? 0;
  session.camera.rotation.x = pose.pitch ?? 0;
  session.camera.quaternion.setFromEuler(session.camera.rotation);
  return session;
}
