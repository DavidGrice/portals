export function compileNearRooms(session) {
  const renderer = session?.renderer;
  const controller = session?.controller;
  const camera = session?.camera;
  if (!renderer || typeof renderer.compile !== 'function' || !controller?.currentRoom || !camera) {
    return [];
  }
  const rooms = [controller.currentRoom];
  for (const portal of controller.currentRoom.portals ?? []) {
    const dest = controller.rooms.find((room) => room.scene === portal.destinationPortal?.scene);
    if (dest && !rooms.includes(dest)) {
      rooms.push(dest);
    }
  }
  controller.compiledRooms ??= new Set();
  const compiled = [];
  for (const room of rooms) {
    if (controller.compiledRooms.has(room.id)) {
      continue;
    }
    try {
      renderer.compile(room.scene, camera);
    } catch {
      // mock renderers and lost contexts
    }
    controller.compiledRooms.add(room.id);
    compiled.push(room.id);
  }
  return compiled;
}
