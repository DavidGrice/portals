import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { PortalController } from '../src/engine/index.js';
import { loadWorld } from '../src/content/loadWorld.js';
import {
  evictBehind,
  ensureForwardDoors,
  kitsForDepth,
  liveDestExits,
  logDriftEndRoom,
  openDrift,
  sealArrival,
  snapshotDriftRoom,
} from '../src/content/drift.js';
import { generateRoom, isForwardSocket, unusedExits } from '../src/content/generateRoom.js';
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

const catalogData = readJson('data/catalog.json');

function lookArgs(controller, room, seed) {
  const depth = room.depth ?? controller.drift?.depth ?? 0;
  return {
    catalog: catalogData,
    kits: kitsForDepth(depth + 1),
    seed,
    depth,
    room,
  };
}

function enterAndFill(controller, destRoom, seed, config) {
  controller.setCurrentScene(destRoom.id);
  controller.drift.depth = destRoom.depth ?? (controller.drift.depth ?? 0) + 1;
  const args = lookArgs(controller, destRoom, seed);
  ensureForwardDoors(controller, args);
  evictBehind(controller, { maxLive: config.maxLiveRooms });
  ensureForwardDoors(controller, args);
  return liveDestExits(destRoom, controller);
}

describe('Drift walk harness', () => {
  it('always compiles a forward door plus reserved unused exits', () => {
    const kit = readJson('data/kits/cyber-cyan.json');
    for (let i = 0; i < 40; i += 1) {
      const room = generateRoom({ kit, roomId: `fwd-${i}`, exitCount: 2, rng: () => i / 40 });
      const exits = room.portals.filter((portal) => portal.role === 'exit');
      assert.ok(exits.some((portal) => isForwardSocket({
        wall: portal.wall,
        position: portal.position,
      })), `${room.id} has no forward door`);
    }
  });

  it('walks 40 sealed crosses without a dead end or a leak', () => {
    const catalog = catalogData;
    const materials = readJson('data/materials.json');
    const config = readJson('data/generators/drift.json');
    const seed = 'walk-40';
    const world = openDrift({ seed, depth: 0 });
    assert.deepEqual(validateWorld(world, catalog, materials), []);
    assert.ok(world.rooms[0].portals.filter((portal) => portal.role === 'exit').length >= config.minExits);

    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    controller.drift = { seed, depth: 0, origins: world.originPool, seq: 0 };
    controller.setCurrentScene(world.startRoom);
    ensureForwardDoors(controller, lookArgs(controller, controller.currentRoom, seed));

    const seen = new Set([controller.currentRoom.id]);
    const disposed = new Set();

    for (let step = 0; step < 40; step += 1) {
      const current = controller.currentRoom;
      const doors = liveDestExits(current, controller);
      assert.ok(doors.length >= 1, `step ${step} room ${current.id} has no live dest door`);
      const pick = doors[step % doors.length];
      const destPortal = pick.destinationPortal;
      const destRoom = roomForScene(controller, destPortal.scene);
      assert.ok(destRoom, `step ${step} dest room missing`);
      const destUnused = destRoom.portals.filter((portal) => portal.userData.role === 'exit');
      assert.ok(destUnused.length >= 1, `step ${step} dest ${destRoom.id} has no unused exits before arrival`);

      const live = enterAndFill(controller, destRoom, seed, config);
      assert.equal(sealArrival(pick), true);
      assert.equal(destPortal.enabled, false);
      assert.ok(live.length >= 1, `step ${step} dest ${destRoom.id} has no spawnable door after enter`);
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
    }

    assert.ok(seen.size >= 40);
    const again = openDrift({ seed, depth: 0 });
    assert.equal(again.rooms[0].id, world.rooms[0].id);
    assert.equal(again.rooms[0].kitId, world.rooms[0].kitId);
    assert.equal(unusedExits(again.rooms[1]).length >= 2, true);
  });

  it('keeps at least one spawnable door on every seed through 16 hops', () => {
    const catalog = catalogData;
    const config = readJson('data/generators/drift.json');
    for (let seedIndex = 0; seedIndex < 40; seedIndex += 1) {
      const seed = `hop-${seedIndex}`;
      const world = openDrift({ seed, depth: 0 });
      const camera = new PerspectiveCamera(60, 1, 0.05, 280);
      const controller = loadWorld(world, catalog, camera, mockRenderer());
      controller.drift = { seed, depth: 0, origins: world.originPool, seq: 0 };
      controller.setCurrentScene(world.startRoom);
      ensureForwardDoors(controller, lookArgs(controller, controller.currentRoom, seed));

      for (let step = 0; step < 16; step += 1) {
        const doors = liveDestExits(controller.currentRoom, controller);
        assert.ok(
          doors.length >= 1,
          `seed ${seed} step ${step} room ${controller.currentRoom.id} has no door`,
        );
        const pick = doors[step % doors.length];
        const destRoom = roomForScene(controller, pick.destinationPortal.scene);
        assert.ok(destRoom, `seed ${seed} step ${step} dest missing`);
        const live = enterAndFill(controller, destRoom, seed, config);
        sealArrival(pick);
        assert.ok(
          live.length >= 1,
          `seed ${seed} step ${step} arrived in ${destRoom.id} with no spawnable door`,
        );
      }
    }
  });

  it('dumps an end-room snapshot for the browser console', () => {
    const world = openDrift({ seed: 'log-end', depth: 0 });
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = loadWorld(world, catalogData, camera, mockRenderer());
    controller.drift = { seed: 'log-end', depth: 0, origins: world.originPool, seq: 0 };
    const snap = snapshotDriftRoom(controller, controller.currentRoom);
    assert.equal(snap.seed, 'log-end');
    assert.ok(snap.roomId);
    assert.ok(Array.isArray(snap.portals));
    const warnings = [];
    const original = console.warn;
    console.warn = (...args) => warnings.push(args);
    try {
      const payload = logDriftEndRoom(controller, { evicted: [] });
      assert.equal(payload.roomId, snap.roomId);
      assert.equal(warnings.length, 1);
      assert.match(String(warnings[0][0]), /END ROOM/);
    } finally {
      console.warn = original;
    }
  });
});
