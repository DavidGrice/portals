import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import cyberCyan from '../../data/kits/cyber-cyan.json' with { type: 'json' };
import cyberHub from '../../data/kits/cyber-hub.json' with { type: 'json' };
import cyberVault from '../../data/kits/cyber-vault.json' with { type: 'json' };
import cyberWell from '../../data/kits/cyber-well.json' with { type: 'json' };
import hauntHall from '../../data/kits/haunt-hall.json' with { type: 'json' };
import hauntParlor from '../../data/kits/haunt-parlor.json' with { type: 'json' };
import hauntCrypt from '../../data/kits/haunt-crypt.json' with { type: 'json' };
import hauntAttic from '../../data/kits/haunt-attic.json' with { type: 'json' };
import agesMesozoic from '../../data/kits/ages-mesozoic.json' with { type: 'json' };
import agesStone from '../../data/kits/ages-stone.json' with { type: 'json' };
import agesPresent from '../../data/kits/ages-present.json' with { type: 'json' };
import agesIndustrial from '../../data/kits/ages-industrial.json' with { type: 'json' };
import agesOrbital from '../../data/kits/ages-orbital.json' with { type: 'json' };
import agesPrimordial from '../../data/kits/ages-primordial.json' with { type: 'json' };
import agesAncient from '../../data/kits/ages-ancient.json' with { type: 'json' };
import agesMedieval from '../../data/kits/ages-medieval.json' with { type: 'json' };
import agesNearFuture from '../../data/kits/ages-near-future.json' with { type: 'json' };
import mixPlasterStrip from '../../data/kits/mix-plaster-strip.json' with { type: 'json' };
import mixDirtGold from '../../data/kits/mix-dirt-gold.json' with { type: 'json' };
import setBanquet from '../../data/kits/set-banquet.json' with { type: 'json' };
import setObservatory from '../../data/kits/set-observatory.json' with { type: 'json' };
import generatorConfig from '../../data/generators/drift.json' with { type: 'json' };
import { createRng, pickOne } from './rng.js';
import {
  createOriginPool,
  generateRoom,
  linkRooms,
  pickExitCount,
  roomFingerprint,
  worldFromRooms,
} from './generateRoom.js';
import { addRoom, dressRooms, relinkPortals } from './loadWorld.js';

const KIT_BY_ID = {
  'cyber-cyan': cyberCyan,
  'cyber-hub': cyberHub,
  'cyber-vault': cyberVault,
  'cyber-well': cyberWell,
  'haunt-hall': hauntHall,
  'haunt-parlor': hauntParlor,
  'haunt-crypt': hauntCrypt,
  'haunt-attic': hauntAttic,
  'ages-mesozoic': agesMesozoic,
  'ages-stone': agesStone,
  'ages-present': agesPresent,
  'ages-industrial': agesIndustrial,
  'ages-orbital': agesOrbital,
  'ages-primordial': agesPrimordial,
  'ages-ancient': agesAncient,
  'ages-medieval': agesMedieval,
  'ages-near-future': agesNearFuture,
  'mix-plaster-strip': mixPlasterStrip,
  'mix-dirt-gold': mixDirtGold,
  'set-banquet': setBanquet,
  'set-observatory': setObservatory,
};

export function allKits() {
  return Object.values(KIT_BY_ID).filter(Boolean);
}

export function kitsForDepth(depth = 0, config = generatorConfig) {
  const row = [...(config.depths ?? [])].find((entry) => depth <= (entry.until ?? 99))
    ?? config.depths?.[config.depths.length - 1];
  const ids = row?.kits ?? Object.keys(KIT_BY_ID);
  const kits = ids.map((id) => KIT_BY_ID[id]).filter(Boolean);
  return kits.length ? kits : allKits();
}

export function openDrift({
  seed = String(Math.floor(Math.random() * 0xffff).toString(16)),
  depth = 0,
  kitId = null,
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
  const startKit = (kitId && KIT_BY_ID[kitId]) || pickOne(rng, kits);
  const startId = `drift-${depth}`;
  const recent = [];
  const start = generateRoom({
    kit: startKit,
    roomId: startId,
    origin: pool.acquire(startId),
    depth,
    exitCount: pickExitCount(rng, {
      minExits,
      maxExits,
      available: 4,
    }),
    minExits,
    recent,
    rng,
  });
  recent.push(roomFingerprint(start));
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
      recent,
      rng,
    });
    recent.push(roomFingerprint(dest));
    linkRooms(start, dest, exit.id);
    dests.push(dest);
  }
  const world = worldFromRooms([start, ...dests], { id: 'drift', startRoom: start.id });
  world.seed = seed;
  world.depth = depth;
  world.originPool = pool;
  world.recent = recent.slice(-4);
  return world;
}

