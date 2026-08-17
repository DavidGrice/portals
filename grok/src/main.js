import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createDemo } from './demo.js';
import { GraphicsSettings, Player, PostAA, createPortalRenderer, probeCapabilities } from './engine/index.js';
import { applyLook } from './engine/look.js';
import { bindOptions, refreshHud } from './ui/options.js';
import { applyTouchMove, bindTouchControls, consumeTouchJump, consumeTouchLook, createTouchState, detectTouch } from './ui/touch.js';

const settings = GraphicsSettings.load();
const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.05, 280);
const renderer = createPortalRenderer({
  antialias: settings.hardwareAa,
  pixelRatio: settings.pixelRatio === 'device' ? undefined : Number(settings.pixelRatio),
  shadows: settings.shadows,
});
document.body.insertBefore(renderer.domElement, document.body.firstChild);

const controller = createDemo(camera, renderer);
const postAA = new PostAA(renderer);
const controls = new PointerLockControls(camera, renderer.domElement);
controls.pointerSpeed = 0;
const player = new Player({ camera, eyeHeight: 1, moveSpeed: settings.moveSpeed, jumpSpeed: settings.jumpSpeed });
settings.apply({ camera, renderer, controller, player, postAA, controls });
controller.setSize(window.innerWidth, window.innerHeight);
postAA.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());

const welcome = document.getElementById('welcome');
const enterButton = document.getElementById('welcome-enter');
const gpuLine = document.getElementById('welcome-gpu');
const hint = document.getElementById('welcome-hint');
const fpsNode = document.getElementById('fps');
const deskPause = document.getElementById('desk-pause');
const params = new URLSearchParams(window.location.search);
const skipHud = params.has('nohud');
const debugPanel = document.getElementById('debug');
const showDebug = params.has('debug');
const debugLocal = new THREE.Vector3();
const isTouch = detectTouch();
const touch = createTouchState();
const lookHeld = { left: false, right: false, up: false, down: false };
const keys = { forward: 0, back: 0, left: 0, right: 0 };
const move = { forward: 0, back: 0, left: 0, right: 0 };
const clock = new THREE.Clock();
let lastCross = '—';
let playing = false;
let hasPlayed = false;
let fpsFrames = 0;
let fpsAcc = 0;

const options = bindOptions({
  settings,
  camera,
  renderer,
  controller,
  player,
  postAA,
  controls,
  bootHardwareAa: settings.hardwareAa,
  onClose: () => {
    if (hasPlayed && !playing) {
      welcome.hidden = false;
    }
  },
});

const touchHud = bindTouchControls({
  hud: document.getElementById('touch-hud'),
  state: touch,
  onJump: () => {
    if (playing) {
      player.jump();
    }
  },
  onPause: pauseWorld,
});

refreshHud(settings);
if (isTouch && hint) {
  hint.textContent = 'Left stick to move · drag to look · Jump to hop onto cubes';
}

if (showDebug && debugPanel) {
  debugPanel.hidden = false;
  controller.on('room:enter', ({ roomId }) => {
    updateDebug(roomId);
  });
  controller.on('portal:cross', ({ portalId, from, to }) => {
    lastCross = `${from} → ${to} via ${portalId ?? '?'}`;
    updateDebug(to);
  });
  updateDebug(controller.currentRoom?.id);
}

probeCapabilities().then((capabilities) => {
  document.documentElement.dataset.portalBackend = capabilities.portalBackend;
  document.documentElement.dataset.webgpu = capabilities.webgpu ? 'yes' : 'no';
  if (gpuLine) {
    const adapter = capabilities.adapterLabel ? ` · ${capabilities.adapterLabel}` : '';
    gpuLine.textContent = `${capabilities.reason}${adapter}`;
  }
  console.info('portals-grok capabilities', capabilities);
});

if (skipHud && welcome) {
  welcome.hidden = true;
  playing = true;
  hasPlayed = true;
  setHudVisible(true);
}

function enterWorld() {
  hasPlayed = true;
  playing = true;
  if (welcome) {
    welcome.hidden = true;
  }
  if (enterButton) {
    enterButton.textContent = 'Resume';
  }
  setHudVisible(true);
  if (!isTouch) {
    controls.lock();
  }
}

function pauseWorld() {
  playing = false;
  setHudVisible(false);
  if (!skipHud && welcome) {
    welcome.hidden = false;
  }
  if (controls.isLocked) {
    controls.unlock();
  }
}

function setHudVisible(visible) {
  touchHud.setVisible(visible && isTouch);
  if (deskPause) {
    deskPause.hidden = !(visible && !isTouch);
  }
}

enterButton?.addEventListener('click', enterWorld);
deskPause?.addEventListener('click', pauseWorld);

controls.addEventListener('lock', () => {
  if (welcome) {
    welcome.hidden = true;
  }
  playing = true;
  setHudVisible(true);
});

