import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import cyberCyan from '../../data/kits/cyber-cyan.json' with { type: 'json' };
import hauntHall from '../../data/kits/haunt-hall.json' with { type: 'json' };
import agesMesozoic from '../../data/kits/ages-mesozoic.json' with { type: 'json' };
import agesStone from '../../data/kits/ages-stone.json' with { type: 'json' };
import agesPresent from '../../data/kits/ages-present.json' with { type: 'json' };
import agesIndustrial from '../../data/kits/ages-industrial.json' with { type: 'json' };
import agesOrbital from '../../data/kits/ages-orbital.json' with { type: 'json' };
import agesPrimordial from '../../data/kits/ages-primordial.json' with { type: 'json' };
import agesAncient from '../../data/kits/ages-ancient.json' with { type: 'json' };
import agesMedieval from '../../data/kits/ages-medieval.json' with { type: 'json' };
import agesNearFuture from '../../data/kits/ages-near-future.json' with { type: 'json' };
import generatorConfig from '../../data/generators/drift.json' with { type: 'json' };
import { createRng, pickOne } from './rng.js';
import {
  createOriginPool,
  generateRoom,
  linkRooms,
  pickExitCount,
  worldFromRooms,
} from './generateRoom.js';
import { addRoom, dressRooms, relinkPortals } from './loadWorld.js';

const KIT_BY_ID = {
  'cyber-cyan': cyberCyan,
  'haunt-hall': hauntHall,
  'ages-mesozoic': agesMesozoic,
  'ages-stone': agesStone,
  'ages-present': agesPresent,
  'ages-industrial': agesIndustrial,
  'ages-orbital': agesOrbital,
  'ages-primordial': agesPrimordial,
  'ages-ancient': agesAncient,
  'ages-medieval': agesMedieval,
  'ages-near-future': agesNearFuture,
};

export function kitsForDepth(depth = 0, config = generatorConfig) {
  const row = [...(config.depths ?? [])].find((entry) => depth <= (entry.until ?? 99))
    ?? config.depths?.[config.depths.length - 1];
  const ids = row?.kits ?? Object.keys(KIT_BY_ID);
  return ids.map((id) => KIT_BY_ID[id]).filter(Boolean);
}

export function openDrift({
  seed = String(Math.floor(Math.random() * 0xffff).toString(16)),
  depth = 0,
  config = generatorConfig,
} = {}) {
  const rng = createRng(`${seed}:${depth}`);
  const kits = kitsForDepth(depth, config);
  if (!kits.length) {
    throw new Error('openDrift has no kits for this depth');
  }
  const minExits = Number(config.minExits ?? 2);
  const maxExits = Number(config.maxExits ?? 4);
  const pool = createOriginPool();
  const startKit = pickOne(rng, kits);
  const startId = `drift-${depth}`;
  const start = generateRoom({
    kit: startKit,
    roomId: startId,
    origin: pool.acquire(startId),
    depth,
    exitCount: pickExitCount(rng, {
      minExits,
      maxExits: Math.min(3, maxExits),
      available: 4,
    }),
    minExits,
    rng,
  });
  const dests = [];
  for (const [index, exit] of start.portals.filter((portal) => portal.role === 'exit').entries()) {
    const destKit = pickOne(rng, kitsForDepth(depth + 1, config));
    const destId = `drift-${depth + 1}-${index}`;
    const dest = generateRoom({
      kit: destKit,
      roomId: destId,
      origin: pool.acquire(destId),
      depth: depth + 1,
      branch: index,
      exitCount: pickExitCount(rng, { minExits, maxExits, available: 4 }),
      minExits,
      rng,
    });
    linkRooms(start, dest, exit.id);
    dests.push(dest);
  }
  const world = worldFromRooms([start, ...dests], { id: 'drift', startRoom: start.id });
  world.seed = seed;
  world.depth = depth;
  world.originPool = pool;
  return world;
}

export function disposeSiblings(controller, keepId) {
  const removed = [];
  for (const room of controller.rooms) {
    if (room.id === keepId || room.id === controller.currentRoom?.id) {
      continue;
    }
    if (controller.removeRoom?.(room.id)) {
      controller.drift?.origins?.release(room.id);
      removed.push(room.id);
    }
  }
  return removed;
}

