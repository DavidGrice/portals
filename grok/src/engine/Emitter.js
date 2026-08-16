export class Emitter {
  constructor() {
    this._listeners = new Map();
  }

  on(type, handler) {
    const list = this._listeners.get(type) ?? [];
    list.push(handler);
    this._listeners.set(type, list);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    const list = this._listeners.get(type);
    if (!list) {
      return;
    }
    this._listeners.set(
      type,
      list.filter((entry) => entry !== handler),
    );
  }

  emit(type, detail = {}) {
    const list = this._listeners.get(type);
    if (!list) {
      return;
    }
    for (const handler of list) {
      handler(detail);
    }
  }
}
