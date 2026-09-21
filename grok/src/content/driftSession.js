import {
  disposeRejectedSiblings,
  ensureForwardDoors,
  evictBehind,
  kitsForDepth,
  liveDestExits,
  logDriftEndRoom,
  sealArrival,
} from './drift.js';
import { doorTheme, gameAudio } from '../engine/audio.js';

export function onDriftEnter(session, { room, roomId, catalog, settings }) {
  if (!session?.controller?.drift) {
    return null;
  }
  const depth = room.depth ?? session.controller.drift.depth ?? 0;
  session.controller.drift.depth = depth;
  const lookArgs = {
    catalog,
    kits: kitsForDepth(depth + 1),
    seed: session.controller.drift.seed,
    depth,
    room,
  };
  const firstSpawn = ensureForwardDoors(session.controller, lookArgs);
  const evicted = evictBehind(session.controller);
  const refill = ensureForwardDoors(session.controller, lookArgs);
  const live = liveDestExits(room, session.controller);
  const report = {
    seed: session.controller.drift.seed,
    depth,
    room: roomId,
    kit: room.kitId ?? null,
    topology: room.topologyId ?? null,
    liveDests: live.length,
    spawned: firstSpawn.length + refill.length,
    evicted,
    doors: live.map((portal) => ({
      id: portal.portalId,
      dest: portal.destinationPortal?.portalId ?? null,
      x: Number(portal.position.x.toFixed(2)),
      z: Number(portal.position.z.toFixed(2)),
    })),
  };
  console.log('[drift] enter', report);
  if (live.length < 1) {
    logDriftEndRoom(session.controller, {
      room,
      spawned: firstSpawn.map((entry) => entry.id),
      refilled: refill.map((entry) => entry.id),
      evicted,
      kits: (lookArgs.kits ?? []).map((kit) => kit.id),
    });
  }
  return { depth, report, settings };
}

export function onDriftCross(session, { portal, portalId, from, to }) {
  if (!(session?.controller?.currentRoom?.tags?.includes('generated') || session?.controller?.drift)) {
    return false;
  }
  const destRoom = session.controller.rooms.find((entry) => entry.id === to);
  const fromRoom = session.controller.rooms.find((entry) => entry.id === from);
  if (sealArrival(portal ?? session.controller.getPortal(portalId), { tags: destRoom?.tags ?? [] })) {
    gameAudio.slam(doorTheme(destRoom));
  }
  disposeRejectedSiblings(session.controller, fromRoom, to);
  return true;
}
