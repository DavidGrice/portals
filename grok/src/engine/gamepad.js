export const GAMEPAD_DEADZONE = 0.18;
export const GAMEPAD_LOOK_SCALE = 28;

export function applyDeadzone(value, zone = GAMEPAD_DEADZONE) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const magnitude = Math.abs(numeric);
  if (magnitude < zone) {
    return 0;
  }
  return Math.sign(numeric) * (magnitude - zone) / (1 - zone);
}

export function firstGamepad(list = globalThis.navigator?.getGamepads?.() ?? []) {
  for (const pad of list) {
    if (pad) {
      return pad;
    }
  }
  return null;
}

export function emptyPadButtons() {
  return { a: false, x: false, y: false, start: false };
}

export function readGamepad(pad, previous = emptyPadButtons(), { gamepadSensitivity = 0.5 } = {}) {
  if (!pad) {
    return {
      moveX: 0,
      moveY: 0,
      lookDX: 0,
      lookDY: 0,
      jump: false,
      start: false,
      pressed: emptyPadButtons(),
    };
  }

  const lx = applyDeadzone(pad.axes?.[0]);
  const ly = applyDeadzone(pad.axes?.[1]);
  const rx = applyDeadzone(pad.axes?.[2]);
  const ry = applyDeadzone(pad.axes?.[3]);
  const dpadRight = Number(Boolean(pad.buttons?.[15]?.pressed));
  const dpadLeft = Number(Boolean(pad.buttons?.[14]?.pressed));
  const dpadDown = Number(Boolean(pad.buttons?.[13]?.pressed));
  const dpadUp = Number(Boolean(pad.buttons?.[12]?.pressed));
  const a = Boolean(pad.buttons?.[0]?.pressed);
  const x = Boolean(pad.buttons?.[2]?.pressed);
  const y = Boolean(pad.buttons?.[3]?.pressed);
  const start = Boolean(pad.buttons?.[9]?.pressed);
  const lookScale = GAMEPAD_LOOK_SCALE * (gamepadSensitivity / 0.5);

  return {
    moveX: clampUnit(lx + dpadRight - dpadLeft),
    moveY: clampUnit(ly + dpadDown - dpadUp),
    lookDX: rx * lookScale,
    lookDY: ry * lookScale,
    jump: a && !previous.a,
    interact: x && !previous.x,
    flashlight: y && !previous.y,
    start: start && !previous.start,
    pressed: { a, x, y, start },
  };
}

function clampUnit(value) {
  return Math.min(1, Math.max(-1, value));
}

export async function applyFullscreen(wanted) {
  if (typeof document === 'undefined') {
    return false;
  }
  const active = Boolean(document.fullscreenElement);
  try {
    if (wanted && !active) {
      await document.documentElement.requestFullscreen();
      return true;
    }
    if (!wanted && active) {
      await document.exitFullscreen();
      return false;
    }
  } catch {
    return active;
  }
  return Boolean(document.fullscreenElement);
}
