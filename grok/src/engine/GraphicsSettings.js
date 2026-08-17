const STORAGE_KEY = 'portals-grok-graphics';

export const GRAPHICS_PROFILES = {
  low: { profile: 'low', aa: false, recursion: 1, pixelRatio: 0.75, shadows: false, fov: 60 },
  medium: { profile: 'medium', aa: false, recursion: 2, pixelRatio: 1, shadows: false, fov: 60 },
  high: { profile: 'high', aa: true, recursion: 3, pixelRatio: 'device', shadows: true, fov: 60 },
  ultra: { profile: 'ultra', aa: true, recursion: 4, pixelRatio: 'device', shadows: true, fov: 70 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function resolvePixelRatio(value) {
  if (value === 'device') {
    return Math.min(globalThis.devicePixelRatio || 1, 2);
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, 0.5, 2) : 1;
}

export class GraphicsSettings {
  constructor(values = {}) {
    const base = GRAPHICS_PROFILES[values.profile] ?? GRAPHICS_PROFILES.high;
    this.profile = base.profile;
    this.aa = values.aa ?? base.aa;
    this.recursion = clamp(Number(values.recursion ?? base.recursion), 1, 4);
    this.pixelRatio = values.pixelRatio ?? base.pixelRatio;
    this.shadows = values.shadows ?? base.shadows;
    this.fov = clamp(Number(values.fov ?? base.fov), 50, 90);
  }

  static load() {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      return new GraphicsSettings(raw ? JSON.parse(raw) : { profile: 'high' });
    } catch {
      return new GraphicsSettings({ profile: 'high' });
    }
  }

  static fromProfile(name) {
    return new GraphicsSettings(GRAPHICS_PROFILES[name] ?? GRAPHICS_PROFILES.high);
  }

  save() {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.toJSON()));
    return this;
  }

  toJSON() {
    return {
      profile: this.profile,
      aa: this.aa,
      recursion: this.recursion,
      pixelRatio: this.pixelRatio,
      shadows: this.shadows,
      fov: this.fov,
    };
  }

  apply({ camera, renderer, controller } = {}) {
    if (camera) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
    if (controller) {
      controller.maxRecursion = this.recursion;
      if (typeof controller.setSize === 'function' && renderer?.domElement) {
        controller.setSize(renderer.domElement.clientWidth || globalThis.innerWidth, renderer.domElement.clientHeight || globalThis.innerHeight);
      }
      for (const room of controller.rooms ?? []) {
        room.scene.traverse((object) => {
          if (object.isDirectionalLight) {
            object.castShadow = this.shadows;
          }
        });
      }
    }
    if (renderer) {
      renderer.setPixelRatio(resolvePixelRatio(this.pixelRatio));
      renderer.shadowMap.enabled = this.shadows;
    }
    return this;
  }
}
