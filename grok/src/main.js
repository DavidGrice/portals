import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createDemo } from './demo.js';

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controller = createDemo(camera, renderer);
controller.setSize(window.innerWidth, window.innerHeight);

const controls = new PointerLockControls(camera, document.body);
const blocker = document.getElementById('blocker');
if (new URLSearchParams(window.location.search).has('nohud')) {
  blocker.hidden = true;
}
const move = { forward: false, back: false, left: false, right: false };
const clock = new THREE.Clock();
const eyeHeight = 1;
const moveSpeed = 4;

blocker.addEventListener('click', () => {
  controls.lock();
});

controls.addEventListener('lock', () => {
  blocker.hidden = true;
});

controls.addEventListener('unlock', () => {
  blocker.hidden = false;
});

window.addEventListener('keydown', (event) => {
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
