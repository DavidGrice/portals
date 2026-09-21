export class Room {
  constructor({ id, scene, tags = [], clearColor = 0x000000, spawn = null, title = '', origin = [0, 0, 0] }) {
    this.id = id;
    this.scene = scene;
    this.scene.name = id;
    this.tags = tags;
    this.clearColor = clearColor;
    this.spawn = spawn;
    this.title = title;
    this.origin = origin;
    this.portals = [];
    this.motes = null;
    this.bursts = [];
    this.indexes = new Map();
  }

  ensureIndex(key, collect) {
    if (this.indexes.has(key)) {
      return this.indexes.get(key);
    }
    const value = collect(this);
    this.indexes.set(key, value);
    return value;
  }
}
