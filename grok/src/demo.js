import * as THREE from 'three';
import { PortalController } from './portal/PortalController.js';

export function createDemo(camera, renderer) {
  const roomA = new THREE.Scene();
  const roomB = new THREE.Scene();

  addSky(roomA, 0x2a3344);
  addFloor(roomA, 0x3d4a5c);
  addBox(roomA, [-1.6, 0.4, 2.1], [0.8, 0.8, 0.8], 0x4da3ff);

  addSky(roomB, 0x4a1c1c);
  addFloor(roomB, 0x5a2a24);
  addBox(roomB, [1.5, 0.4, -1.6], [0.8, 0.8, 0.8], 0xffcc33);

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

  addPortalFrame(roomA, [0, 1, 0], 0, 0x7ec8ff);
  addPortalFrame(roomB, [0, 1, 0], Math.PI, 0xffb020);

  controller.setCurrentScene('room-a');
  controller.setCameraPosition(0, 1, 4);
  camera.lookAt(0, 1, 0);

  return controller;
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

function addPortalFrame(scene, position, rotationY, color) {
  const frame = new THREE.Group();
  frame.position.set(...position);
  frame.rotation.y = rotationY;

  const thickness = 0.08;
  const width = 2.16;
  const height = 2.16;
  const depth = 0.1;
  const material = new THREE.MeshBasicMaterial({ color });
  const pieces = [
    [0, height / 2, 0, width + thickness * 2, thickness, depth],
    [0, -height / 2, 0, width + thickness * 2, thickness, depth],
    [-(width / 2), 0, 0, thickness, height, depth],
    [width / 2, 0, 0, thickness, height, depth],
  ];

  for (const [x, y, z, sx, sy, sz] of pieces) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    frame.add(mesh);
  }

  scene.add(frame);
}
