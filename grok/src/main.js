import * as THREE from 'three';
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

window.addEventListener('resize', () => {
  controller.setSize(window.innerWidth, window.innerHeight);
});

function tick() {
  controller.render();
  requestAnimationFrame(tick);
}

tick();

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
