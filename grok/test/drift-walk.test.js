import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { PortalController } from '../src/engine/index.js';
import { loadWorld } from '../src/content/loadWorld.js';
import { evictBehind, kitsForDepth, openDrift, sealArrival, spawnLookahead, unusedLiveExits } from '../src/content/drift.js';
import { unusedExits } from '../src/content/generateRoom.js';
import { validateWorld } from '../scripts/validate-world.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

function mockRenderer() {
  return {
    autoClear: true,
    clippingPlanes: [],
    setClearColor() {},
    setSize() {},
    getContext() { return {}; },
    state: { buffers: {} },
    clear() {},
    render() {},
  };
}

function roomForScene(controller, scene) {
  return controller.rooms.find((room) => room.scene === scene) ?? null;
}

describe('Drift walk harness', () => {
  it('walks 40 sealed crosses without a dead end or a leak', () => {
    const catalog = readJson('data/catalog.json');
    const materials = readJson('data/materials.json');
    const config = readJson('data/generators/drift.json');
    const seed = 'walk-40';
    const world = openDrift({ seed, depth: 0 });
    assert.deepEqual(validateWorld(world, catalog, materials), []);
    assert.ok(world.rooms[0].portals.filter((portal) => portal.role === 'exit').length >= config.minExits);

    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    controller.drift = { seed, depth: 0, origins: world.originPool };
    controller.setCurrentScene(world.startRoom);

    const seen = new Set([controller.currentRoom.id]);
    const disposed = new Set();

    for (let step = 0; step < 40; step += 1) {
      const current = controller.currentRoom;
      const liveExits = unusedLiveExits(current);
      const readyExits = current.portals.filter((portal) => (
        portal.userData.role === 'exit'
        && portal.enabled !== false
        && portal.destinationPortal
      ));
      if (readyExits.length === 0 && liveExits.length) {
        spawnLookahead(controller, {
          catalog,
          kits: kitsForDepth((current.depth ?? step) + 1),
          seed,
          depth: current.depth ?? step,
          room: current,
        });
      }
      const doors = current.portals.filter((portal) => (
        portal.userData.role === 'exit'
        && portal.enabled !== false
        && portal.destinationPortal
      ));
      assert.ok(doors.length >= 1, `step ${step} room ${current.id} has no live dest door`);
      const pick = doors[step % doors.length];
      const destPortal = pick.destinationPortal;
      const destRoom = roomForScene(controller, destPortal.scene);
      assert.ok(destRoom, `step ${step} dest room missing`);
      const destUnused = destRoom.portals.filter((portal) => portal.userData.role === 'exit');
      assert.ok(destUnused.length >= 1, `step ${step} dest ${destRoom.id} has no unused exits before arrival`);

      assert.equal(sealArrival(pick), true);
      assert.equal(destPortal.enabled, false);
      for (const sibling of destUnused) {
        assert.notEqual(sibling.userData.sealed, true);
      }

      const beforeIds = new Set(controller.rooms.map((room) => room.id));
      controller.setCurrentScene(destRoom.id);
      controller.drift.depth = destRoom.depth ?? step + 1;
      const spawned = spawnLookahead(controller, {
        catalog,
        kits: kitsForDepth((destRoom.depth ?? step) + 1),
        seed,
        depth: destRoom.depth ?? step + 1,
        room: destRoom,
      });
      assert.ok(spawned.length >= 1, `step ${step} spawned no lookahead`);
      assert.equal(unusedLiveExits(destRoom).length, 0);
      const evicted = evictBehind(controller, { maxLive: config.maxLiveRooms });
      for (const id of evicted) {
        disposed.add(id);
        assert.ok(!controller.rooms.some((room) => room.id === id));
      }
      assert.ok(controller.rooms.length <= config.maxLiveRooms, `live ${controller.rooms.length} > ${config.maxLiveRooms}`);
      for (const portal of controller.allPortals) {
        const destId = portal.userData.destinationId;
        if (!destId) {
          continue;
        }
        const dest = controller.getPortal(destId);
        if (dest) {
          const destHall = roomForScene(controller, dest.scene);
          assert.ok(destHall, `portal ${portal.portalId} points at a removed room`);
          assert.ok(!disposed.has(destHall.id), `portal ${portal.portalId} points at disposed ${destHall.id}`);
        }
      }
      seen.add(destRoom.id);
      assert.ok(!beforeIds.has(spawned[0].id) || spawned.length >= 1);
    }

    assert.ok(seen.size >= 40);
    const again = openDrift({ seed, depth: 0 });
    assert.equal(again.rooms[0].id, world.rooms[0].id);
    assert.equal(again.rooms[0].kitId, world.rooms[0].kitId);
    assert.equal(unusedExits(again.rooms[1]).length >= 2, true);
  });
});
