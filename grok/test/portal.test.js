import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FrontSide, Scene, PerspectiveCamera, Quaternion, Vector3, Vector4 } from 'three';
import { Portal } from '../src/portal/Portal.js';
import { PortalController } from '../src/portal/PortalController.js';
import { PortalGeometry } from '../src/portal/PortalGeometry.js';
import { Room } from '../src/portal/Room.js';

function mockRenderer() {
  return {
    autoClear: true,
    clearColor: 0,
    clippingPlanes: [],
    setClearColor(color) {
      this.clearColor = color;
    },
    setSize() {},
    getContext() {
      return {};
    },
    state: { buffers: {} },
    clear() {},
    render() {},
  };
}

function makeThreeRooms() {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.05, 100);
  const controller = new PortalController({ camera, renderer: mockRenderer() });
  controller.registerScene('room-a', new Scene(), { clearColor: 0x2a3344 });
  controller.registerScene('room-b', new Scene(), { clearColor: 0x4a1c1c });
  controller.registerScene('room-c', new Scene(), { clearColor: 0x1c3328 });
  const ab = controller.createPortal(2, 2, 'room-a', { id: 'door-ab' });
  ab.position.set(0, 1, 0);
  const ba = controller.createPortal(2, 2, 'room-b', { id: 'door-ba' });
  ba.position.set(0, 1, 0);
  ba.rotateY(Math.PI);
  const bc = controller.createPortal(2, 2, 'room-b', { id: 'door-bc' });
  bc.position.set(0, 1, -5);
  const cb = controller.createPortal(2, 2, 'room-c', { id: 'door-cb' });
  cb.position.set(0, 1, 0);
  cb.rotateY(Math.PI);
  ab.setDestinationPortal(ba);
  ba.setDestinationPortal(ab);
  bc.setDestinationPortal(cb);
  cb.setDestinationPortal(bc);
  for (const portal of controller.allPortals) {
    portal.updateMatrixWorld(true);
  }
  return { camera, controller, ab, ba, bc, cb };
}

function bindDestCamera(controller, src, sourceCamera) {
  const destCamera = controller._portalCamera;
  controller._copyCameraOptics(destCamera);
  destCamera.matrixWorld.copy(controller.computePortalViewMatrix(src, sourceCamera));
  destCamera.matrixWorldInverse.copy(destCamera.matrixWorld).invert();
  return destCamera;
}

function projectPoint(destCamera, world) {
  const clip = new Vector4(world.x, world.y, world.z, 1)
    .applyMatrix4(destCamera.matrixWorldInverse)
    .applyMatrix4(destCamera.projectionMatrix);
  const ndcZ = clip.z / clip.w;
  const inClip =
    clip.w > 0 && Math.abs(clip.x) <= clip.w && Math.abs(clip.y) <= clip.w && Math.abs(clip.z) <= clip.w;
  return { inClip, ndcZ };
}

function makePair() {
  const camera = new PerspectiveCamera(60, 1, 0.05, 100);
  const renderer = mockRenderer();
  const roomA = new Scene();
  const roomB = new Scene();
  const controller = new PortalController({ camera, renderer });
  controller.registerScene('room-a', roomA, { clearColor: 0x2a3344, tags: ['start'] });
  controller.registerScene('room-b', roomB, { clearColor: 0x4a1c1c });
  const a = controller.createPortal(2, 2, 'room-a', { id: 'door-ab' });
  a.position.set(0, 1, 0);
  const b = controller.createPortal(2, 2, 'room-b', { id: 'door-ba' });
  b.position.set(0, 1, 0);
  b.rotateY(Math.PI);
  a.setDestinationPortal(b);
  b.setDestinationPortal(a);
  controller.setCurrentScene('room-a');
  return { camera, controller, a, b };
}

