import cyberCyan from '../../data/kits/cyber-cyan.json' with { type: 'json' };
import hauntHall from '../../data/kits/haunt-hall.json' with { type: 'json' };
import agesMesozoic from '../../data/kits/ages-mesozoic.json' with { type: 'json' };
import agesStone from '../../data/kits/ages-stone.json' with { type: 'json' };
import agesPresent from '../../data/kits/ages-present.json' with { type: 'json' };
import agesIndustrial from '../../data/kits/ages-industrial.json' with { type: 'json' };
import agesOrbital from '../../data/kits/ages-orbital.json' with { type: 'json' };
import generatorConfig from '../../data/generators/drift.json' with { type: 'json' };
import { createRng, pickInt, pickOne } from './rng.js';
import { allocateOrigin, generateRoom, linkRooms, worldFromRooms } from './generateRoom.js';
import { addRoom, dressRooms, relinkPortals } from './loadWorld.js';

const KIT_BY_ID = {
  'cyber-cyan': cyberCyan,
  'haunt-hall': hauntHall,
  'ages-mesozoic': agesMesozoic,
  'ages-stone': agesStone,
  'ages-present': agesPresent,
  'ages-industrial': agesIndustrial,
  'ages-orbital': agesOrbital,
};

export function kitsForDepth(depth = 0, config = generatorConfig) {
  const row = [...(config.depths ?? [])].find((entry) => depth <= (entry.until ?? 99))
    ?? config.depths?.[config.depths.length - 1];
  const ids = row?.kits ?? Object.keys(KIT_BY_ID);
  return ids.map((id) => KIT_BY_ID[id]).filter(Boolean);
}

export function openDrift({ seed = String(Math.floor(Math.random() * 0xffff).toString(16)), depth = 0 } = {}) {
  const rng = createRng(`${seed}:${depth}`);
  const kits = kitsForDepth(depth);
  const startKit = pickOne(rng, kits);
  const start = generateRoom({
    kit: startKit,
    roomId: `drift-${depth}`,
    origin: allocateOrigin(depth, 0),
    depth,
    exitCount: pickInt(rng, 1, 2),
    rng,
  });
  const dests = [];
  for (const [index, exit] of start.portals.filter((portal) => portal.role === 'exit').entries()) {
    const destKit = pickOne(rng, kitsForDepth(depth + 1));
    const dest = generateRoom({
      kit: destKit,
      roomId: `drift-${depth + 1}-${index}`,
      origin: allocateOrigin(depth + 1, index),
      depth: depth + 1,
      branch: index,
      exitCount: 1,
      rng,
    });
    linkRooms(start, dest, exit.id);
    dests.push(dest);
  }
  const world = worldFromRooms([start, ...dests], { id: 'drift', startRoom: start.id });
  world.seed = seed;
  world.depth = depth;
  return world;
}

export function disposeSiblings(controller, keepId) {
  const removed = [];
  for (const room of controller.rooms) {
    if (room.id === keepId || room.id === controller.currentRoom?.id) {
      continue;
    }
    if (controller.removeRoom?.(room.id)) {
      removed.push(room.id);
    }
  }
  return removed;
}

export function evictBehind(controller, { maxLive = generatorConfig.maxLiveRooms ?? 4 } = {}) {
  const rooms = controller.rooms;
  if (rooms.length <= maxLive) {
    return [];
  }
  const current = controller.currentRoom;
  const extras = rooms.filter((room) => room !== current && !current.portals.some((portal) => portal.destinationPortal?.scene === room.scene));
  const removed = [];
  while (controller.rooms.length > maxLive && extras.length) {
    const room = extras.shift();
    if (controller.removeRoom?.(room.id)) {
      removed.push(room.id);
    }
  }
  return removed;
}

export function spawnLookahead(controller, {
  catalog,
  kits,
  seed,
  depth = 0,
  room = controller.currentRoom,
} = {}) {
  if (!room || !kits?.length) {
    return [];
  }
  const spawned = [];
  const rng = createRng(`${seed}:${depth}:${room.id}`);
  const exits = room.portals.filter((portal) => portal.userData.role === 'exit' && !portal.destinationPortal);
  for (const [index, exit] of exits.entries()) {
    const kit = pickOne(rng, kits);
    const dest = generateRoom({
      kit,
      roomId: `d${depth + 1}-${index}-${Math.floor(rng() * 1e6)}`,
      origin: allocateOrigin(depth + 1, index),
      depth: depth + 1,
      branch: index,
      exitCount: 1,
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

export function sealArrival(portal) {
  const dest = portal?.destinationPortal;
  if (!dest) {
    return false;
  }
  dest.enabled = false;
  dest.oneWay = true;
  return true;
}
