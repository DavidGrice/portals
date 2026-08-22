import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { createSession } from '../src/game/session.js';
import { GraphicsSettings } from '../src/engine/index.js';
import { getWorldData, listWorlds } from '../src/ui/worlds.js';

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

  it('loads every picker world through createSession', () => {
    const catalog = readJson('data/catalog.json');
    const settings = new GraphicsSettings({ profile: 'balanced' });
    const worlds = listWorlds();
    assert.ok(worlds.length >= 5);
    for (const entry of worlds) {
      const world = getWorldData(entry.id);
      assert.equal(world.id, entry.id, entry.id);
      const session = createSession({
        settings,
        world,
        catalog,
        camera: new PerspectiveCamera(60, 1, 0.05, 280),
        renderer: mockRenderer(),
      });
      assert.ok(session.controller.currentRoom, entry.id);
      assert.ok(session.controller.rooms.length >= 1, entry.id);
      session.dispose();
    }
  });

  it('rethrows world load failures so Play can recover', () => {
    assert.throws(() => createSession({
      world: {
        id: 'broken',
        rooms: [{
          id: 'r',
          portals: [{ id: 'door-a', destinationId: 'missing' }],
        }],
        startRoom: 'r',
      },
      catalog: readJson('data/catalog.json'),
      camera: new PerspectiveCamera(60, 1, 0.05, 280),
      renderer: mockRenderer(),
    }), /Missing destination portal/);
  });

  it('disposes an owned renderer if world load throws', () => {
    const canvas = {
      removed: false,
      remove() {
        this.removed = true;
      },
    };
    const owned = {
      ...mockRenderer(),
      disposed: false,
      lost: false,
      domElement: canvas,
      dispose() {
        this.disposed = true;
      },
      forceContextLoss() {
        this.lost = true;
      },
    };
    assert.throws(() => createSession({
      world: {
        id: 'broken',
        rooms: [{
          id: 'r',
          portals: [{ id: 'door-a', destinationId: 'missing' }],
        }],
        startRoom: 'r',
      },
      catalog: readJson('data/catalog.json'),
      camera: new PerspectiveCamera(60, 1, 0.05, 280),
      createRenderer: () => owned,
    }), /Missing destination portal/);
    assert.equal(owned.disposed, true);
    assert.equal(owned.lost, true);
    assert.equal(canvas.removed, true);
  });

});
