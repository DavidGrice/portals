import { tickMaterials } from '../content/materials.js';
import { indexRoomFx, tickAtmosphere, tickNpcs } from '../engine/atmosphere.js';
import { tickScreens } from '../engine/gadgets.js';
import { opticsFeature } from '../optics/feature.js';
import { registerFeature } from './registry.js';

let installed = false;

export function installBuiltinFeatures() {
  if (installed) {
    return;
  }
  installed = true;
  registerFeature(opticsFeature);
  registerFeature({
    id: 'atmosphere',
    indexRoom(room) {
      indexRoomFx(room);
    },
    tick(rooms, ctx) {
      tickAtmosphere(rooms, { elapsed: ctx.elapsed ?? 0, dt: ctx.dt ?? 0.016 });
      tickNpcs(rooms, ctx.camera);
    },
  });
  registerFeature({
    id: 'materials',
    tick(rooms, ctx) {
      return tickMaterials(rooms, ctx.dt ?? 0.016);
    },
  });
  registerFeature({
    id: 'screens',
    tick(_rooms, ctx) {
      if (!ctx.gadgets || !ctx.renderer || !ctx.controller) {
        return 0;
      }
      return tickScreens(ctx.gadgets, {
        controller: ctx.controller,
        renderer: ctx.renderer,
        dt: ctx.dt ?? 0,
      });
    },
  });
}

export function resetBuiltinFeatures() {
  installed = false;
}
