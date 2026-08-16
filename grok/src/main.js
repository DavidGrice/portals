import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createDemo } from './demo.js';
import { createPortalRenderer, probeCapabilities } from './engine/capabilities.js';

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 100);
const renderer = createPortalRenderer();
document.body.appendChild(renderer.domElement);

const capabilities = await probeCapabilities();
document.documentElement.dataset.portalBackend = capabilities.portalBackend;
document.documentElement.dataset.webgpu = capabilities.webgpu ? 'yes' : 'no';
console.info('portals-grok capabilities', capabilities);

const controller = createDemo(camera, renderer);
controller.setSize(window.innerWidth, window.innerHeight);

const controls = new PointerLockControls(camera, document.body);
const welcome = document.getElementById('welcome');
const enterButton = document.getElementById('welcome-enter');
const gpuLine = document.getElementById('welcome-gpu');
const skipHud = new URLSearchParams(window.location.search).has('nohud');

if (gpuLine) {
  const adapter = capabilities.adapterLabel ? ` · ${capabilities.adapterLabel}` : '';
  gpuLine.textContent = `${capabilities.reason}${adapter}`;
}

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
  requestAnimationFrame(tick);
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
