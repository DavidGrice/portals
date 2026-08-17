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

export function poseFromSession(session, worldId) {
  const euler = { x: 0, y: 0, z: 0 };
  session.camera.rotation.setFromQuaternion(session.camera.quaternion, 'YXZ');
  euler.x = session.camera.rotation.x;
  euler.y = session.camera.rotation.y;
  return {
    worldId,
    roomId: session.controller.currentRoom.id,
    position: [session.camera.position.x, session.camera.position.y, session.camera.position.z],
    yaw: euler.y,
    pitch: euler.x,
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
    session.camera.position.set(...pose.position);
  }
  session.camera.rotation.order = 'YXZ';
  session.camera.rotation.y = pose.yaw ?? 0;
  session.camera.rotation.x = pose.pitch ?? 0;
  session.camera.quaternion.setFromEuler(session.camera.rotation);
  return session;
}
