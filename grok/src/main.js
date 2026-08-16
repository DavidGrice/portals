import * as THREE from 'three';
import { PortalController } from './portal/PortalController.js';

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const roomA = new THREE.Scene();
roomA.background = new THREE.Color(0x111111);

const roomB = new THREE.Scene();
roomB.background = new THREE.Color(0x1a1210);

const controller = new PortalController({ camera, renderer });
controller.registerScene('room-a', roomA);
controller.registerScene('room-b', roomB);

const portalA = controller.createPortal(2, 2, 'room-a');
const portalB = controller.createPortal(2, 2, 'room-b');
portalA.setDestinationPortal(portalB);
portalB.setDestinationPortal(portalA);

controller.setCurrentScene('room-a');
controller.setCameraPosition(2.4, 1.4, 3.2);
camera.lookAt(0, 0, 0);
controller.setSize(window.innerWidth, window.innerHeight);

for (const portal of controller.allPortals) {
  portal.material[0].color.set(0x4da3ff);
  portal.material[0].wireframe = true;
  portal.material[1].color.set(0xff5c7a);
  portal.material[1].wireframe = true;
  portal.toggleVolumeFaces(true);
}

// Visible this step only. Stencil parenting comes with the render pass.
roomA.add(portalA);

window.addEventListener('resize', () => {
  controller.setSize(window.innerWidth, window.innerHeight);
});

function tick() {
  portalA.rotation.y += 0.005;
  renderer.render(controller.currentScene, camera);
  requestAnimationFrame(tick);
}

tick();
