import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { Emitter, GraphicsSettings, Portal, PortalController, Room } from '../src/engine/index.js';
import { loadWorld, kindsByCategory } from '../src/content/loadWorld.js';
import { validateWorld } from '../scripts/validate-world.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

function mockRenderer() {
  return {
    autoClear: true,
    setClearColor() {},
    setSize() {},
    getContext() {
      return {};
    },
    state: { buffers: {} },
    clear() {},
    render() {},
  };
}

describe('world data', () => {
  it('applies graphics profiles without a live renderer', () => {
    const high = GraphicsSettings.fromProfile('high');
    assert.equal(high.recursion, 3);
    assert.equal(high.aa, true);
    const low = GraphicsSettings.fromProfile('low');
    assert.equal(low.recursion, 1);
    assert.equal(low.aa, false);
  });

  it('exports the engine barrel', () => {
    assert.equal(typeof Portal, 'function');
    assert.equal(typeof PortalController, 'function');
    assert.equal(typeof Room, 'function');
    assert.equal(typeof Emitter, 'function');
    assert.equal(typeof PortalController.prototype.render, 'function');
  });

  it('classifies catalog kinds by category', () => {
    const catalog = readJson('data/catalog.json');
    const groups = kindsByCategory(catalog);
    assert.ok(groups.environment.includes('env.sky'));
    assert.ok(groups.prop.includes('prop.box'));
    assert.ok(groups.architecture.includes('arch.frame'));
  });

  it('loads two-rooms and resolves portal links', () => {
    const world = readJson('data/worlds/two-rooms.json');
    const catalog = readJson('data/catalog.json');
    const camera = new PerspectiveCamera(60, 1, 0.05, 100);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    const a = controller.getPortal('door-ab');
    const b = controller.getPortal('door-ba');
    assert.equal(controller.currentRoom.id, 'room-a');
    assert.equal(a.destinationId, 'door-ba');
    assert.equal(b.destinationId, 'door-ab');
    assert.equal(a.destinationPortal, b);
    const bc = controller.getPortal('door-bc');
    const cb = controller.getPortal('door-cb');
    assert.equal(bc.destinationId, 'door-cb');
    assert.equal(cb.destinationPortal, bc);
    const cd = controller.getPortal('door-cd');
    const dc = controller.getPortal('door-dc');
    assert.equal(cd.destinationPortal, dc);
    assert.equal(controller.getPortal('door-dc').destinationId, 'door-cd');
    assert.equal(world.rooms.length, 4);
  });

  it('validates the shipped world against the catalog', () => {
    const world = readJson('data/worlds/two-rooms.json');
    const catalog = readJson('data/catalog.json');
    assert.deepEqual(validateWorld(world, catalog), []);
    assert.ok(groupsHasLight(catalog));
  });
});

function groupsHasLight(catalog) {
  return Boolean(catalog.kinds['env.light']);
}
