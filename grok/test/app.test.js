import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { createSession } from '../src/game/session.js';
import { GraphicsSettings } from '../src/engine/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

function mockRenderer() {
  return {
    autoClear: true,
    shadowMap: { enabled: false, type: 0 },
    clippingPlanes: [],
    domElement: null,
    setClearColor() {},
    setSize() {},
    setPixelRatio() {},
    getPixelRatio() {
      return 1;
    },
    getContext() {
      return {};
    },
    state: { buffers: { color: {}, depth: {}, stencil: {} } },
    clear() {},
    render() {},
    dispose() {},
    forceContextLoss() {},
  };
}

describe('session boot', () => {
  it('loads a world through createSession and can dispose then load again', () => {
    const world = readJson('data/worlds/two-rooms.json');
    const catalog = readJson('data/catalog.json');
    const settings = new GraphicsSettings({ profile: 'balanced' });
    const first = createSession({
      settings,
      world,
      catalog,
      camera: new PerspectiveCamera(60, 1, 0.05, 280),
      renderer: mockRenderer(),
    });
    assert.equal(first.controller.currentRoom.id, 'room-a');
    assert.ok(first.controller.getPortal('door-ab').destinationPortal);
    assert.ok(first.gadgets.screens.length >= 1);
    first.dispose();
    assert.equal(first.gadgets, null);
    assert.equal(first.controller, null);

    const second = createSession({
      settings,
      world,
      catalog,
      camera: new PerspectiveCamera(60, 1, 0.05, 280),
      renderer: mockRenderer(),
    });
    assert.equal(second.controller.currentRoom.id, 'room-a');
    assert.equal(second.controller.getPortal('door-dc').destinationId, 'door-cd');
    second.dispose();
  });

});