describe('portal engine', () => {
  it('stores rooms and portal ids', () => {
    const { controller, a } = makePair();
    assert.equal(controller.currentRoom instanceof Room, true);
    assert.equal(controller.currentRoom.id, 'room-a');
    assert.equal(controller.getPortal('door-ab'), a);
    assert.equal(a.portalId, 'door-ab');
    assert.equal(a.destinationId, 'door-ba');
  });

  it('teleports when crossing the door plane', () => {
    const { camera, controller } = makePair();
    camera.position.set(0, 1, 2);
    controller.update();
    camera.position.set(0, 1, -0.05);
    controller.update();
    assert.equal(controller.currentRoom.id, 'room-b');
  });

  it('emerges in the dest hall, not back on the same side', () => {
    const { camera, controller, b } = makePair();
    camera.position.set(0, 1, 0.4);
    camera.lookAt(0, 1, 0);
    controller.update();
    camera.position.set(0, 1, -0.05);
    controller.update();
    assert.equal(controller.currentRoom.id, 'room-b');
    const local = camera.position.clone();
    b.updateMatrixWorld(true);
    b.worldToLocal(local);
    assert.ok(local.z > 0.1, `dest hall local z ${local.z}`);
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    assert.ok(forward.z < -0.5, `look into dest hall ${forward.z}`);
    assert.equal(controller._shouldDrawPortal(b, null), false);
  });

  it('keeps dest eye off the dest plane when the player is close', () => {
    const { camera, controller, a, b } = makePair();
    camera.position.set(0, 1, 0.08);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    a.updateMatrixWorld(true);
    b.updateMatrixWorld(true);
    const destCamera = bindDestCamera(controller, a, camera);
    controller._stabilizeDestCamera(destCamera, b);
    const local = new Vector3();
    destCamera.matrixWorld.decompose(local, new Quaternion(), new Vector3());
    b.worldToLocal(local);
    assert.ok(Math.abs(local.z) >= 0.3, `dest eye local z ${local.z}`);
  });

  it('uses a door-sized front and a volume only on -Z', () => {
    const geometry = new PortalGeometry(2, 2);
    const p = geometry.attributes.position.array;
    const idx = geometry.index.array;
    const n = (a, b, c) => {
      const ax = p[c * 3] - p[a * 3];
      const ay = p[c * 3 + 1] - p[a * 3 + 1];
      const bx = p[b * 3] - p[a * 3];
      const by = p[b * 3 + 1] - p[a * 3 + 1];
      return bx * ay - by * ax;
    };
    assert.ok(n(idx[0], idx[1], idx[2]) > 0);
    assert.ok(n(idx[3], idx[4], idx[5]) > 0);
    assert.ok(Math.abs(p[0]) < geometry.halfWidth);
    assert.ok(Math.abs(p[1]) < geometry.halfHeight);
    assert.ok(p[2] > 0);
    for (let i = 4; i < 8; i += 1) {
      assert.ok(p[i * 3 + 2] < 0, `volume z ${p[i * 3 + 2]}`);
    }
    const portal = new Portal(2, 2);
    assert.equal(portal.material[0].side, FrontSide);
    assert.equal(portal.material[1].side, FrontSide);
    assert.equal(portal.material[0].colorWrite, false);
  });

  it('does not teleport on a sidestep', () => {
    const { camera, controller } = makePair();
    camera.position.set(3, 1, 2);
    controller.update();
    camera.position.set(3, 1, -0.05);
    controller.update();
    assert.equal(controller.currentRoom.id, 'room-a');
  });

  it('emits leave, enter, and cross in order', () => {
    const { camera, controller } = makePair();
    const log = [];
    controller.on('room:leave', ({ roomId }) => log.push(`leave:${roomId}`));
    controller.on('room:enter', ({ roomId }) => log.push(`enter:${roomId}`));
    controller.on('portal:cross', ({ portalId, from, to }) => log.push(`cross:${from}:${to}:${portalId}`));
    camera.position.set(0, 1, 2);
    controller.update();
    camera.position.set(0, 1, -0.05);
    controller.update();
    assert.deepEqual(log, ['leave:room-a', 'enter:room-b', 'cross:room-a:room-b:door-ab']);
  });

  it('skips the return door and a back-facing door', () => {
    const { camera, controller, a, b } = makePair();
    camera.position.set(0, 1, 4);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    a.updateMatrixWorld(true);
    b.updateMatrixWorld(true);
    assert.equal(controller._shouldDrawPortal(a, null), true);
    assert.equal(controller._shouldDrawPortal(b, 'door-ab'), false);
    assert.equal(controller._shouldDrawPortal(b, null), false);
  });

  it('keeps drawing dest until the camera crosses', () => {
    const { camera, controller, a } = makePair();
    camera.position.set(0, 1, 0.2);
    camera.updateMatrixWorld();
    a.updateMatrixWorld(true);
    assert.equal(controller._shouldDrawPortal(a, null), true);
    camera.position.set(0, 1, 0.05);
    camera.updateMatrixWorld();
    assert.equal(controller._shouldDrawPortal(a, null), true);
  });

  it('isolates one portal in the stencil scene', () => {
    const { controller, a, b } = makePair();
    controller._bindStencil([a], { allowVolume: false });
    assert.deepEqual([...controller._stencilScene.children], [a]);
    assert.equal(a.volumeMaterial.visible, false);
    controller._bindStencil([b], { allowVolume: false });
    assert.deepEqual([...controller._stencilScene.children], [b]);
  });

  it('maps A spawn to a dest camera looking into B', () => {
    const { camera, controller, a } = makePair();
    camera.position.set(0, 1, 4);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    a.updateMatrixWorld(true);
    a.destinationPortal.updateMatrixWorld(true);
    const pos = new Vector3();
    const quat = new Quaternion();
    const scale = new Vector3();
    controller.computePortalViewMatrix(a).decompose(pos, quat, scale);
    assert.ok(pos.z > 3, `dest camera z ${pos.z}`);
    const forward = new Vector3(0, 0, -1).applyQuaternion(quat);
    assert.ok(forward.z < -0.9, `dest forward ${forward.z}`);
  });

  it('keeps dest rooms at a healthy depth for every door', () => {
    const { camera, controller, ab, bc, cb } = makeThreeRooms();

    camera.position.set(0, 1, 4);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    const destBFromA = bindDestCamera(controller, ab, camera);
    assert.equal(destBFromA.parent, null);
    const gold = projectPoint(destBFromA, new Vector3(1.5, 0.4, -1.6));
    assert.equal(gold.inClip, true);
    assert.ok(Math.abs(gold.ndcZ) > 0.15, `A->B gold ndcZ ${gold.ndcZ}`);
    const planeAB = controller.buildDestClipPlane(ab.destinationPortal, destBFromA);
    assert.ok(planeAB.distanceToPoint(new Vector3(0, 1, -2)) > 0);
    assert.ok(planeAB.distanceToPoint(new Vector3(0, 1, 2)) < 0);

    camera.position.set(0, 1, -3);
    camera.lookAt(0, 1, -5);
    camera.updateMatrixWorld();
    const destCFromB = bindDestCamera(controller, bc, camera);
    const green = projectPoint(destCFromB, new Vector3(-1.4, 0.4, -2));
    assert.equal(green.inClip, true);
    assert.ok(Math.abs(green.ndcZ) > 0.15, `B->C green ndcZ ${green.ndcZ}`);
    const planeBC = controller.buildDestClipPlane(bc.destinationPortal, destCFromB);
    assert.ok(planeBC.distanceToPoint(new Vector3(-1.4, 0.4, -2)) > 0);
    assert.ok(planeBC.distanceToPoint(new Vector3(0, 1, 2)) < 0);

    camera.position.set(0, 1, -2);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    const destBFromC = bindDestCamera(controller, cb, camera);
    const redCube = projectPoint(destBFromC, new Vector3(1.5, 0.4, -1.6));
    const goldFrame = projectPoint(destBFromC, new Vector3(0, 1, 0));
    assert.equal(redCube.inClip, true);
    assert.equal(goldFrame.inClip, true);
    assert.ok(Math.abs(redCube.ndcZ) > 0.15, `C->B gold ndcZ ${redCube.ndcZ}`);
    const planeCB = controller.buildDestClipPlane(cb.destinationPortal, destBFromC);
    assert.ok(planeCB.distanceToPoint(new Vector3(1.5, 0.4, -1.6)) > 0);
    assert.ok(planeCB.distanceToPoint(new Vector3(0, 1, -7)) < 0);
    assert.equal(camera.matrixWorld.elements[14], camera.position.z);
  });

  it('emerges in front of an offset destination and does not bounce', () => {
    const camera = new PerspectiveCamera(60, 1, 0.05, 100);
    const controller = new PortalController({ camera, renderer: mockRenderer() });
    controller.registerScene('room-b', new Scene(), { clearColor: 0x4a1c1c });
    controller.registerScene('room-c', new Scene(), { clearColor: 0x1c3328 });
    const bc = controller.createPortal(2, 2, 'room-b', { id: 'door-bc' });
    bc.position.set(0, 1, -5);
    const cb = controller.createPortal(2, 2, 'room-c', { id: 'door-cb' });
    cb.position.set(0, 1, 0);
    cb.rotateY(Math.PI);
    bc.setDestinationPortal(cb);
    cb.setDestinationPortal(bc);
    controller.setCurrentScene('room-b');
    camera.position.set(0, 1, -3);
    camera.lookAt(0, 1, -5);
    controller.update();
    camera.position.set(0, 1, -5.05);
    controller.update();
    assert.equal(controller.currentRoom.id, 'room-c');
    const local = camera.position.clone();
    cb.updateMatrixWorld(true);
    cb.worldToLocal(local);
    assert.ok(local.z > 0.1, `emerge dest +Z ${local.z}`);
    const before = camera.position.clone();
    camera.position.add(new Vector3(0, 0, -0.2));
    controller.update();
    assert.equal(controller.currentRoom.id, 'room-c');
    assert.ok(camera.position.distanceTo(before) > 0.01);
  });

  it('teleports when walking back through the same door', () => {
    const { camera, controller, a } = makePair();
    camera.position.set(0, 1, 0.4);
    camera.lookAt(0, 1, 0);
    controller.update();
    camera.position.set(0, 1, -0.05);
    controller.update();
    assert.equal(controller.currentRoom.id, 'room-b');
    const inB = camera.position.clone();
    camera.position.copy(inB);
    controller.update();
    camera.position.z += 0.4;
    controller.update();
    assert.equal(controller.currentRoom.id, 'room-a');
    const local = camera.position.clone();
    a.updateMatrixWorld(true);
    a.worldToLocal(local);
    assert.ok(local.z > 0.1, `return hall local z ${local.z}`);
  });
});
