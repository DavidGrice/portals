import topologyI from '../../data/topologies/I.json' with { type: 'json' };
import topologyL from '../../data/topologies/L.json' with { type: 'json' };
import topologyT from '../../data/topologies/T.json' with { type: 'json' };
import topologyPlus from '../../data/topologies/plus.json' with { type: 'json' };
import topologyU from '../../data/topologies/U.json' with { type: 'json' };
import topologyCourt from '../../data/topologies/court.json' with { type: 'json' };
import topologyLoft from '../../data/topologies/loft.json' with { type: 'json' };
import topologyShaft from '../../data/topologies/shaft.json' with { type: 'json' };
import topologyRotunda from '../../data/topologies/rotunda.json' with { type: 'json' };
import topologyAlcove from '../../data/topologies/alcove.json' with { type: 'json' };
import { pickOne } from './rng.js';
import { socketWorld } from './volumes.js';

const BY_ID = {
  I: topologyI,
  L: topologyL,
  T: topologyT,
  plus: topologyPlus,
  U: topologyU,
  court: topologyCourt,
  loft: topologyLoft,
  shaft: topologyShaft,
  rotunda: topologyRotunda,
  alcove: topologyAlcove,
};

export function listTopologies() {
  return Object.values(BY_ID);
}

export function getTopology(id) {
  return BY_ID[id] ?? null;
}

export function resolveSocket(topology, socket) {
  if (socket.position) {
    return {
      ...socket,
      position: [...socket.position],
      yaw: socket.yaw ?? socketWorld(socket, topology.footprint ?? {}).yaw,
      wall: socket.wall ?? 'north',
    };
  }
  const pose = socketWorld(socket, topology.footprint ?? {});
  return { ...socket, ...pose };
}

export function topologySockets(topology, role = null) {
  return (topology?.sockets ?? [])
    .filter((socket) => !role || socket.role === role)
    .map((socket) => resolveSocket(topology, socket));
}

export function pickTopology(rng, { kit, recent = [], allow = null } = {}) {
  const poolIds = allow
    ?? kit?.topologies
    ?? ['I'];
  const pool = poolIds.map((id) => getTopology(id)).filter(Boolean);
  if (!pool.length) {
    return topologyI;
  }
  const blocked = new Set(
    recent.map((entry) => String(entry).split('|').slice(0, 2).join('|')),
  );
  const fresh = pool.filter((topology) => !blocked.has(`${topology.id}|${kit?.id ?? ''}`));
  return pickOne(rng, fresh.length ? fresh : pool) ?? topologyI;
}

export function roomFingerprint(room) {
  const walls = [...new Set(
    (room.portals ?? [])
      .filter((portal) => portal.role === 'exit')
      .map((portal) => portal.wall ?? ''),
  )].sort().join(',');
  return `${room.topologyId ?? 'I'}|${room.kitId ?? ''}|${walls}`;
}

export function holesFromSockets(sockets) {
  return sockets.map((socket) => ({
    wall: socket.wall,
    u: Number(
      socket.u
      ?? ((socket.wall === 'west' || socket.wall === 'east')
        ? socket.position?.[2]
        : socket.position?.[0])
      ?? 0,
    ),
  }));
}
