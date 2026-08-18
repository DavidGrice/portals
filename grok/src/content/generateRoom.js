import { pickInt } from './rng.js';

export const ORIGIN_SPACING = 250;

export const DEFAULT_EXIT_SOCKETS = [
  { id: 'exit-a', role: 'exit', position: [0, 1, -5], yaw: 0, wall: 'north' },
  { id: 'exit-b', role: 'exit', position: [-6.4, 1, 1.2], yaw: Math.PI / 2, wall: 'west' },
  { id: 'exit-c', role: 'exit', position: [6.4, 1, 1.2], yaw: -Math.PI / 2, wall: 'east' },
  { id: 'exit-d', role: 'exit', position: [-6.4, 1, -3.2], yaw: Math.PI / 2, wall: 'west' },
];

export function originFromCell(col = 0, row = 0, spacing = ORIGIN_SPACING) {
  return [Number(col) * spacing, 0, Number(row) * spacing];
}

export function allocateOrigin(depth = 0, branch = 0) {
  return originFromCell(Number(depth) || 0, Number(branch) || 0);
}

export function createOriginPool({ spacing = ORIGIN_SPACING } = {}) {
  const live = new Map();
  const liveCells = new Set();
  const free = [];
  let cursor = 0;

  function cellKey(cell) {
    return `${cell.col},${cell.row}`;
  }

  function nextFreshCell() {
    let cell;
    do {
      cell = {
        col: cursor % 64,
        row: Math.floor(cursor / 64),
      };
      cursor += 1;
    } while (liveCells.has(cellKey(cell)));
    return cell;
  }

  return {
    acquire(id) {
      if (!id) {
        throw new Error('origin pool acquire needs an id');
      }
      if (live.has(id)) {
        const cell = live.get(id);
        return originFromCell(cell.col, cell.row, spacing);
      }
      const cell = free.pop() ?? nextFreshCell();
      live.set(id, cell);
      liveCells.add(cellKey(cell));
      return originFromCell(cell.col, cell.row, spacing);
    },
    release(id) {
      const cell = live.get(id);
      if (!cell) {
        return false;
      }
      live.delete(id);
      liveCells.delete(cellKey(cell));
      free.push(cell);
      return true;
    },
    originOf(id) {
      const cell = live.get(id);
      return cell ? originFromCell(cell.col, cell.row, spacing) : null;
    },
    has(id) {
      return live.has(id);
    },
    isCellLive(col, row) {
      return liveCells.has(`${col},${row}`);
    },
    liveCount() {
      return live.size;
    },
    liveIds() {
      return [...live.keys()];
    },
  };
}

export function listExitSockets(kit) {
  return (kit?.sockets ?? []).filter((socket) => socket.role === 'exit');
}

export function listEntrySockets(kit) {
  const entries = (kit?.sockets ?? []).filter((socket) => socket.role === 'entry');
  return entries.length ? entries : [{ id: 'entry', role: 'entry', position: [0, 1, 0], yaw: Math.PI, wall: 'south' }];
}

export function resolveExitSockets(kit) {
  const declared = listExitSockets(kit);
  if (declared.length) {
    return declared;
  }
  if ((kit?.sockets ?? []).some((socket) => socket.role === 'entry')) {
    return [];
  }
  return DEFAULT_EXIT_SOCKETS.map((socket) => ({ ...socket, position: [...socket.position] }));
}

export function pickExitCount(rng, { minExits = 2, maxExits = 4, available = 4 } = {}) {
  const floor = Math.max(1, Math.min(Number(minExits) || 1, available));
  const ceil = Math.max(floor, Math.min(Number(maxExits) || floor, available));
  return pickInt(typeof rng === 'function' ? rng : Math.random, floor, ceil);
}

export function isReservedPortal(portal) {
  return Boolean(portal?.reserved) || portal?.role === 'exit';
}

export function unusedExits(room) {
  return (room?.portals ?? []).filter((portal) => portal.role === 'exit' && !portal.destinationId);
}

