import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createDemo } from './demo.js';
import { createPortalRenderer, probeCapabilities } from './engine/index.js';

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 100);
const renderer = createPortalRenderer();
document.body.insertBefore(renderer.domElement, document.body.firstChild);

const controller = createDemo(camera, renderer);
controller.setSize(window.innerWidth, window.innerHeight);

const controls = new PointerLockControls(camera, renderer.domElement);
const welcome = document.getElementById('welcome');
const enterButton = document.getElementById('welcome-enter');
const gpuLine = document.getElementById('welcome-gpu');
const params = new URLSearchParams(window.location.search);
const skipHud = params.has('nohud');
const debugPanel = document.getElementById('debug');
const showDebug = params.has('debug');
const debugLocal = new THREE.Vector3();
let lastCross = '—';

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
}

const move = { forward: false, back: false, left: false, right: false };
const clock = new THREE.Clock();
const eyeHeight = 1;
const moveSpeed = 4;

function enterWorld() {
  if (welcome) {
    welcome.hidden = true;
  }
  controls.lock();
}

enterButton?.addEventListener('click', enterWorld);

controls.addEventListener('lock', () => {
  if (welcome) {
    welcome.hidden = true;
  }
});

controls.addEventListener('unlock', () => {
  if (welcome && !skipHud) {
    welcome.hidden = false;
  }
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Enter' && welcome && !welcome.hidden) {
    enterWorld();
    return;
  }
  setMove(event.code, true);
});

window.addEventListener('keyup', (event) => {
  setMove(event.code, false);
});

window.addEventListener('resize', () => {
  controller.setSize(window.innerWidth, window.innerHeight);
});

function tick() {
  const dt = clock.getDelta();

  if (controls.isLocked) {
    const forward = Number(move.forward) - Number(move.back);
    const right = Number(move.right) - Number(move.left);
    controls.moveForward(forward * moveSpeed * dt);
    controls.moveRight(right * moveSpeed * dt);
    camera.position.y = eyeHeight;
  }

  controller.update();
  controller.render();
  if (showDebug) {
    updateDebug(controller.currentRoom?.id);
  }
  requestAnimationFrame(tick);
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
    `gpu   ${document.documentElement.dataset.webgpu ?? '?'} / ${document.documentElement.dataset.portalBackend ?? '?'}`,
  ].join('\n');
}

tick();

function setMove(code, down) {
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      move.forward = down;
      break;
    case 'KeyS':
    case 'ArrowDown':
      move.back = down;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      move.left = down;
      break;
    case 'KeyD':
    case 'ArrowRight':
      move.right = down;
      break;
    default:
      break;
  }
}
