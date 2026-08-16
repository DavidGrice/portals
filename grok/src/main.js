import * as THREE from 'three';
import { Portal } from './portal/Portal.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2.4, 1.4, 3.2);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const portal = new Portal(2, 2);
portal.setScene(scene);
portal.setVolumeFromCamera(camera);
portal.material[0].color.set(0x4da3ff);
portal.material[0].wireframe = true;
portal.material[1].color.set(0xff5c7a);
portal.material[1].wireframe = true;
portal.toggleVolumeFaces(true);
scene.add(portal);

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  portal.setVolumeFromCamera(camera);
}

window.addEventListener('resize', resize);

function tick() {
  portal.rotation.y += 0.005;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();
