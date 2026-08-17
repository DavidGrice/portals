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
    camera.position.set(0, 1, 0.05);
    controller.update();
    assert.equal(controller.currentRoom.id, 'room-b');
  });

  it('does not yank the camera on a same-place pair', () => {
    const { camera, controller } = makePair();
    camera.position.set(0, 1, 0.4);
    camera.lookAt(0, 1, 0);
    controller.update();
    camera.position.set(0, 1, 0.05);
    controller.update();
    assert.equal(controller.currentRoom.id, 'room-b');
    assert.ok(camera.position.z > 0, `camera z ${camera.position.z}`);
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
    camera.position.set(3, 1, 0.05);
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
    camera.position.set(0, 1, 0.05);
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

  it('clips behind dest and keeps dest-room points', () => {
    const { camera, controller, a } = makePair();
    camera.position.set(0, 1, 4);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    a.updateMatrixWorld(true);
    a.destinationPortal.updateMatrixWorld(true);
    camera.matrixAutoUpdate = false;
    camera.matrixWorld.copy(controller.computePortalViewMatrix(a));
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const proj = controller.computePortalProjectionMatrix(a.destinationPortal);

    const inClip = (world) => {
      const clip = new Vector4(world.x, world.y, world.z, 1)
        .applyMatrix4(camera.matrixWorldInverse)
        .applyMatrix4(proj);
      return (
        clip.w > 0 &&
        Math.abs(clip.x) <= clip.w &&
        Math.abs(clip.y) <= clip.w &&
        Math.abs(clip.z) <= clip.w
      );
    };

    assert.equal(inClip(new Vector3(0, 1, -2)), true);
    assert.equal(inClip(new Vector3(0, 1, 2)), false);
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
    camera.position.set(0, 1, -4.95);
    controller.update();
    assert.equal(controller.currentRoom.id, 'room-c');
    const local = camera.position.clone();
    cb.updateMatrixWorld(true);
    cb.worldToLocal(local);
    assert.ok(Math.abs(local.z) >= 0.3, `emerge local z ${local.z}`);
    const before = camera.position.clone();
    camera.position.add(new Vector3(0, 0, -0.2));
    controller.update();
    assert.equal(controller.currentRoom.id, 'room-c');
    assert.ok(camera.position.distanceTo(before) > 0.01);
  });
});