export function disposeRejectedSiblings(controller, fromRoom, keepId) {
  if (!fromRoom) {
    return [];
  }
  const removed = [];
  for (const portal of fromRoom.portals ?? []) {
    const role = portal.userData?.role ?? portal.role;
    if (role !== 'exit') {
      continue;
    }
    const destRoom = roomForPortal(controller, portal.destinationPortal);
    if (!destRoom || destRoom.id === keepId || destRoom === controller.currentRoom) {
      continue;
    }
    if (controller.removeRoom?.(destRoom.id)) {
      controller.drift?.origins?.release(destRoom.id);
      removed.push(destRoom.id);
    }
  }
  return removed;
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

export function roomForPortal(controller, portal) {
  if (!controller || !portal) {
    return null;
  }
  return controller.rooms.find((room) => (
    room.portals.includes(portal) || room.scene === portal.scene
  )) ?? null;
}

export function unusedLiveExits(room) {
  return (room?.portals ?? []).filter((portal) => {
    const role = portal.userData?.role ?? portal.role;
    return role === 'exit' && portal.enabled !== false && !portal.destinationPortal;
  });
}

export function liveDestExits(room, controller) {
  return (room?.portals ?? []).filter((portal) => {
    const role = portal.userData?.role ?? portal.role;
    if (role !== 'exit' || portal.enabled === false || !portal.destinationPortal) {
      return false;
    }
    return Boolean(roomForPortal(controller, portal.destinationPortal));
  });
}

export function clearDanglingDests(room, controller) {
  let cleared = 0;
  for (const portal of room?.portals ?? []) {
    if (!portal.destinationPortal) {
      continue;
    }
    if (roomForPortal(controller, portal.destinationPortal)) {
      continue;
    }
    portal.destinationPortal = null;
    portal.destinationId = null;
    portal.userData.destinationId = null;
    cleared += 1;
  }
  return cleared;
}

export function evictBehind(controller, { maxLive = generatorConfig.maxLiveRooms ?? 6 } = {}) {
  const rooms = controller.rooms;
  if (rooms.length <= maxLive) {
    return [];
  }
  const current = controller.currentRoom;
  const keep = new Set(
    liveDestExits(current, controller)
      .map((portal) => roomForPortal(controller, portal.destinationPortal)?.id)
      .filter(Boolean),
  );
  if (current?.id) {
    keep.add(current.id);
  }
  const extras = rooms.filter((room) => !keep.has(room.id));
  const removed = [];
  while (controller.rooms.length > maxLive && extras.length) {
    const room = extras.shift();
    if (keep.has(room.id)) {
      continue;
    }
    if (controller.removeRoom?.(room.id)) {
      controller.drift?.origins?.release(room.id);
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
  config = generatorConfig,
} = {}) {
  if (!room) {
    return [];
  }
  const kitList = (kits?.length ? kits : kitsForDepth((room.depth ?? depth) + 1, config));
  const usable = kitList?.length ? kitList : allKits();
  if (!usable.length || !catalog) {
    return [];
  }
  clearDanglingDests(room, controller);
  const spawned = [];
  const fromDepth = Number(room.depth ?? depth ?? 0);
  const rng = createRng(`${seed}:${fromDepth}:${room.id}`);
  const pool = controller.drift?.origins ?? createOriginPool();
  if (controller.drift) {
    controller.drift.origins = pool;
  }
  const minExits = Number(config.minExits ?? 2);
  const maxExits = Number(config.maxExits ?? 4);
  const exits = unusedLiveExits(room);
  for (const [index, exit] of exits.entries()) {
    const kit = pickOne(rng, usable) ?? usable[0];
    if (!kit) {
      continue;
    }
    const seq = controller.drift
      ? (controller.drift.seq = (Number(controller.drift.seq) || 0) + 1)
      : index + 1;
    const destId = `d${fromDepth + 1}-${seq}`;
    let dest;
    try {
      dest = generateRoom({
        kit,
        roomId: destId,
        origin: pool.acquire(destId),
        depth: fromDepth + 1,
        branch: index,
        exitCount: pickExitCount(rng, { minExits, maxExits, available: 4 }),
        minExits,
        recent: controller.drift?.recent ?? [],
        rng,
      });
      if (controller.drift) {
        controller.drift.recent = [...(controller.drift.recent ?? []), roomFingerprint(dest)].slice(-4);
      }
    } catch {
      pool.release(destId);
      continue;
    }
    const entry = dest.portals.find((portal) => portal.role === 'entry');
    if (!entry) {
      pool.release(destId);
      continue;
    }
    entry.destinationId = exit.portalId;
    exit.userData.destinationId = entry.id;
    addRoom(controller, dest, catalog);
    spawned.push(dest);
  }
  relinkPortals(controller, { strict: false });
  dressRooms(controller);
  return spawned;
}

export function ensureForwardDoors(controller, options = {}) {
  const room = options.room ?? controller.currentRoom;
  const config = options.config ?? generatorConfig;
  const minLive = Number(options.minLive ?? config.minLiveDests ?? 1);
  if (!room) {
    return [];
  }
  clearDanglingDests(room, controller);
  const spawned = [];
  spawned.push(...spawnLookahead(controller, { ...options, room, config }));
  if (liveDestExits(room, controller).length >= minLive) {
    return spawned;
  }
  spawned.push(...spawnLookahead(controller, { ...options, room, config }));
  return spawned;
}

function portalDump(portal, controller) {
  const dest = portal?.destinationPortal;
  const destRoom = dest ? roomForPortal(controller, dest) : null;
  return {
    id: portal.portalId ?? portal.id ?? null,
    role: portal.userData?.role ?? portal.role ?? null,
    enabled: portal.enabled !== false,
    sealed: Boolean(portal.userData?.sealed),
    oneWay: Boolean(portal.oneWay),
    destId: portal.userData?.destinationId ?? portal.destinationId ?? dest?.portalId ?? null,
    destRoom: destRoom?.id ?? null,
    destLive: Boolean(destRoom),
    position: portal.position ? [portal.position.x, portal.position.y, portal.position.z] : null,
  };
}

export function snapshotDriftRoom(controller, room = controller?.currentRoom) {
  const drift = controller?.drift ?? {};
  const portals = (room?.portals ?? []).map((portal) => portalDump(portal, controller));
  return {
    seed: drift.seed ?? null,
    depth: room?.depth ?? drift.depth ?? null,
    seq: drift.seq ?? null,
    roomId: room?.id ?? null,
    title: room?.title ?? null,
    kitId: room?.kitId ?? null,
    tags: room?.tags ?? [],
    liveRooms: (controller?.rooms ?? []).map((entry) => ({
      id: entry.id,
      depth: entry.depth ?? null,
      kitId: entry.kitId ?? null,
    })),
    portals,
    unusedExits: unusedLiveExits(room).map((portal) => portal.portalId ?? portal.id),
    liveDests: liveDestExits(room, controller).map((portal) => portal.portalId ?? portal.id),
    sealed: portals.filter((portal) => portal.sealed || portal.enabled === false).map((portal) => portal.id),
  };
}

export function logDriftEndRoom(controller, extra = {}) {
  const room = extra.room ?? controller?.currentRoom;
  const snapshot = snapshotDriftRoom(controller, room);
  const payload = { ...snapshot, ...extra };
  console.warn('[drift] END ROOM — no spawnable forward door', payload);
  return payload;
}

function sealLook(tags = []) {
  if (tags.includes('cyber')) {
    return { color: 0x1a2834, roughness: 0.32, metalness: 0.72 };
  }
  if (tags.includes('haunt')) {
    return { color: 0x3a2a18, roughness: 0.96, metalness: 0.04 };
  }
  return { color: 0x2a2420, roughness: 0.9, metalness: 0.08 };
}

export function spawnSealSlab(portal, tags = []) {
  if (!portal?.scene) {
    return null;
  }
  if (portal.userData.sealSlab) {
    return portal.userData.sealSlab;
  }
  const look = sealLook(tags);
  const mesh = new Mesh(
    new BoxGeometry(2.35, 2.35, 0.18),
    new MeshStandardMaterial(look),
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

export function sealArrival(portal, { tags = [] } = {}) {
  const dest = portal?.destinationPortal;
  if (!dest) {
    return false;
  }
  dest.enabled = false;
  dest.oneWay = true;
  dest.userData.sealed = true;
  spawnSealSlab(dest, tags);
  killFrameGlow(dest.scene, dest.portalId);
  return true;
}