export function evictBehind(controller, { maxLive = generatorConfig.maxLiveRooms ?? 6 } = {}) {
  const rooms = controller.rooms;
  if (rooms.length <= maxLive) {
    return [];
  }
  const current = controller.currentRoom;
  const destScenes = new Set(
    (current?.portals ?? [])
      .map((portal) => portal.destinationPortal?.scene)
      .filter(Boolean),
  );
  const extras = rooms.filter((room) => room !== current && !destScenes.has(room.scene));
  const removed = [];
  while (controller.rooms.length > maxLive && extras.length) {
    const room = extras.shift();
    if (controller.removeRoom?.(room.id)) {
      controller.drift?.origins?.release(room.id);
      removed.push(room.id);
    }
  }
  return removed;
}

export function unusedLiveExits(room) {
  return (room?.portals ?? []).filter((portal) => {
    const role = portal.userData?.role ?? portal.role;
    return role === 'exit' && portal.enabled !== false && !portal.destinationPortal;
  });
}

export function spawnLookahead(controller, {
  catalog,
  kits,
  seed,
  depth = 0,
  room = controller.currentRoom,
  config = generatorConfig,
} = {}) {
  if (!room || !kits?.length) {
    return [];
  }
  const spawned = [];
  const rng = createRng(`${seed}:${depth}:${room.id}`);
  const pool = controller.drift?.origins ?? createOriginPool();
  if (controller.drift) {
    controller.drift.origins = pool;
  }
  const minExits = Number(config.minExits ?? 2);
  const maxExits = Number(config.maxExits ?? 4);
  const exits = unusedLiveExits(room);
  for (const [index, exit] of exits.entries()) {
    const kit = pickOne(rng, kits);
    const destId = `d${depth + 1}-${index}-${Math.floor(rng() * 1e6)}`;
    const dest = generateRoom({
      kit,
      roomId: destId,
      origin: pool.acquire(destId),
      depth: depth + 1,
      branch: index,
      exitCount: pickExitCount(rng, { minExits, maxExits, available: 4 }),
      minExits,
      rng,
    });
    const entry = dest.portals.find((portal) => portal.role === 'entry');
    entry.destinationId = exit.portalId;
    exit.userData.destinationId = entry.id;
    addRoom(controller, dest, catalog);
    spawned.push(dest);
  }
  relinkPortals(controller, { strict: false });
  dressRooms(controller);
  return spawned;
}

export function spawnSealSlab(portal) {
  if (!portal?.scene) {
    return null;
  }
  if (portal.userData.sealSlab) {
    return portal.userData.sealSlab;
  }
  const mesh = new Mesh(
    new BoxGeometry(2.2, 2.2, 0.14),
    new MeshStandardMaterial({ color: 0x2a2420, roughness: 0.94, metalness: 0.04 }),
  );
  mesh.position.copy(portal.position);
  mesh.quaternion.copy(portal.quaternion);
  mesh.translateZ(0.14);
  mesh.userData.collider = { type: 'aabb' };
  mesh.userData.sealSlab = true;
  mesh.userData.noPortal = true;
  portal.scene.add(mesh);
  portal.userData.sealSlab = mesh;
  return mesh;
}

export function killFrameGlow(scene, portalId) {
  let count = 0;
  scene?.traverse((object) => {
    if (object.userData?.coversPortalId !== portalId) {
      return;
    }
    object.userData.sealed = true;
    object.traverse((child) => {
      if (child.userData.portalGlow) {
        child.visible = false;
        if (child.material) {
          child.material.opacity = 0;
        }
        count += 1;
      }
      if (child.userData.portalOccluder) {
        child.visible = true;
        child.userData.collider = { type: 'aabb' };
      }
    });
  });
  return count;
}

export function sealArrival(portal) {
  const dest = portal?.destinationPortal;
  if (!dest) {
    return false;
  }
  dest.enabled = false;
  dest.oneWay = true;
  dest.userData.sealed = true;
  spawnSealSlab(dest);
  killFrameGlow(dest.scene, dest.portalId);
  return true;
}
