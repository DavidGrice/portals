import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { applyLook, Emitter, GraphicsSettings, Portal, PortalController, Room } from '../src/engine/index.js';
import { loadWorld, kindsByCategory } from '../src/content/loadWorld.js';
import { listMaterials, resolveMaterial } from '../src/content/materials.js';
import { listWorlds } from '../src/ui/worlds.js';
import { validateWorld } from '../scripts/validate-world.js';
import { bedForRoom } from '../src/engine/audio.js';

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
    const ultra = GraphicsSettings.fromProfile('ultra');
    assert.equal(ultra.recursion, 4);
    assert.equal(ultra.hardwareAa, true);
    assert.equal(ultra.aaMode, 'off');
    const performance = GraphicsSettings.fromProfile('performance');
    assert.equal(performance.recursion, 1);
    assert.equal(performance.hardwareAa, false);
    assert.equal(performance.shadows, false);
  });

  it('migrates legacy low/high profile names and the old aa checkbox', () => {
    const high = GraphicsSettings.fromProfile('high');
    assert.equal(high.profile, 'balanced');
    const low = new GraphicsSettings({ profile: 'low', aa: false });
    assert.equal(low.profile, 'performance');
    assert.equal(low.aaMode, 'off');
    const fxaa = new GraphicsSettings({ profile: 'high', aa: true });
    assert.equal(fxaa.profile, 'balanced');
    assert.equal(fxaa.aaMode, 'fxaa');
    assert.equal(fxaa.hardwareAa, true);
  });

  it('keeps post-process AA and control options independent of the preset', () => {
    const next = GraphicsSettings.fromProfile('ultra', {
      aaMode: 'smaa',
      mouseSensitivity: 0.9,
      invertY: true,
    });
    assert.equal(next.profile, 'ultra');
    assert.equal(next.aaMode, 'smaa');
    assert.equal(next.mouseSensitivity, 0.9);
    assert.equal(next.invertY, true);
    assert.equal(next.shadows, true);
    assert.equal(next.fillLight, true);
  });

  it('applies look sensitivity and invert Y', () => {
    const camera = new PerspectiveCamera(60, 1, 0.05, 100);
    camera.rotation.order = 'YXZ';
    camera.quaternion.setFromEuler(camera.rotation);
    applyLook(camera, 10, 0, { mouseSensitivity: 0.5, invertY: false });
    const yaw = camera.rotation.setFromQuaternion(camera.quaternion, 'YXZ').y;
    assert.ok(yaw < 0, `yaw ${yaw}`);
    const before = camera.rotation.x;
    applyLook(camera, 0, 10, { mouseSensitivity: 0.5, invertY: true });
    const pitch = camera.rotation.setFromQuaternion(camera.quaternion, 'YXZ').x;
    assert.ok(pitch > before, `pitch ${pitch}`);
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
    assert.ok(groups.prop.includes('prop.glass'));
    assert.ok(groups.prop.includes('prop.screen'));
    assert.ok(groups.architecture.includes('arch.frame'));
    assert.ok(groups.architecture.includes('arch.corridor'));
    assert.ok(groups.interact.includes('interact.pad'));
    assert.ok(groups.prop.includes('prop.model'));
    assert.ok(groups.prop.includes('prop.npc'));
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
    assert.ok(world.rooms.length >= 5);
    assert.equal(controller.getPortal('door-de').enabled, false);
    assert.equal(controller.getPortal('door-ed').destinationId, 'door-de');
    assert.ok(Math.abs(a.position.x - b.position.x) > 200, 'A and B halls must not share an origin');
    assert.ok(Math.abs(bc.position.x - cb.position.x) > 200, 'B and C halls must not share an origin');
    assert.ok(Math.abs(cd.position.x - dc.position.x) > 200, 'C and D halls must not share an origin');
    const kinds = new Set();
    for (const room of controller.rooms) {
      room.scene.traverse((object) => {
        if (object.userData.kind) {
          kinds.add(object.userData.kind);
        }
      });
    }
    assert.ok(kinds.has('prop.glass'));
    assert.ok(kinds.has('prop.screen'));
  });

  it('lists worlds with a preview image for the picker', () => {
    const index = readJson('data/worlds/index.json');
    assert.ok(index.worlds.length >= 2);
    assert.equal(index.worlds[0].id, 'two-rooms');
    assert.equal(index.worlds[1].id, 'haunted-house');
    assert.ok(index.worlds[0].preview.startsWith('/worlds/'));
    const drift = index.worlds.find((entry) => entry.id === 'drift');
    assert.equal(drift.preview, '/worlds/drift.jpg');
    assert.match(drift.blurb, /do not come back/i);
    assert.ok(index.worlds[1].preview.startsWith('/worlds/'));
    assert.ok(listWorlds().every((entry) => entry.status !== 'draft'));
    assert.ok(listWorlds().some((entry) => entry.id === 'circuit-grid'));
    assert.ok(listWorlds().some((entry) => entry.id === 'ages'));
  });

  it('resolves named materials and validates every listed world', () => {
    const catalog = readJson('data/catalog.json');
    const materials = readJson('data/materials.json');
    const index = readJson('data/worlds/index.json');
    assert.ok(listMaterials(materials).includes('cyber.grid.cyan'));
    const cyan = resolveMaterial('cyber.grid.cyan', { library: materials });
    assert.equal(cyan.recipe, 'circuit');
    assert.ok(cyan.emissiveIntensity > 0);
    for (const entry of index.worlds) {
      const world = readJson(`data/worlds/${entry.file}`);
      if (world.generated) {
        continue;
      }
      assert.deepEqual(validateWorld(world, catalog, materials), [], entry.id);
    }
    assert.ok(groupsHasLight(catalog));
  });

  it('loads circuit-grid and picks cyber / ages beds from tags', () => {
    const world = readJson('data/worlds/circuit-grid.json');
    const catalog = readJson('data/catalog.json');
    const camera = new PerspectiveCamera(60, 1, 0.05, 100);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    assert.equal(controller.currentRoom.id, 'white-core');
    assert.equal(controller.getPortal('door-wc').destinationId, 'door-cw');
    assert.equal(controller.getPortal('door-br').destinationId, 'door-rb');
    assert.ok(Math.abs(controller.getPortal('door-wc').position.x - controller.getPortal('door-cw').position.x) > 200);
    assert.equal(bedForRoom(controller.currentRoom), 'cyber');
    assert.equal(bedForRoom({ id: 'mesozoic', tags: ['ages', 'prehistoric'] }), 'agesPast');
    assert.equal(bedForRoom({ id: 'orbital', tags: ['ages', 'future'] }), 'agesFuture');
    const volumes = new Set();
    for (const room of controller.rooms) {
      room.scene.traverse((object) => {
        if (object.userData.volume?.kind) {
          volumes.add(`${room.id}:${object.userData.volume.kind}`);
        }
      });
    }
    assert.ok(volumes.has('white-core:plus'));
    assert.ok(volumes.has('cyan-lane:chamber'));
    assert.ok(volumes.has('blue-lane:loft'));
    assert.ok(volumes.has('shaft:shaft'));
    assert.ok(volumes.has('ribbon:court'));
    assert.ok(controller.rooms.some((room) => room.id === 'ribbon'));
    assert.equal(controller.getPortal('door-wx').destinationId, 'door-xw');
    assert.equal(controller.getPortal('door-cg').enabled, false);
  });

  it('loads nine distinct Ages volumes', () => {
    const world = readJson('data/worlds/ages.json');
    const catalog = readJson('data/catalog.json');
    const camera = new PerspectiveCamera(60, 1, 0.05, 100);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    assert.equal(world.rooms.length, 9);
    const kinds = {};
    for (const room of controller.rooms) {
      room.scene.traverse((object) => {
        if (object.userData.volume?.kind) {
          kinds[room.id] = object.userData.volume.kind;
        }
      });
    }
    assert.equal(kinds.primordial, 'court');
    assert.equal(kinds.mesozoic, 'court');
    assert.equal(kinds.stone, 'wing');
    assert.equal(kinds.ancient, 'chamber');
    assert.equal(kinds.medieval, 'chamber');
    assert.equal(kinds.industrial, 'plus');
    assert.equal(kinds.present, 'chamber');
    assert.equal(kinds['near-future'], 'loft');
    assert.equal(kinds.orbital, 'rotunda');
    assert.ok(kinds.medieval !== kinds.industrial);
    assert.ok(controller.rooms.find((room) => room.id === 'primordial').scene.children.some((child) => child.userData?.water || child.userData?.kind === 'prop.water'));
    let npcs = 0;
    controller.rooms.find((room) => room.id === 'mesozoic').scene.traverse((object) => {
      if (object.userData.npc) {
        npcs += 1;
      }
    });
    assert.ok(npcs >= 1);
    assert.equal(bedForRoom(controller.rooms.find((room) => room.id === 'primordial')), 'agesPrimordial');
    assert.equal(bedForRoom(controller.rooms.find((room) => room.id === 'industrial')), 'agesIndustrial');
  });
});

function groupsHasLight(catalog) {
  return Boolean(catalog.kinds['env.light']);
}
