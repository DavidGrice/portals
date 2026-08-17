import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng } from '../src/content/rng.js';
import { allocateOrigin, generateRoom, linkRooms, worldFromRooms } from '../src/content/generateRoom.js';
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
    assert.deepEqual(allocateOrigin(2, 1), [500 + 10000, 0, 0]);
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
});
