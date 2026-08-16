import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera } from 'three';
import { PortalController } from '../src/portal/PortalController.js';
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
});
