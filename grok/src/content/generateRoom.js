import { pickInt } from './rng.js';
import { applyClimateToRoomData, climateForDepth } from './climate.js';
import { getTopology, holesFromSockets, pickTopology, resolveSocket, roomFingerprint, topologySockets } from './topologies.js';

export const ORIGIN_SPACING = 250;

export const DEFAULT_EXIT_SOCKETS = [
  { id: 'exit-a', role: 'exit', position: [0, 1, -6.2], yaw: 0, wall: 'north' },
  { id: 'exit-b', role: 'exit', position: [-8, 1, 1.2], yaw: Math.PI / 2, wall: 'west' },
  { id: 'exit-c', role: 'exit', position: [8, 1, 1.2], yaw: -Math.PI / 2, wall: 'east' },
  { id: 'exit-d', role: 'exit', position: [8, 1, -3.2], yaw: -Math.PI / 2, wall: 'east' },
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
  if (ceil <= floor) {
    return floor;
  }
  const roll = typeof rng === 'function' ? rng() : Math.random();
  if (roll < 0.5) {
    return ceil;
  }
  if (roll < 0.8) {
    return Math.max(floor, ceil - 1);
  }
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
  topology = null,
  roomId,
  origin = [0, 0, 0],
  depth = 0,
  branch = 0,
  exitCount = 1,
  minExits = 0,
  recent = [],
  rng = Math.random,
} = {}) {
  if (!kit?.id) {
    throw new Error('generateRoom requires a kit');
  }
  const id = roomId || `${kit.id}-${depth}-${branch}`;
  const resolved = topology?.id
    ? (typeof topology === 'string' ? getTopology(topology) : topology)
    : pickTopology(rng, {
      kit,
      recent,
      allow: [...new Set([
        ...(kit.topologies ?? []),
        'open', 'arcade', 'round', 'court', 'plus', 'T', 'U', 'rotunda', 'loft', 'shaft', 'stack',
      ])],
    });
  const topo = resolved ?? getTopology('I');
  const footprint = { ...(kit.shell ?? {}), ...(topo.footprint ?? {}) };
  const kitExits = resolveExitSockets(kit);
  const topoExits = topologySockets(topo, 'exit');
  const declaredOnly = Array.isArray(kit.sockets) && !kit.topologies && kitExits.length === 0;
  const exitsAvailable = declaredOnly ? [] : (topoExits.length ? topoExits : kitExits);
  if (minExits && exitsAvailable.length < minExits) {
    throw new Error(`kit ${kit.id} / ${topo.id} has ${exitsAvailable.length} exits, need ${minExits}`);
  }
  const maxExits = Math.max(1, exitsAvailable.length);
  const wanted = Math.max(1, Math.min(Number(exitCount) || 1, maxExits));
  if (wanted > exitsAvailable.length) {
    throw new Error(`kit ${kit.id} cannot supply ${wanted} exits`);
  }
  const entry = (topologySockets(topo, 'entry')[0]
    ?? listEntrySockets(kit)[0]
    ?? { id: 'entry', role: 'entry', position: [0, 1, 0], yaw: Math.PI, wall: 'south' });
  const materials = kit.materials ?? {};
  const surface = materials.shell ?? materials.floor ?? null;
  const forceSide = ['T', 'plus', 'L', 'U', 'court', 'arcade', 'rotunda'].includes(topo.id);
  const chosenExits = chooseExits(exitsAvailable, wanted, rng, { forceSide }).map((socket) => (
    topo.kind === 'arch.corridor' ? snapExitToShell(socket, footprint) : resolveSocket(topo, socket)
  ));
  const holeSockets = [entry, ...chosenExits];
  const { openings, sideOpenings } = openingsFromSockets(holeSockets);
  const holes = holesFromSockets(holeSockets);
  const shellKind = topo.kind ?? 'arch.corridor';
  const holeWalls = new Set(holes.map((hole) => hole.wall));
  const openWalls = pickOpenWalls(topo, holeWalls, rng);

  const lighting = lightSpecForKit(kit);
  const height = Number(footprint.height ?? (topo.tags?.includes('vertical') ? 6.2 : 4.2));
  const surfaceProps = surface
    ? { material: surface }
    : { color: kit.clearColor ?? '#333333' };
  const entities = [
    { id: `sky-${id}`, kind: 'env.sky', props: { color: kit.clearColor ?? '#111111' } },
    {
      id: `light-${id}`,
      kind: 'env.light',
      props: {
        ambient: lighting.ambient,
        sky: lighting.sky,
        sun: lighting.sun,
        sunIntensity: lighting.sunIntensity,
        ambientIntensity: lighting.ambientIntensity,
      },
    },
    {
      id: `floor-${id}`,
      kind: 'env.floor',
      props: {
        ...surfaceProps,
        size: Math.max(32, (footprint.halfX ?? 8) * 4),
      },
    },
    {
      id: `shell-${id}`,
      kind: shellKind,
      props: {
        ...surfaceProps,
        color: kit.clearColor ?? '#333333',
        halfX: footprint.halfX ?? 8,
        zMin: footprint.zMin ?? -6.2,
        zMax: footprint.zMax ?? 5.2,
        height,
        radius: footprint.radius ?? 8,
        openings,
        sideOpenings,
        holes,
        openWalls,
        roundCorners: topo.roundCorners !== false && shellKind !== 'arch.corridor',
        ceiling: topo.ceiling !== false && !topo.tags?.includes('sky'),
      },
    },
    {
      id: `plaque-${id}`,
      kind: 'prop.plaque',
      position: [-2.2, 1.6, Math.min((footprint.zMax ?? 5.2) - 0.6, 4.6)],
      props: { color: materials.accent ?? '#cfd3e5', text: `${kit.title ?? kit.id} · ${topo.title ?? topo.id}` },
    },
  ];

  if (materials.strip) {
    entities.push({
      id: `strip-l-${id}`,
      kind: 'prop.box',
      position: [-(footprint.halfX ?? 8) + 0.3, 2.35, -0.5],
      props: { size: [0.08, 0.05, 10.8], material: materials.strip, scroll: [0, 0.18] },
    });
    entities.push({
      id: `strip-r-${id}`,
      kind: 'prop.box',
      position: [(footprint.halfX ?? 8) - 0.3, 2.35, -0.5],
      props: { size: [0.08, 0.05, 10.8], material: materials.strip, scroll: [0, 0.18] },
    });
  }
  entities.push({
    id: `spinner-${id}`,
    kind: 'prop.box',
    position: [0, 1.1, (footprint.zMin ?? -6) * 0.35],
    tags: ['landmark', 'motion'],
    props: {
      size: [0.55, 1.6, 0.55],
      color: materials.accent ?? '#cfd3e5',
      spin: [0, 0.7, 0],
    },
  });

  entities.push(...placeLandmarks({ kit, topology: topo, roomId: id, rng, materials, surface }));
  entities.push(...placeVertical({
    roomId: id,
    footprint: { ...footprint, height },
    topology: topo,
    materials,
    lighting,
    surface,
  }));
  for (const [index, point] of lighting.points.entries()) {
    entities.push({
      id: `point-${id}-${index}`,
      kind: 'env.point',
      position: point.position,
      props: { color: point.color, intensity: point.intensity, distance: point.distance ?? 10 },
    });
  }

  const portals = [];
  const entryId = `door-in-${id}`;
  entities.push({
    id: `frame-in-${id}`,
    kind: 'arch.frame',
    position: entry.position ?? [0, 1, 0],
    rotation: [0, entry.yaw ?? Math.PI, 0],
    props: { color: materials.accent ?? '#888888', frameMaterial: lighting.metal, coversPortalId: entryId },
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
      props: { color: materials.accent ?? '#888888', frameMaterial: lighting.metal, coversPortalId: portalId },
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

  return applyClimateToRoomData({
    id,
    title: kit.title ?? kit.id,
    tags: [...new Set([...(kit.tags ?? []), 'generated', ...(topo.tags ?? [])])],
    origin: origin ?? allocateOrigin(depth, branch),
    clearColor: kit.clearColor ?? '#111111',
    kitId: kit.id,
    topologyId: topo.id,
    atmosphere: kit.atmosphere ?? null,
    depth,
    branch,
    entities,
    portals,
  }, climateForDepth(depth));
}

export { roomFingerprint };

function placeLandmarks({ kit, topology, roomId, rng, materials, surface = null }) {
  const regions = topology.regions ?? {};
  const names = Object.keys(regions);
  const pool = [...(kit.dressing ?? [])];
  if (!pool.length) {
    pool.push({
      kind: 'prop.box',
      tags: ['landmark'],
      props: { size: [0.9, 1.1, 0.9], color: materials.accent ?? '#888888' },
    });
  }
  const pieces = [];
  const count = Math.max(6, Math.min(14, Math.max(names.length, pool.length) + 2));
  for (let index = 0; index < count; index += 1) {
    const regionName = names[index % Math.max(names.length, 1)] ?? `slot-${index}`;
    const region = regions[regionName] ?? [((index % 3) - 1) * 3.2, 0, -index];
    const template = pool[index % pool.length];
    const position = template.position && index < pool.length && !names.length ? template.position : region;
    const lift = Array.isArray(position) && Number(position[1]) === 0
      ? [position[0], 0.52, position[2]]
      : position;
    pieces.push({
      ...template,
      id: template.id || `dress-${roomId}-${regionName}-${index}`,
      position: lift,
      tags: [...new Set([...(template.tags ?? []), 'landmark', regionName])],
      props: {
        ...(template.props ?? {}),
        ...(template.props?.material || !surface ? {} : { material: surface }),
        ...(template.props?.color || !materials.accent ? {} : { color: materials.accent }),
        ...(index === 0 && template.kind === 'prop.box' && !template.props?.spin ? { spin: [0, 0.45, 0] } : {}),
      },
    });
  }
  return pieces;
}

export function lightSpecForKit(kit) {
  const tags = kit?.tags ?? [];
  if (tags.includes('haunt')) {
    return {
      sun: '#e8b878',
      sky: '#8a7060',
      ambient: '#2c241c',
      sunIntensity: 0.62,
      ambientIntensity: 0.32,
      metal: 'metal.iron',
      points: [
        { color: '#ff6a22', intensity: 2.4, distance: 9, position: [3.2, 2.1, 1.2] },
        { color: '#c47840', intensity: 1.3, distance: 7, position: [-3.4, 2.4, -2.2] },
      ],
    };
  }
  if (tags.includes('cyber')) {
    return {
      sun: '#b8e8ff',
      sky: '#6a90a8',
      ambient: '#121820',
      sunIntensity: 0.55,
      ambientIntensity: 0.26,
      metal: 'metal.aluminum',
      points: [
        { color: '#2ee6ff', intensity: 2.2, distance: 11, position: [0, 2.8, -1.2] },
        { color: '#88a0ff', intensity: 1.2, distance: 8, position: [-3.6, 2.2, 2] },
      ],
    };
  }
  if (tags.includes('industrial')) {
    return {
      sun: '#e8d080',
      sky: '#8a9080',
      ambient: '#242820',
      sunIntensity: 0.7,
      ambientIntensity: 0.3,
      metal: 'metal.iron',
      points: [
        { color: '#f0c040', intensity: 1.8, distance: 9, position: [2.4, 3.2, 0] },
      ],
    };
  }
  if (tags.includes('ages') || tags.includes('prehistoric') || tags.includes('future')) {
    return {
      sun: '#f0e0c0',
      sky: '#c8d4e0',
      ambient: '#3a4038',
      sunIntensity: 1.05,
      ambientIntensity: 0.42,
      metal: 'metal.copper',
      points: [
        { color: '#ffcc88', intensity: 1.6, distance: 10, position: [0, 2.6, -1] },
      ],
    };
  }
  return {
    sun: '#fff4e5',
    sky: '#c8d4e8',
    ambient: '#3a4250',
    sunIntensity: 0.95,
    ambientIntensity: 0.4,
    metal: 'metal.aluminum',
    points: [
      { color: '#ffe8c8', intensity: 1.4, distance: 9, position: [2, 2.4, 1] },
    ],
  };
}

function placeVertical({ roomId, footprint, topology, materials, lighting, surface = null }) {
  const halfX = footprint.halfX ?? 8;
  const zMin = footprint.zMin ?? -7;
  const zMax = footprint.zMax ?? 5;
  const height = footprint.height ?? 4;
  const metal = surface ?? lighting.metal ?? 'metal.iron';
  const pieces = [
    {
      id: `beam-a-${roomId}`,
      kind: 'prop.box',
      position: [0, height - 0.28, (zMin + zMax) * 0.3],
      props: { size: [halfX * 1.7, 0.16, 0.22], material: metal },
    },
    {
      id: `beam-b-${roomId}`,
      kind: 'prop.box',
      position: [0, height - 0.28, (zMin + zMax) * 0.7],
      props: { size: [halfX * 1.7, 0.16, 0.22], material: metal },
    },
    {
      id: `base-l-${roomId}`,
      kind: 'prop.box',
      position: [-(halfX - 0.12), 0.08, (zMin + zMax) * 0.5],
      props: { size: [0.12, 0.16, Math.max(2, zMax - zMin - 1)], material: metal },
    },
    {
      id: `base-r-${roomId}`,
      kind: 'prop.box',
      position: [halfX - 0.12, 0.08, (zMin + zMax) * 0.5],
      props: { size: [0.12, 0.16, Math.max(2, zMax - zMin - 1)], material: metal },
    },
  ];
  if (height >= 5.2 || topology?.tags?.includes('vertical')) {
    pieces.push(
      {
        id: `catwalk-${roomId}`,
        kind: 'prop.box',
        position: [0, 2.28, (zMin - 0.6) * 0.55],
        props: { size: [Math.min(halfX * 1.6, 10), 0.12, Math.max(2.4, Math.abs(zMin) * 0.55)], material: metal },
      },
      {
        id: `rail-l-${roomId}`,
        kind: 'prop.box',
        position: [-(Math.min(halfX, 5) - 0.2), 2.7, (zMin - 0.6) * 0.55],
        props: { size: [0.08, 0.7, Math.max(2.2, Math.abs(zMin) * 0.5)], material: metal },
      },
      {
        id: `rail-r-${roomId}`,
        kind: 'prop.box',
        position: [Math.min(halfX, 5) - 0.2, 2.7, (zMin - 0.6) * 0.55],
        props: { size: [0.08, 0.7, Math.max(2.2, Math.abs(zMin) * 0.5)], material: metal },
      },
      {
        id: `upper-spin-${roomId}`,
        kind: 'prop.box',
        position: [2.2, 3.1, (zMin ?? -6) * 0.4],
        tags: ['landmark', 'motion'],
        props: { size: [0.45, 0.45, 0.45], color: materials.accent ?? '#cfd3e5', spin: [0.2, 0.8, 0] },
      },
    );
  }
  if ((topology?.tags ?? []).includes('cyber') || (materials.strip && height >= 4)) {
    pieces.push({
      id: `pipe-${roomId}`,
      kind: 'prop.pipe',
      position: [0, 0, 0],
      props: { length: Math.min(halfX * 1.6, 9), material: metal, lift: height * 0.62, radius: 0.08 },
    });
  }
  return pieces;
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

export function snapExitToShell(socket, shell = {}) {
  const halfX = Number(shell.halfX ?? 8);
  const zMin = Number(shell.zMin ?? -6.2);
  const next = {
    ...socket,
    position: [...(socket.position ?? [0, 1, 0])],
  };
  const wall = next.wall ?? wallFromSocket(next);
  next.wall = wall;
  if (wall === 'west') {
    next.position[0] = -halfX;
    next.yaw = Math.PI / 2;
  } else if (wall === 'east') {
    next.position[0] = halfX;
    next.yaw = -Math.PI / 2;
  } else if (wall === 'north') {
    next.position[0] = 0;
    next.position[2] = zMin;
    next.yaw = 0;
  }
  return next;
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

function socketWall(socket) {
  return socket.wall ?? wallFromSocket(socket);
}

export function exitWalls(room) {
  return [...new Set(
    (room?.portals ?? [])
      .filter((portal) => portal.role === 'exit')
      .map((portal) => portal.wall ?? wallFromSocket({ position: portal.position })),
  )];
}

function pickOpenWalls(topology, holeWalls, rng) {
  const declared = (topology?.openWalls ?? []).filter((wall) => !holeWalls.has(wall));
  const unused = ['east', 'west', 'north', 'south'].filter((wall) => !holeWalls.has(wall) && !declared.includes(wall));
  const open = [...declared];
  const preferOpen = Boolean(topology?.tags?.includes('open') || ['court', 'plus', 'arcade', 'U', 'round', 'rotunda', 'open'].includes(topology?.id));
  const roll = typeof rng === 'function' ? rng() : Math.random();
  if (unused.length) {
    open.push(unused[0]);
    if (unused.length > 1 && (preferOpen || roll > 0.45)) {
      open.push(unused[1]);
    }
  }
  return [...new Set(open)];
}

function chooseExits(exits, wanted, rng, { forceSide = false } = {}) {
  if (!exits.length) {
    return [{ id: 'exit-a', role: 'exit', position: [0, 1, -6.2], yaw: 0, wall: 'north' }];
  }
  const roll = typeof rng === 'function' ? rng : Math.random;
  const chosen = [];
  const pool = [...exits];
  const used = new Set();
  const take = (match) => {
    const index = pool.findIndex(match);
    if (index < 0) {
      return null;
    }
    const socket = pool.splice(index, 1)[0];
    chosen.push(socket);
    used.add(socketWall(socket));
    return socket;
  };
  take((socket) => isForwardSocket(socket));
  if ((forceSide || wanted >= 2) && chosen.length < wanted) {
    take((socket) => socketWall(socket) !== 'north');
  }
  while (chosen.length < wanted && pool.length) {
    const unused = pool.findIndex((socket) => !used.has(socketWall(socket)));
    const index = unused >= 0 ? unused : pickInt(roll, 0, pool.length - 1);
    const socket = pool.splice(index, 1)[0];
    chosen.push(socket);
    used.add(socketWall(socket));
  }
  if (!chosen.length) {
    chosen.push(exits[0]);
  }
  return chosen;
}
