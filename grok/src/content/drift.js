import { createRng, pickOne } from './rng.js';
import { allocateOrigin, generateRoom } from './generateRoom.js';
import { addRoom, dressRooms, relinkPortals } from './loadWorld.js';

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
