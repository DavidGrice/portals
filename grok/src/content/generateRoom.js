import { pickInt } from './rng.js';

export function allocateOrigin(depth = 0, branch = 0) {
  return [Number(depth) * 250 + Number(branch) * 10000, 0, 0];
}

export function listExitSockets(kit) {
  return (kit?.sockets ?? []).filter((socket) => socket.role === 'exit');
}

export function listEntrySockets(kit) {
  const entries = (kit?.sockets ?? []).filter((socket) => socket.role === 'entry');
  return entries.length ? entries : [{ id: 'entry', role: 'entry', position: [0, 1, 0], yaw: Math.PI }];
}

export function generateRoom({
  kit,
  roomId,
  origin = [0, 0, 0],
  depth = 0,
  branch = 0,
  exitCount = 1,
  rng = Math.random,
} = {}) {
  if (!kit?.id) {
    throw new Error('generateRoom requires a kit');
  }
  const id = roomId || `${kit.id}-${depth}-${branch}`;
  const exitsAvailable = listExitSockets(kit);
  const maxExits = Math.max(1, exitsAvailable.length || 1);
  const wanted = Math.max(1, Math.min(Number(exitCount) || 1, maxExits));
  const chosenExits = chooseExits(exitsAvailable, wanted, rng);
  const entry = listEntrySockets(kit)[0];
  const materials = kit.materials ?? {};
  const shell = kit.shell ?? { halfX: 8, zMin: -6.2, zMax: 5.2 };
  const openings = [0];
  if (chosenExits.some((socket) => Number(socket.position?.[2]) < -2 && Math.abs(socket.position?.[0] ?? 0) < 1)) {
    openings.push(-5);
  }

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
        sideOpenings: chosenExits
          .filter((socket) => Math.abs(socket.position?.[0] ?? 0) > 4)
          .map((socket) => ({ side: socket.position[0] < 0 ? -1 : 1, z: socket.position[2] })),
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
    });
  }

  return {
    id,
    title: kit.title ?? kit.id,
    tags: [...new Set([...(kit.tags ?? []), 'generated'])],
    origin: origin ?? allocateOrigin(depth, branch),
    clearColor: kit.clearColor ?? '#111111',
    kitId: kit.id,
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
  entry.destinationId = exit.id;
  return { exit, entry };
}

export function pruneUnlinkedPortals(room) {
  const linked = new Set((room.portals ?? []).filter((portal) => portal.destinationId).map((portal) => portal.id));
  room.portals = (room.portals ?? []).filter((portal) => linked.has(portal.id));
  room.entities = (room.entities ?? []).filter((entity) => {
    const cover = entity.props?.coversPortalId;
    return !cover || linked.has(cover);
  });
  return room;
}

export function worldFromRooms(rooms, { id = 'drift', startRoom = rooms[0]?.id, theme = 'drift' } = {}) {
  if (!rooms?.length) {
    throw new Error('worldFromRooms needs rooms');
  }
  const next = rooms.map((room) => pruneUnlinkedPortals(room));
  return {
    id,
    title: 'Drift',
    theme,
    startRoom: startRoom || next[0].id,
    startSpawn: [next[0].origin[0], 1, 4],
    lookAt: [next[0].origin[0], 1, 0],
    rooms: next,
  };
}

function chooseExits(exits, wanted, rng) {
  if (!exits.length) {
    return [{ id: 'exit-a', role: 'exit', position: [0, 1, -5], yaw: 0 }];
  }
  const pool = [...exits];
  const chosen = [];
  while (chosen.length < wanted && pool.length) {
    const index = pickInt(typeof rng === 'function' ? rng : Math.random, 0, pool.length - 1);
    chosen.push(pool.splice(index, 1)[0]);
  }
  if (!chosen.length) {
    chosen.push(exits[0]);
  }
  return chosen;
}
