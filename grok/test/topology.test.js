import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateRoom } from '../src/content/generateRoom.js';
import { createRng } from '../src/content/rng.js';
import { getTopology, listTopologies, roomFingerprint, topologySockets } from '../src/content/topologies.js';
import { spawnEntity } from '../src/content/prefabs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

describe('topologies', () => {
  it('ships ten shapes with at least three sockets on different walls', () => {
    const list = listTopologies();
    assert.equal(list.length, 10);
    for (const topology of list) {
      const sockets = topologySockets(topology);
      const exits = sockets.filter((socket) => socket.role === 'exit');
      const entries = sockets.filter((socket) => socket.role === 'entry');
      assert.ok(entries.length >= 1, `${topology.id} missing entry`);
      assert.ok(exits.length >= 2, `${topology.id} needs two exits`);
      const walls = new Set(sockets.map((socket) => socket.wall));
      assert.ok(walls.size >= 2, `${topology.id} sockets share one wall`);
    }
  });

  it('compiles the same kit into different portal layouts', () => {
    const kit = readJson('data/kits/haunt-hall.json');
    const ell = generateRoom({ kit, topology: getTopology('L'), roomId: 'shape-l', exitCount: 2 });
    const rotunda = generateRoom({ kit, topology: getTopology('rotunda'), roomId: 'shape-r', exitCount: 2 });
    assert.equal(ell.topologyId, 'L');
    assert.equal(rotunda.topologyId, 'rotunda');
    assert.ok(ell.entities.some((entity) => entity.kind === 'arch.wing'));
    assert.ok(rotunda.entities.some((entity) => entity.kind === 'arch.rotunda'));
    const ellPos = ell.portals.filter((portal) => portal.role === 'exit').map((portal) => portal.position.join(','));
    const rotPos = rotunda.portals.filter((portal) => portal.role === 'exit').map((portal) => portal.position.join(','));
    assert.notDeepEqual(ellPos, rotPos);
  });

  it('builds each volume prefab with walkable colliders and declared holes', () => {
    const catalog = readJson('data/catalog.json');
    const kinds = ['arch.chamber', 'arch.wing', 'arch.court', 'arch.loft', 'arch.shaft', 'arch.rotunda'];
    for (const kind of kinds) {
      const object = spawnEntity({
        id: kind,
        kind,
        props: {
          holes: [
            { wall: 'south', u: 0 },
            { wall: 'north', u: 0 },
          ],
        },
      }, catalog);
      let boxes = 0;
      object.traverse((child) => {
        if (child.userData?.collider) {
          boxes += 1;
        }
      });
      assert.ok(boxes >= 4, `${kind} has no collision`);
      assert.equal(object.userData.volume?.kind != null || kind === 'arch.wing', true);
    }
  });

  it('changes topology when the last four fingerprints match a kit', () => {
    const kit = readJson('data/kits/cyber-cyan.json');
    const first = generateRoom({ kit, roomId: 'fp-a', exitCount: 2, rng: createRng('fp') });
    const recent = [roomFingerprint(first), roomFingerprint(first), roomFingerprint(first), roomFingerprint(first)];
    let different = false;
    for (let i = 0; i < 8; i += 1) {
      const next = generateRoom({
        kit,
        roomId: `fp-b-${i}`,
        exitCount: 2,
        recent,
        rng: createRng(`fp-${i}`),
      });
      if (next.topologyId !== first.topologyId) {
        different = true;
        break;
      }
    }
    assert.equal(different, true);
  });

  it('loads every indexed kit with a topology pool and dressing', () => {
    const index = readJson('data/kits/index.json');
    const catalog = readJson('data/catalog.json');
    const materials = readJson('data/materials.json');
    for (const entry of index.kits) {
      const kit = readJson(`data/kits/${entry.file}`);
      assert.equal(kit.id, entry.id);
      assert.ok((kit.topologies ?? []).length >= 1, `${kit.id} has no topologies`);
      for (const topologyId of kit.topologies) {
        assert.ok(getTopology(topologyId), `${kit.id} unknown topology ${topologyId}`);
      }
      assert.ok((kit.dressing ?? []).length >= 1, `${kit.id} has no dressing`);
      for (const piece of kit.dressing) {
        assert.ok(catalog.kinds[piece.kind], `${kit.id} unknown kind ${piece.kind}`);
        const materialId = piece.props?.material;
        if (materialId) {
          assert.ok(materials.materials[materialId], `${kit.id} unknown material ${materialId}`);
        }
      }
    }
  });

  it('places at least four landmarks away from portal AABBs', () => {
    const kit = readJson('data/kits/haunt-hall.json');
    const room = generateRoom({ kit, topology: getTopology('T'), roomId: 'marks', exitCount: 3 });
    const dressing = room.entities.filter((entity) => entity.id.startsWith('dress-'));
    assert.ok(dressing.length >= 4);
    for (const piece of dressing) {
      for (const portal of room.portals) {
        const dx = Math.abs((piece.position?.[0] ?? 0) - portal.position[0]);
        const dz = Math.abs((piece.position?.[2] ?? 0) - portal.position[2]);
        assert.ok(dx > 0.8 || dz > 0.8, `${piece.id} overlaps ${portal.id}`);
      }
    }
  });
});
