import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { PortalController } from './portal/PortalController.js';

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const roomA = new THREE.Scene();
const roomB = new THREE.Scene();

addSky(roomA, 0x202028);
addFloor(roomA, 0x2a2a35);
addBox(roomA, [-2.2, 0.35, 0.4], [0.7, 0.7, 0.7], 0x4da3ff);

addSky(roomB, 0x3a1515);
addFloor(roomB, 0x4a2020);
addBox(roomB, [0, 1, -2], [1.2, 1.2, 1.2], 0xffcc33);

const controller = new PortalController({ camera, renderer });
controller.registerScene('room-a', roomA);
controller.registerScene('room-b', roomB);

const portalA = controller.createPortal(2, 2, 'room-a');
portalA.position.set(0, 1, 0);

const portalB = controller.createPortal(2, 2, 'room-b');
portalB.position.set(0, 1, 0);
portalB.rotateY(Math.PI);

portalA.setDestinationPortal(portalB);
portalB.setDestinationPortal(portalA);

controller.setCurrentScene('room-a');
controller.setCameraPosition(0, 1, 4);
camera.lookAt(0, 1, 0);
controller.setSize(window.innerWidth, window.innerHeight);

const controls = new PointerLockControls(camera, document.body);
const blocker = document.getElementById('blocker');
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

function addSky(scene, color) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(80, 16, 12),
    new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }),
  );
  scene.add(sky);
}

function addFloor(scene, color) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshBasicMaterial({ color }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
}

function addBox(scene, position, size, color) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ color }));
  box.position.set(...position);
  scene.add(box);
}
