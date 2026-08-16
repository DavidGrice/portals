import * as THREE from 'three';
import { PortalGeometry } from './portal/PortalGeometry.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2.4, 1.4, 3.2);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const geometry = new PortalGeometry(2, 2);
geometry.setVolume(camera.fov, camera.aspect, camera.near);

const mesh = new THREE.Mesh(geometry, [
  new THREE.MeshBasicMaterial({ color: 0x4da3ff, wireframe: true }),
  new THREE.MeshBasicMaterial({ color: 0xff5c7a, wireframe: true }),
]);
scene.add(mesh);

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  geometry.setVolume(camera.fov, camera.aspect, camera.near);
}

window.addEventListener('resize', resize);

function tick() {
  mesh.rotation.y += 0.005;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();