export function generateRoom({
  kit,
  roomId,
  origin = [0, 0, 0],
  depth = 0,
  branch = 0,
  exitCount = 1,
  minExits = 0,
  rng = Math.random,
} = {}) {
  if (!kit?.id) {
    throw new Error('generateRoom requires a kit');
  }
  const id = roomId || `${kit.id}-${depth}-${branch}`;
  const exitsAvailable = resolveExitSockets(kit);
  if (minExits && exitsAvailable.length < minExits) {
    throw new Error(`kit ${kit.id} has ${exitsAvailable.length} exits, need ${minExits}`);
  }
  const maxExits = Math.max(1, exitsAvailable.length);
  const wanted = Math.max(1, Math.min(Number(exitCount) || 1, maxExits));
  if (wanted > exitsAvailable.length) {
    throw new Error(`kit ${kit.id} cannot supply ${wanted} exits`);
  }
  const chosenExits = chooseExits(exitsAvailable, wanted, rng);
  const entry = listEntrySockets(kit)[0];
  const materials = kit.materials ?? {};
  const shell = kit.shell ?? { halfX: 8, zMin: -6.2, zMax: 5.2 };
  const holeSockets = [entry, ...chosenExits];
  const { openings, sideOpenings } = openingsFromSockets(holeSockets);

  const entities = [
    { id: `sky-${id}`, kind: 'env.sky', props: { color: kit.clearColor ?? '#111111' } },
    {
      id: `light-${id}`,
      kind: 'env.light',
      props: {
        ambient: kit.clearColor ?? '#222222',
        sun: materials.accent ?? '#ffffff',
        sunIntensity: 0.4,
        ambientIntensity: 0.35,
      },
    },
    {
      id: `floor-${id}`,
      kind: 'env.floor',
      props: materials.floor ? { material: materials.floor } : { color: kit.clearColor ?? '#333333' },
    },
    {
      id: `shell-${id}`,
      kind: 'arch.corridor',
      props: {
        ...(materials.shell ? { material: materials.shell } : {}),
        color: kit.clearColor ?? '#333333',
        halfX: shell.halfX ?? 8,
        zMin: shell.zMin ?? -6.2,
        zMax: shell.zMax ?? 5.2,
        openings,
        sideOpenings,
      },
    },
    {
      id: `plaque-${id}`,
      kind: 'prop.plaque',
      position: [-2.2, 1.6, 4.6],
      props: { color: materials.accent ?? '#cfd3e5', text: kit.title ?? kit.id },
    },
  ];

  if (materials.strip) {
    entities.push({
      id: `strip-l-${id}`,
      kind: 'prop.box',
      position: [-7.7, 2.35, -0.5],
      props: { size: [0.08, 0.05, 10.8], material: materials.strip },
    });
    entities.push({
      id: `strip-r-${id}`,
      kind: 'prop.box',
      position: [7.7, 2.35, -0.5],
      props: { size: [0.08, 0.05, 10.8], material: materials.strip },
    });
  }

  for (const [index, piece] of (kit.dressing ?? []).entries()) {
    entities.push({
      ...piece,
      id: piece.id || `dress-${id}-${index}`,
      props: {
        ...(piece.props ?? {}),
        ...(piece.props?.color || !materials.accent ? {} : { color: materials.accent }),
      },
    });
  }

  const portals = [];
  const entryId = `door-in-${id}`;
  entities.push({
    id: `frame-in-${id}`,
    kind: 'arch.frame',
    position: entry.position ?? [0, 1, 0],
    rotation: [0, entry.yaw ?? Math.PI, 0],
    props: { color: materials.accent ?? '#888888', coversPortalId: entryId },
  });
  portals.push({
    id: entryId,
    position: entry.position ?? [0, 1, 0],
    yaw: entry.yaw ?? Math.PI,
    size: [2, 2],
    destinationId: null,
    oneWay: true,
    role: 'entry',
    reserved: false,
  });

  for (const [index, socket] of chosenExits.entries()) {
    const portalId = `door-out-${id}-${socket.id || index}`;
    entities.push({
      id: `frame-out-${id}-${index}`,
      kind: 'arch.frame',
      position: socket.position,
      rotation: [0, socket.yaw ?? 0, 0],
      props: { color: materials.accent ?? '#888888', coversPortalId: portalId },
    });
    portals.push({
      id: portalId,
      position: socket.position,
      yaw: socket.yaw ?? 0,
      size: [2, 2],
      destinationId: null,
      oneWay: false,
      role: 'exit',
      reserved: true,
      wall: socket.wall ?? wallFromSocket(socket),
    });
  }

  return {
    id,
    title: kit.title ?? kit.id,
    tags: [...new Set([...(kit.tags ?? []), 'generated'])],
    origin: origin ?? allocateOrigin(depth, branch),
    clearColor: kit.clearColor ?? '#111111',
    kitId: kit.id,
    atmosphere: kit.atmosphere ?? null,
    depth,
    branch,
    entities,
    portals,
  };
}

