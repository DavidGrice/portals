import { detectTouch } from '../engine/deviceProfile.js';

export { detectTouch };

export function createTouchState() {
  return {
    active: detectTouch(),
    moveX: 0,
    moveY: 0,
    lookDX: 0,
    lookDY: 0,
    jump: false,
  };
}

export function resetTouchState(state) {
  state.moveX = 0;
  state.moveY = 0;
  state.lookDX = 0;
  state.lookDY = 0;
  state.jump = false;
}

export function consumeTouchLook(state) {
  const dx = state.lookDX;
  const dy = state.lookDY;
  state.lookDX = 0;
  state.lookDY = 0;
  return { dx, dy };
}

export function consumeTouchJump(state) {
  if (!state.jump) {
    return false;
  }
  state.jump = false;
  return true;
}

export function applyTouchMove(move, state) {
  if (!state.active) {
    return move;
  }
  if (state.moveY < 0) {
    move.forward = Math.max(move.forward, -state.moveY);
  } else if (state.moveY > 0) {
    move.back = Math.max(move.back, state.moveY);
  }
  if (state.moveX < 0) {
    move.left = Math.max(move.left, -state.moveX);
  } else if (state.moveX > 0) {
    move.right = Math.max(move.right, state.moveX);
  }
  return move;
}

const JOYSTICK_RATIO = 52 / 120;

export function bindTouchControls({ hud, state, onJump, onPause }) {
  const look = document.getElementById('touch-look');
  const joy = document.getElementById('touch-joy');
  const knob = document.getElementById('touch-joy-knob');
  const jump = document.getElementById('touch-jump');
  const pause = document.getElementById('hud-pause');

  if (!hud) {
    return () => {};
  }

  let joyId = null;
  let lookId = null;
  const joyCenter = { x: 0, y: 0 };
  let joyRadius = 52;
  const lookLast = { x: 0, y: 0 };

  function setVisible(visible) {
    hud.hidden = !visible;
    if (!visible) {
      endJoy();
      lookId = null;
      resetTouchState(state);
    }
  }

  function updateJoy(clientX, clientY) {
    let dx = clientX - joyCenter.x;
    let dy = clientY - joyCenter.y;
    const distance = Math.hypot(dx, dy);
    if (distance > joyRadius) {
      dx = (dx / distance) * joyRadius;
      dy = (dy / distance) * joyRadius;
    }
    state.moveX = dx / joyRadius;
    state.moveY = dy / joyRadius;
    if (knob) {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }

  function endJoy() {
    joyId = null;
    state.moveX = 0;
    state.moveY = 0;
    if (knob) {
      knob.style.transform = 'translate(0, 0)';
    }
  }

  function onJoyStart(event) {
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }
    event.preventDefault();
    joyId = touch.identifier;
    const rect = joy.getBoundingClientRect();
    joyCenter.x = rect.left + rect.width / 2;
    joyCenter.y = rect.top + rect.height / 2;
    joyRadius = rect.width * JOYSTICK_RATIO;
    updateJoy(touch.clientX, touch.clientY);
  }

  function onLookStart(event) {
    if (event.target.closest('.touch-joy, .touch-btn, .hud-pause')) {
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }
    lookId = touch.identifier;
    lookLast.x = touch.clientX;
    lookLast.y = touch.clientY;
  }

  function onTouchMove(event) {
    for (const touch of event.changedTouches) {
      if (touch.identifier === joyId) {
        event.preventDefault();
        updateJoy(touch.clientX, touch.clientY);
      } else if (touch.identifier === lookId) {
        event.preventDefault();
        state.lookDX += touch.clientX - lookLast.x;
        state.lookDY += touch.clientY - lookLast.y;
        lookLast.x = touch.clientX;
        lookLast.y = touch.clientY;
      }
    }
  }

  function onTouchEnd(event) {
    for (const touch of event.changedTouches) {
      if (touch.identifier === joyId) {
        endJoy();
      } else if (touch.identifier === lookId) {
        lookId = null;
      }
    }
  }

  look?.addEventListener('touchstart', onLookStart, { passive: true });
  joy?.addEventListener('touchstart', onJoyStart, { passive: false });
  jump?.addEventListener('touchstart', (event) => {
    event.preventDefault();
    state.jump = true;
    onJump?.();
  }, { passive: false });
  pause?.addEventListener('click', () => onPause?.());
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);
  window.addEventListener('touchcancel', onTouchEnd);

  return { setVisible, isTouch: state.active };
}
