import world from '../data/worlds/two-rooms.json' with { type: 'json' };
import catalog from '../data/catalog.json' with { type: 'json' };
import { loadWorld } from './content/loadWorld.js';

export function createDemo(camera, renderer) {
  return loadWorld(world, catalog, camera, renderer);
}