export function linkRooms(fromRoom, toRoom, exitPortalId = null) {
  const exit = (fromRoom.portals ?? []).find((portal) => portal.id === exitPortalId)
    || (fromRoom.portals ?? []).find((portal) => portal.role === 'exit' && !portal.destinationId);
  const entry = (toRoom.portals ?? []).find((portal) => portal.role === 'entry');
  if (!exit || !entry) {
    throw new Error('linkRooms needs an exit and an entry');
  }
  exit.destinationId = entry.id;
  exit.reserved = false;
  entry.destinationId = exit.id;
  return { exit, entry };
}

export function pruneUnlinkedPortals(room, { keepReserved = true } = {}) {
  room.portals = (room.portals ?? []).filter((portal) => {
    if (portal.destinationId) {
      return true;
    }
    return keepReserved && isReservedPortal(portal);
  });
  const keepIds = new Set((room.portals ?? []).map((portal) => portal.id));
  room.entities = (room.entities ?? []).filter((entity) => {
    const cover = entity.props?.coversPortalId;
    return !cover || keepIds.has(cover);
  });
  return room;
}

export function worldFromRooms(rooms, {
  id = 'drift',
  startRoom = rooms[0]?.id,
  theme = 'drift',
  generated = true,
} = {}) {
  if (!rooms?.length) {
    throw new Error('worldFromRooms needs rooms');
  }
  const next = rooms.map((room) => pruneUnlinkedPortals(room, { keepReserved: generated }));
  return {
    id,
    title: 'Drift',
    theme,
    generated,
    startRoom: startRoom || next[0].id,
    startSpawn: [next[0].origin[0], 1, 4],
    lookAt: [next[0].origin[0], 1, 0],
    rooms: next,
  };
}

function openingsFromSockets(sockets) {
  const openings = [];
  const sideOpenings = [];
  for (const socket of sockets) {
    const x = Number(socket.position?.[0] ?? 0);
    const z = Number(socket.position?.[2] ?? 0);
    if (Math.abs(x) > 4) {
      sideOpenings.push({ side: x < 0 ? -1 : 1, z });
    } else {
      openings.push(z);
    }
  }
  return { openings, sideOpenings };
}

function wallFromSocket(socket) {
  const x = Number(socket.position?.[0] ?? 0);
  const z = Number(socket.position?.[2] ?? 0);
  if (Math.abs(x) > Math.abs(z)) {
    return x < 0 ? 'west' : 'east';
  }
  return z < 0 ? 'north' : 'south';
}

export function isForwardSocket(socket) {
  if (!socket) {
    return false;
  }
  if (socket.wall === 'north') {
    return true;
  }
  const x = Number(socket.position?.[0] ?? 0);
  const z = Number(socket.position?.[2] ?? 0);
  return z < -2 && Math.abs(x) < 1.5;
}

function chooseExits(exits, wanted, rng) {
  if (!exits.length) {
    return [{ id: 'exit-a', role: 'exit', position: [0, 1, -5], yaw: 0, wall: 'north' }];
  }
  const roll = typeof rng === 'function' ? rng : Math.random;
  const chosen = [];
  const pool = [...exits];
  const forwardIndex = pool.findIndex((socket) => isForwardSocket(socket));
  if (forwardIndex >= 0) {
    chosen.push(pool.splice(forwardIndex, 1)[0]);
  }
  while (chosen.length < wanted && pool.length) {
    const index = pickInt(roll, 0, pool.length - 1);
    chosen.push(pool.splice(index, 1)[0]);
  }
  if (!chosen.length) {
    chosen.push(exits[0]);
  }
  return chosen;
}
