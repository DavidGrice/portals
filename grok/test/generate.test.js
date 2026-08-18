import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { createRng } from '../src/content/rng.js';
import {
  allocateOrigin,
  createOriginPool,
  generateRoom,
  linkRooms,
  unusedExits,
  worldFromRooms,
} from '../src/content/generateRoom.js';
import { openDrift, sealArrival, spawnLookahead } from '../src/content/drift.js';
import { addRoom, relinkPortals } from '../src/content/loadWorld.js';
import { PortalController } from '../src/engine/index.js';
import { validateWorld } from '../scripts/validate-world.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

describe('room compiler', () => {
  it('builds a kit room with at least one exit and a one-way entry', () => {
    const kit = readJson('data/kits/cyber-cyan.json');
    const room = generateRoom({ kit, roomId: 'gen-a', depth: 0, exitCount: 1 });
    const exits = room.portals.filter((portal) => portal.role === 'exit');
    const entry = room.portals.find((portal) => portal.role === 'entry');
    assert.ok(exits.length >= 1);
    assert.equal(entry.oneWay, true);
    assert.ok(room.entities.some((entity) => entity.kind === 'arch.corridor'));
    assert.deepEqual(allocateOrigin(2, 1), [500, 0, 250]);
    const snapped = generateRoom({ kit: readJson('data/kits/haunt-hall.json'), roomId: 'snap', exitCount: 3 });
    const shell = { halfX: 8, zMin: -6.2 };
    for (const portal of snapped.portals.filter((entry) => entry.role === 'exit')) {
      if (portal.wall === 'north') {
        assert.equal(portal.position[2], shell.zMin);
        assert.equal(portal.position[0], 0);
      } else if (portal.wall === 'west') {
        assert.equal(portal.position[0], -shell.halfX);
      } else if (portal.wall === 'east') {
        assert.equal(portal.position[0], shell.halfX);
      }
    }
  });

  it('keeps reserved dest exits after worldFromRooms', () => {
    const catalog = readJson('data/catalog.json');
    const materials = readJson('data/materials.json');
    const haunt = readJson('data/kits/haunt-hall.json');
    const cyan = readJson('data/kits/cyber-cyan.json');
    const start = generateRoom({ kit: cyan, roomId: 'keep-a', origin: [0, 0, 0], depth: 0, exitCount: 2 });
    const dest = generateRoom({ kit: haunt, roomId: 'keep-b', origin: [250, 0, 0], depth: 1, exitCount: 3 });
    const destUnusedBefore = unusedExits(dest).length;
    assert.ok(destUnusedBefore >= 2, `dest compiled with ${destUnusedBefore} unused exits`);
    linkRooms(start, dest);
    const world = worldFromRooms([start, dest]);
    const kept = world.rooms.find((room) => room.id === 'keep-b');
    const destUnused = unusedExits(kept);
    assert.ok(destUnused.length >= 2, `pruned dest down to ${destUnused.length} unused exits`);
    assert.ok(destUnused.every((portal) => portal.reserved || portal.role === 'exit'));
    assert.ok(kept.entities.some((entity) => destUnused.some((portal) => entity.props?.coversPortalId === portal.id)));
    assert.equal(world.generated, true);
    assert.deepEqual(validateWorld(world, catalog, materials), []);
  });

  it('rejects unlinked exits on authored worlds and allows them on generated ones', () => {
    const catalog = readJson('data/catalog.json');
    const materials = readJson('data/materials.json');
    const kit = readJson('data/kits/cyber-cyan.json');
    const room = generateRoom({ kit, roomId: 'auth', exitCount: 2 });
    const authored = { id: 'authored', startRoom: room.id, rooms: [room] };
    assert.ok(validateWorld(authored, catalog, materials).some((error) => error.includes('destinationId')));
    const generated = { id: 'generated', generated: true, startRoom: room.id, rooms: [room] };
    assert.deepEqual(validateWorld(generated, catalog, materials), []);
  });

  it('links two compiled rooms into a valid world', () => {
    const catalog = readJson('data/catalog.json');
    const materials = readJson('data/materials.json');
    const cyan = readJson('data/kits/cyber-cyan.json');
    const haunt = readJson('data/kits/haunt-hall.json');
    const a = generateRoom({ kit: cyan, roomId: 'a', origin: [0, 0, 0], depth: 0 });
    const b = generateRoom({ kit: haunt, roomId: 'b', origin: [250, 0, 0], depth: 1 });
    linkRooms(a, b);
    const world = worldFromRooms([a, b]);
    assert.deepEqual(validateWorld(world, catalog, materials), []);
    assert.equal(a.portals.find((portal) => portal.role === 'exit').destinationId, 'door-in-b');
    assert.equal(b.portals.find((portal) => portal.role === 'entry').destinationId.startsWith('door-out-a'), true);
  });

  it('is deterministic for a seed', () => {
    const kit = readJson('data/kits/haunt-hall.json');
    const first = generateRoom({ kit, roomId: 's', exitCount: 2, rng: createRng('seed-1') });
    const second = generateRoom({ kit, roomId: 's', exitCount: 2, rng: createRng('seed-1') });
    assert.deepEqual(
      first.portals.map((portal) => portal.id),
      second.portals.map((portal) => portal.id),
    );
  });

  it('never emits a dead-end or colliding origin across 200 compiles', () => {
    const catalog = readJson('data/catalog.json');
    const materials = readJson('data/materials.json');
    const kits = [readJson('data/kits/cyber-cyan.json'), readJson('data/kits/haunt-hall.json')];
    const origins = new Set();
    const ids = new Set();
    for (let i = 0; i < 200; i += 1) {
      const rng = createRng(`batch-${i}`);
      const kit = kits[i % kits.length];
      const room = generateRoom({
        kit,
        roomId: `r${i}`,
        origin: allocateOrigin(i, i % 3),
        depth: i,
        branch: i % 3,
        exitCount: 1 + (i % 2),
        rng,
      });
      const exits = room.portals.filter((portal) => portal.role === 'exit');
      assert.ok(exits.length >= 1, `room ${room.id} has no exit`);
      assert.ok(!ids.has(room.id));
      ids.add(room.id);
      const key = room.origin.join(',');
      assert.ok(!origins.has(key), `origin collision ${key}`);
      origins.add(key);
      if (i % 20 === 0) {
        const extra = generateRoom({
          kit: kits[(i + 1) % kits.length],
          roomId: `x${i}`,
          origin: allocateOrigin(i + 1, 9),
          depth: i + 1,
        });
        linkRooms(room, extra);
        assert.deepEqual(validateWorld(worldFromRooms([room, extra]), catalog, materials), []);
      }
    }
    assert.equal(origins.size, 200);
  });

  it('spawns lookahead dest rooms for unlinked exits', () => {
    const catalog = readJson('data/catalog.json');
    const kit = readJson('data/kits/cyber-cyan.json');
    const start = generateRoom({ kit, roomId: 'start', origin: [0, 0, 0], depth: 0, exitCount: 1 });
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = new PortalController({
      camera,
      renderer: {
        autoClear: true,
        clippingPlanes: [],
        setClearColor() {},
        setSize() {},
        getContext() { return {}; },
        state: { buffers: {} },
        clear() {},
        render() {},
      },
    });
    addRoom(controller, start, catalog);
    relinkPortals(controller, { strict: false });
    controller.setCurrentScene('start');
    const spawned = spawnLookahead(controller, { catalog, kits: [kit], seed: 'look', depth: 0 });
    assert.ok(spawned.length >= 1);
    const exit = controller.currentScenePortals.find((portal) => portal.userData.role === 'exit');
    assert.ok(exit.destinationPortal);
    assert.ok(controller.rooms.length >= 2);
  });

  it('seals the arrival door so the player cannot walk back', () => {
    const catalog = readJson('data/catalog.json');
    const kit = readJson('data/kits/cyber-cyan.json');
    const start = generateRoom({ kit, roomId: 'start', origin: [0, 0, 0], depth: 0, exitCount: 1 });
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = new PortalController({
      camera,
      renderer: {
        autoClear: true,
        clippingPlanes: [],
        setClearColor() {},
        setSize() {},
        getContext() { return {}; },
        state: { buffers: {} },
        clear() {},
        render() {},
      },
    });
    addRoom(controller, start, catalog);
    relinkPortals(controller, { strict: false });
    controller.setCurrentScene('start');
    spawnLookahead(controller, { catalog, kits: [kit], seed: 'seal', depth: 0 });
    const exit = controller.currentScenePortals.find((portal) => portal.userData.role === 'exit');
    assert.equal(sealArrival(exit), true);
    assert.equal(exit.destinationPortal.enabled, false);
    assert.equal(exit.destinationPortal.oneWay, true);
  });

  it('opens a seeded Drift world with reserved dest exits still in place', () => {
    const first = openDrift({ seed: 'abcd', depth: 0 });
    const second = openDrift({ seed: 'abcd', depth: 0 });
    assert.equal(first.id, 'drift');
    assert.ok(first.rooms.length >= 3);
    assert.equal(first.rooms[0].id, second.rooms[0].id);
    const startExits = first.rooms[0].portals.filter((portal) => portal.role === 'exit');
    assert.ok(startExits.length >= 2);
    assert.ok(startExits.every((portal) => portal.destinationId));
    for (const dest of first.rooms.slice(1)) {
      assert.ok(unusedExits(dest).length >= 2, `${dest.id} lost unused exits`);
    }
  });

  it('never compiles fewer than minExits across 200 Drift rooms', () => {
    const config = readJson('data/generators/drift.json');
    for (let i = 0; i < 200; i += 1) {
      const world = openDrift({ seed: `batch-${i}`, depth: i % 5 });
      for (const room of world.rooms) {
        const exits = room.portals.filter((portal) => portal.role === 'exit');
        assert.ok(exits.length >= config.minExits, `${room.id} has ${exits.length} exits`);
      }
    }
  });

  it('refuses a kit that cannot meet minExits', () => {
    const kit = {
      id: 'dead-end',
      title: 'Dead',
      sockets: [{ id: 'entry', role: 'entry', position: [0, 1, 0], yaw: Math.PI }],
    };
    assert.throws(() => generateRoom({ kit, roomId: 'dead', minExits: 2, exitCount: 2 }), /need 2/);
  });

  it('recycles origin cells after release and never collides while live', () => {
    const pool = createOriginPool();
    const seen = new Set();
    const ids = [];
    for (let i = 0; i < 500; i += 1) {
      const id = `live-${i}`;
      const origin = pool.acquire(id);
      const key = origin.join(',');
      assert.ok(!seen.has(key), `live collision ${key}`);
      seen.add(key);
      ids.push(id);
    }
    assert.equal(pool.liveCount(), 500);
    for (const id of ids.slice(0, 200)) {
      assert.equal(pool.release(id), true);
    }
    assert.equal(pool.liveCount(), 300);
    const recycled = pool.acquire('recycle-a');
    assert.ok(seen.has(recycled.join(',')));
    const again = [];
    for (let i = 0; i < 500; i += 1) {
      again.push(pool.acquire(`second-${i}`).join(','));
    }
    const liveKeys = new Set(again);
    liveKeys.add(recycled.join(','));
    for (const id of ids.slice(200)) {
      liveKeys.add(pool.originOf(id).join(','));
    }
    assert.equal(liveKeys.size, pool.liveCount());
  });

  it('seals only the arrival door and leaves sibling exits live', () => {
    const catalog = readJson('data/catalog.json');
    const kit = readJson('data/kits/haunt-hall.json');
    const start = generateRoom({ kit, roomId: 'seal-start', origin: [0, 0, 0], depth: 0, exitCount: 2 });
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = new PortalController({
      camera,
      renderer: {
        autoClear: true,
        clippingPlanes: [],
        setClearColor() {},
        setSize() {},
        getContext() { return {}; },
        state: { buffers: {} },
        clear() {},
        render() {},
      },
    });
    addRoom(controller, start, catalog);
    relinkPortals(controller, { strict: false });
    controller.setCurrentScene('seal-start');
    spawnLookahead(controller, { catalog, kits: [kit], seed: 'seal-sib', depth: 0 });
    const exit = controller.currentScenePortals.find((portal) => portal.userData.role === 'exit');
    const destRoom = controller.rooms.find((room) => room.scene === exit.destinationPortal.scene);
    const destSiblings = destRoom.portals.filter((portal) => portal.userData.role === 'exit');
    assert.ok(destSiblings.length >= 2);
    assert.equal(sealArrival(exit), true);
    assert.equal(exit.destinationPortal.enabled, false);
    assert.equal(exit.destinationPortal.userData.sealed, true);
    assert.ok(exit.destinationPortal.userData.sealSlab);
    for (const sibling of destSiblings) {
      assert.notEqual(sibling.enabled, false);
      assert.notEqual(sibling.userData.sealed, true);
    }
  });
});
