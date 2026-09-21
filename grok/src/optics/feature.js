import { applyOpticsInteract, indexRoomOptics, tickOptics } from './tickOptics.js';

const OPTICS_ACTIONS = new Set([
  'arm-laser',
  'kill-laser',
  'cycle-options',
  'set-grooves',
  'flip-blaze',
  'set-mode',
  'set-slit',
  'read-angle',
  'arm-lamp',
  'tilt-cross',
  'confirm-blaze',
  'confirm-evanescent',
  'confirm-polar',
  'resolve-sodium',
  'identify-lamp',
]);

export const opticsFeature = {
  id: 'optics',
  indexRoom(room) {
    indexRoomOptics(room);
  },
  tick(rooms, ctx) {
    return tickOptics(rooms, ctx);
  },
  onInteract(action, ctx) {
    if (!OPTICS_ACTIONS.has(action)) {
      return undefined;
    }
    if (ctx.controller?.theme && ctx.controller.theme !== 'optics') {
      return undefined;
    }
    return applyOpticsInteract(action, ctx);
  },
};