controls.addEventListener('unlock', () => {
  if (isTouch) {
    return;
  }
  playing = false;
  setHudVisible(false);
  if (welcome && !skipHud) {
    welcome.hidden = false;
  }
});

window.addEventListener('mousemove', (event) => {
  if (!controls.isLocked) {
    return;
  }
  applyLook(camera, event.movementX, event.movementY, settings);
});

window.addEventListener('keydown', (event) => {
  if (options.isOpen?.() && event.code === 'Escape') {
    options.close?.();
    return;
  }
  if (event.code === 'Enter' && welcome && !welcome.hidden && !options.isOpen?.()) {
    enterWorld();
    return;
  }
  if (event.code === 'Escape' && playing) {
    pauseWorld();
    return;
  }
  if (event.code === 'KeyO' && !options.isOpen?.()) {
    if (playing) {
      pauseWorld();
    }
    options.open?.();
    return;
  }
  setMove(event.code, true);
});

window.addEventListener('keyup', (event) => {
  setMove(event.code, false);
});

window.addEventListener('blur', () => {
  keys.forward = keys.back = keys.left = keys.right = 0;
  move.forward = move.back = move.left = move.right = 0;
  lookHeld.left = lookHeld.right = lookHeld.up = lookHeld.down = false;
});

window.addEventListener('resize', () => {
  controller.setSize(window.innerWidth, window.innerHeight);
  postAA.setSize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
});

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (playing) {
    move.forward = keys.forward;
    move.back = keys.back;
    move.left = keys.left;
    move.right = keys.right;
    const look = consumeTouchLook(touch);
    applyLook(camera, look.dx * 2.2, look.dy * 2.2, settings);
    applyLookKeys(dt);
    applyTouchMove(move, touch);
    if (consumeTouchJump(touch)) {
      player.jump();
    }
    player.step(dt, move, controls, controller.currentRoom);
  }

  controller.update();
  postAA.begin();
  controller.render();
  postAA.end();

  if (settings.showFps && fpsNode) {
    fpsFrames += 1;
    fpsAcc += dt;
    if (fpsAcc >= 0.4) {
      fpsNode.textContent = String(Math.round(fpsFrames / fpsAcc));
      fpsFrames = 0;
      fpsAcc = 0;
    }
  }
  if (showDebug) {
    updateDebug(controller.currentRoom?.id);
  }
  requestAnimationFrame(tick);
}

function applyLookKeys(dt) {
  const scale = (1000 / 1.4) * settings.lookKeySpeed * dt;
  const yaw = (Number(lookHeld.left) - Number(lookHeld.right)) * scale;
  const pitch = (Number(lookHeld.up) - Number(lookHeld.down)) * scale;
  applyLook(camera, yaw, pitch, settings);
}

function updateDebug(roomId) {
  if (!debugPanel || debugPanel.hidden) {
    return;
  }

  let nearest = '—';
  let nearestZ = '—';
  let best = Infinity;

  for (const portal of controller.allPortals) {
    debugLocal.copy(camera.position);
    portal.worldToLocal(debugLocal);
    if (Math.abs(debugLocal.z) < best) {
      best = Math.abs(debugLocal.z);
      nearest = portal.portalId ?? '?';
      nearestZ = debugLocal.z.toFixed(2);
    }
  }

  const drawn = controller.lastDrawInfo.drawn.join(',') || '—';
  const skipped = controller.lastDrawInfo.skipped.join(',') || '—';
  debugPanel.textContent = [
    `room  ${roomId ?? '—'}`,
    `near  ${nearest} z=${nearestZ}`,
    `draw  ${drawn}`,
    `skip  ${skipped}`,
    `dest  ${controller.lastDrawInfo.destCam ?? '—'}`,
    `clip  ${controller.lastDrawInfo.clip ?? 'none'}`,
    `cross ${lastCross}`,
    `y     ${camera.position.y.toFixed(2)} ground=${player.onGround ? player.supportY.toFixed(2) : 'air'}`,
    `gpu   ${document.documentElement.dataset.webgpu ?? '?'} / ${document.documentElement.dataset.portalBackend ?? '?'}`,
  ].join('\n');
}

tick();

function bindCode(action) {
  return settings.keybinds[action];
}

function setMove(code, down) {
  if (code === bindCode('forward')) {
    keys.forward = down ? 1 : 0;
  } else if (code === bindCode('back')) {
    keys.back = down ? 1 : 0;
  } else if (code === bindCode('left')) {
    keys.left = down ? 1 : 0;
  } else if (code === bindCode('right')) {
    keys.right = down ? 1 : 0;
  } else if (code === bindCode('jump')) {
    if (down) {
      player.jump();
    }
  } else if (code === bindCode('lookLeft')) {
    lookHeld.left = down;
  } else if (code === bindCode('lookRight')) {
    lookHeld.right = down;
  } else if (code === bindCode('lookUp')) {
    lookHeld.up = down;
  } else if (code === bindCode('lookDown')) {
    lookHeld.down = down;
  }
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'ArrowDown') {
    event.preventDefault();
  }
});
