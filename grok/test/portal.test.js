import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Vector3 } from 'three';
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

  it('uses two triangles that both face +Z', () => {
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
