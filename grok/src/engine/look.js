import { Euler } from 'three';

const euler = new Euler(0, 0, 0, 'YXZ');
const PI_2 = Math.PI / 2;
const MOUSE_SCALE = 0.002;

export function lookSpeed(mouseSensitivity = 0.5) {
  return MOUSE_SCALE * mouseSensitivity * 2;
}

export function applyLook(camera, dx, dy, { mouseSensitivity = 0.5, invertY = false } = {}) {
  if (!dx && !dy) {
    return camera;
  }
  const speed = lookSpeed(mouseSensitivity);
  euler.setFromQuaternion(camera.quaternion);
  euler.y -= dx * speed;
  euler.x -= dy * speed * (invertY ? -1 : 1);
  euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
  camera.quaternion.setFromEuler(euler);
  return camera;
}
