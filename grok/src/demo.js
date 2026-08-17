import world from '../data/worlds/two-rooms.json';
import catalog from '../data/catalog.json';
import { loadWorld } from './content/loadWorld.js';

export function createDemo(camera, renderer) {
  return loadWorld(world, catalog, camera, renderer);
}
