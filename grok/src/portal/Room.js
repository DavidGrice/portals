export class Room {
  constructor({ id, scene, tags = [], clearColor = 0x000000, spawn = null }) {
    this.id = id;
    this.scene = scene;
    this.scene.name = id;
    this.tags = tags;
    this.clearColor = clearColor;
    this.spawn = spawn;
    this.portals = [];
  }
}
