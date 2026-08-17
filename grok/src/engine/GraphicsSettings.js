import { DirectionalLight } from 'three';
import { AA_MODE_IDS } from './aaModes.js';
import { suggestGraphicsQuality } from './deviceProfile.js';
import { applyFullscreen } from './gamepad.js';

const STORAGE_KEY = 'portals-grok-graphics';
const BASE_FAR = 280;

export const GRAPHICS_PROFILES = {
  performance: {
    id: 'performance',
    label: 'Performance',
    blurb: 'Lower resolution, shadows off, shallow recursion. Best for phones, tablets, and laptops.',
    pixelRatio: 0.75,
    hardwareAa: false,
    shadows: false,
    shadowMapSize: 1024,
    shadowBias: -0.0006,
    recursion: 1,
    viewDistance: 0.75,
    fillLight: false,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    blurb: 'Full shadows, hardware AA, two portal hops. A good match for most desktops.',
    pixelRatio: 1,
    hardwareAa: true,
    shadows: true,
    shadowMapSize: 2048,
    shadowBias: -0.0004,
    recursion: 2,
    viewDistance: 1,
    fillLight: false,
  },
  ultra: {
    id: 'ultra',
    label: 'Ultra',
    blurb: 'Device pixel ratio, 4K shadows, a fill light, four portal hops. For a strong GPU.',
    pixelRatio: 'device',
    hardwareAa: true,
    shadows: true,
    shadowMapSize: 4096,
    shadowBias: -0.0002,
    recursion: 4,
    viewDistance: 1.15,
    fillLight: true,
  },
};

export const GRAPHICS_QUALITY_LIST = [
  GRAPHICS_PROFILES.performance,
  GRAPHICS_PROFILES.balanced,
  GRAPHICS_PROFILES.ultra,
];

export const UI_THEMES = [
  { id: 'glass', label: 'Aero Glass', blurb: 'Blurred slab, lit top edge — the default welcome look.' },
  { id: 'metal', label: 'Metalheart', blurb: 'Clipped steel plate, zero radii, an accent hairline.' },
  { id: 'chrome', label: 'Chrome', blurb: 'Translucent plastic, hard bevel, a gloss cap.' },
  { id: 'leather', label: 'Leather', blurb: 'Tooled hide, saddle stitch, brass and parchment.' },
];

export const KEYBIND_GROUPS = [
  {
    label: 'Movement',
    actions: [
      { id: 'forward', label: 'Move Forward' },
      { id: 'back', label: 'Move Back' },
      { id: 'left', label: 'Move Left' },
      { id: 'right', label: 'Move Right' },
      { id: 'jump', label: 'Jump' },
      { id: 'interact', label: 'Interact' },
    ],
  },
  {
    label: 'Look',
    actions: [
      { id: 'lookLeft', label: 'Look Left' },
      { id: 'lookRight', label: 'Look Right' },
      { id: 'lookUp', label: 'Look Up' },
      { id: 'lookDown', label: 'Look Down' },
    ],
  },
];

export const DEFAULT_KEYBINDS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  interact: 'KeyE',
  lookLeft: 'ArrowLeft',
  lookRight: 'ArrowRight',
  lookUp: 'ArrowUp',
  lookDown: 'ArrowDown',
};

const LEGACY_PROFILE = {
  low: 'performance',
  medium: 'balanced',
  high: 'balanced',
};

const ANISOTROPY_LEVELS = [1, 2, 4, 8, 16];
const TEXTURE_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

function number(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

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

function resolveProfileId(name) {
  if (GRAPHICS_PROFILES[name]) {
    return name;
  }
  return LEGACY_PROFILE[name] ?? 'balanced';
}

function resolveAaMode(value) {
  return AA_MODE_IDS.includes(value) ? value : 'off';
}

function resolveTheme(value) {
  return UI_THEMES.some((theme) => theme.id === value) ? value : 'glass';
}

function resolveAnisotropy(value) {
  const numeric = Number(value);
  if (ANISOTROPY_LEVELS.includes(numeric)) {
    return numeric;
  }
  return 8;
}

function migrate(raw = {}) {
  const next = { ...raw };
  if (next.profile && !GRAPHICS_PROFILES[next.profile] && LEGACY_PROFILE[next.profile]) {
    next.profile = LEGACY_PROFILE[next.profile];
  }
  if (next.aaMode == null && typeof next.aa === 'boolean') {
    next.aaMode = next.aa ? 'fxaa' : 'off';
  }
  if (next.hardwareAa == null && typeof next.aa === 'boolean') {
    next.hardwareAa = next.aa;
  }
  return next;
}

export class GraphicsSettings {
  constructor(values = {}) {
    const migrated = migrate(values);
    const profileId = resolveProfileId(migrated.profile);
    const profile = GRAPHICS_PROFILES[profileId];

    this.profile = profileId;
    this.aaMode = resolveAaMode(migrated.aaMode);
    this.hardwareAa = Boolean(migrated.hardwareAa ?? profile.hardwareAa);
    this.aa = this.hardwareAa;
    this.recursion = clamp(number(migrated.recursion, profile.recursion), 1, 4);
    this.pixelRatio = migrated.pixelRatio ?? profile.pixelRatio;
    this.shadows = migrated.shadows ?? profile.shadows;
    this.shadowMapSize = number(migrated.shadowMapSize, profile.shadowMapSize);
    this.fillLight = migrated.fillLight ?? profile.fillLight;
    this.anisotropy = resolveAnisotropy(migrated.anisotropy);
    this.viewDistance = clamp(number(migrated.viewDistance, profile.viewDistance), 0.7, 1.3);
    this.fov = clamp(number(migrated.fov, 70), 50, 100);
    this.mouseSensitivity = clamp(number(migrated.mouseSensitivity, 0.5), 0.1, 1.5);
    this.gamepadSensitivity = clamp(number(migrated.gamepadSensitivity, 0.5), 0.1, 1.5);
    this.invertY = Boolean(migrated.invertY);
    this.fullscreen = Boolean(migrated.fullscreen);
    this.moveSpeed = clamp(number(migrated.moveSpeed, 4), 2, 8);
    this.jumpSpeed = clamp(number(migrated.jumpSpeed, 6.5), 4, 10);
    this.lookKeySpeed = clamp(number(migrated.lookKeySpeed, 1.4), 0.4, 3);
    this.masterVolume = clamp(number(migrated.masterVolume, 0.8), 0, 1);
    this.musicVolume = clamp(number(migrated.musicVolume, 0.5), 0, 1);
    this.sfxVolume = clamp(number(migrated.sfxVolume, 0.9), 0, 1);
    this.showFps = Boolean(migrated.showFps);
    this.showCrosshair = migrated.showCrosshair !== false;
    this.colorblindMode = Boolean(migrated.colorblindMode);
    this.uiTheme = resolveTheme(migrated.uiTheme);
    this.keybinds = { ...DEFAULT_KEYBINDS, ...(migrated.keybinds ?? {}) };
  }

  static load() {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) {
        return new GraphicsSettings({ profile: suggestGraphicsQuality() });
      }
      return new GraphicsSettings(JSON.parse(raw));
    } catch {
      return new GraphicsSettings({ profile: suggestGraphicsQuality() });
    }
  }

  static fromProfile(name, previous = {}) {
    const profileId = resolveProfileId(name);
    const profile = GRAPHICS_PROFILES[profileId];
    return new GraphicsSettings({
      ...previous,
      profile: profileId,
      pixelRatio: profile.pixelRatio,
      hardwareAa: profile.hardwareAa,
      shadows: profile.shadows,
      shadowMapSize: profile.shadowMapSize,
      recursion: profile.recursion,
      viewDistance: profile.viewDistance,
      fillLight: profile.fillLight,
    });
  }

  save() {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.toJSON()));
    return this;
  }

  toJSON() {
    return {
      profile: this.profile,
      aaMode: this.aaMode,
      hardwareAa: this.hardwareAa,
      aa: this.hardwareAa,
      recursion: this.recursion,
      pixelRatio: this.pixelRatio,
      shadows: this.shadows,
      shadowMapSize: this.shadowMapSize,
      fillLight: this.fillLight,
      anisotropy: this.anisotropy,
      viewDistance: this.viewDistance,
      fov: this.fov,
      mouseSensitivity: this.mouseSensitivity,
      gamepadSensitivity: this.gamepadSensitivity,
      invertY: this.invertY,
      fullscreen: this.fullscreen,
      moveSpeed: this.moveSpeed,
      jumpSpeed: this.jumpSpeed,
      lookKeySpeed: this.lookKeySpeed,
      masterVolume: this.masterVolume,
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
      showFps: this.showFps,
      showCrosshair: this.showCrosshair,
      colorblindMode: this.colorblindMode,
      uiTheme: this.uiTheme,
      keybinds: { ...this.keybinds },
    };
  }

  apply({ camera, renderer, controller, player, postAA, controls } = {}) {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = this.uiTheme;
      document.documentElement.dataset.colorblind = this.colorblindMode ? 'on' : 'off';
      applyFullscreenSetting(this.fullscreen);
    }

    if (camera) {
      camera.fov = this.fov;
      camera.far = BASE_FAR * this.viewDistance;
      camera.updateProjectionMatrix();
    }

    if (player) {
      player.moveSpeed = this.moveSpeed;
      player.jumpSpeed = this.jumpSpeed;
    }

    if (controls && 'pointerSpeed' in controls) {
      controls.pointerSpeed = 0;
    }

    if (controller) {
      controller.maxRecursion = this.recursion;
      if (typeof controller.setSize === 'function' && renderer?.domElement) {
        controller.setSize(renderer.domElement.clientWidth || globalThis.innerWidth, renderer.domElement.clientHeight || globalThis.innerHeight);
      }
      this._applyRooms(controller);
    }

    if (renderer) {
      renderer.setPixelRatio(resolvePixelRatio(this.pixelRatio));
      renderer.shadowMap.enabled = this.shadows;
    }

    if (postAA) {
      postAA.setMode(this.aaMode);
      if (renderer?.domElement) {
        postAA.setSize(renderer.domElement.clientWidth || globalThis.innerWidth, renderer.domElement.clientHeight || globalThis.innerHeight, renderer.getPixelRatio());
      }
    }

    return this;
  }

  _applyRooms(controller) {
    const profile = GRAPHICS_PROFILES[this.profile];
    const size = this.shadows ? this.shadowMapSize : 1024;
    for (const room of controller.rooms ?? []) {
      let fill = null;
      room.scene.traverse((object) => {
        if (object.userData.isFillLight) {
          fill = object;
        }
        if (object.isDirectionalLight && !object.userData.isFillLight) {
          object.castShadow = this.shadows;
          if (object.shadow) {
            object.shadow.mapSize.set(size, size);
            object.shadow.bias = profile.shadowBias;
            object.shadow.needsUpdate = true;
          }
        }
        applyAnisotropy(object, this.anisotropy);
      });
      if (this.fillLight && !fill) {
        const light = new DirectionalLight(0xb8c8ff, 0.22);
        light.position.set(-6, 4, -3);
        light.userData.isFillLight = true;
        room.scene.add(light);
      } else if (!this.fillLight && fill) {
        fill.parent?.remove(fill);
      }
    }
  }
}

function applyFullscreenSetting(wanted) {
  applyFullscreen(wanted);
}

function applyAnisotropy(object, level) {
  const materials = [];
  if (object.material) {
    if (Array.isArray(object.material)) {
      materials.push(...object.material);
    } else {
      materials.push(object.material);
    }
  }
  for (const material of materials) {
    for (const key of TEXTURE_KEYS) {
      const texture = material[key];
      if (texture?.isTexture) {
        texture.anisotropy = level;
      }
    }
  }
}

export { BASE_FAR };
