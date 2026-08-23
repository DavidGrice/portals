import { PointLight, SpotLight, Vector3 } from 'three';

const aim = new Vector3();

export const FLASHLIGHT = {
  color: 0xfff4dc,
  intensity: 48,
  distance: 22,
  angle: 0.42,
  penumbra: 0.52,
  decay: 1.7,
  fillIntensity: 3.4,
  fillDistance: 5.5,
  performanceDistance: 12,
  performanceIntensity: 22,
  performanceFill: 1.6,
};

function makeSpot({ intensity = 0, distance = FLASHLIGHT.distance, angle = FLASHLIGHT.angle } = {}) {
  const light = new SpotLight(FLASHLIGHT.color, intensity, distance, angle, FLASHLIGHT.penumbra, FLASHLIGHT.decay);
  light.name = 'flashlight';
  light.castShadow = false;
  light.visible = true;
  light.userData.noCollider = true;
  light.userData.flashlight = true;
  light.target.userData.noCollider = true;
  return light;
}

function makeFill() {
  const fill = new PointLight(FLASHLIGHT.color, 0, FLASHLIGHT.fillDistance, 2);
  fill.name = 'flashlight-fill';
  fill.visible = true;
  fill.userData.noCollider = true;
  fill.userData.flashlight = true;
  return fill;
}

export class Flashlight {
  constructor(camera, {
    intensity = FLASHLIGHT.intensity,
    distance = FLASHLIGHT.distance,
    angle = FLASHLIGHT.angle,
  } = {}) {
    this.camera = camera;
    this.enabled = false;
    this.baseIntensity = intensity;
    this.fillIntensity = FLASHLIGHT.fillIntensity;
    this.fixtures = new Map();
    this.scene = null;
    this.light = makeSpot({ intensity: 0, distance, angle });
    this.fill = makeFill();
  }

  fixture(scene) {
    if (!scene) {
      return null;
    }
    let entry = this.fixtures.get(scene);
    if (!entry) {
      const owned = !this.light.parent;
      const light = owned ? this.light : makeSpot({
        distance: this.light.distance,
        angle: this.light.angle,
      });
      const fill = owned ? this.fill : makeFill();
      fill.distance = this.fill.distance;
      scene.add(light);
      scene.add(light.target);
      scene.add(fill);
      entry = { light, fill };
      this.fixtures.set(scene, entry);
    }
    return entry;
  }

  install(scenes = []) {
    for (const scene of scenes) {
      this.fixture(scene);
    }
    return this;
  }

  attach(scene) {
    if (!scene) {
      return this;
    }
    if (this.scene && this.scene !== scene) {
      const previous = this.fixtures.get(this.scene);
      if (previous) {
        previous.light.intensity = 0;
        previous.fill.intensity = 0;
      }
    }
    const entry = this.fixture(scene);
    this.scene = scene;
    this.light = entry.light;
    this.fill = entry.fill;
    this.apply();
    return this;
  }

  detach() {
    for (const [scene, entry] of this.fixtures) {
      entry.light.intensity = 0;
      entry.fill.intensity = 0;
      scene.remove(entry.light);
      scene.remove(entry.light.target);
      scene.remove(entry.fill);
    }
    this.fixtures.clear();
    this.scene = null;
    return this;
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    this.apply();
    return this.enabled;
  }

  toggle() {
    return this.setEnabled(!this.enabled);
  }

  apply() {
    this.light.intensity = this.enabled ? this.baseIntensity : 0;
    this.fill.intensity = this.enabled ? this.fillIntensity : 0;
    this.light.visible = true;
    this.fill.visible = true;
    this.light.castShadow = false;
    return this;
  }

  applyProfile(profileId) {
    const performance = profileId === 'performance';
    const distance = performance ? FLASHLIGHT.performanceDistance : FLASHLIGHT.distance;
    this.light.distance = distance;
    this.baseIntensity = performance ? FLASHLIGHT.performanceIntensity : FLASHLIGHT.intensity;
    this.fillIntensity = performance ? FLASHLIGHT.performanceFill : FLASHLIGHT.fillIntensity;
    this.fill.distance = performance ? Math.min(FLASHLIGHT.fillDistance, 3.4) : FLASHLIGHT.fillDistance;
    for (const entry of this.fixtures.values()) {
      entry.light.distance = this.light.distance;
      entry.light.castShadow = false;
      entry.fill.distance = this.fill.distance;
    }
    this.light.castShadow = false;
    this.apply();
    return this;
  }

  tick() {
    if (!this.camera) {
      return this;
    }
    this.camera.updateMatrixWorld();
    this.light.position.copy(this.camera.position);
    this.fill.position.copy(this.camera.position);
    this.camera.getWorldDirection(aim);
    this.light.target.position.copy(this.camera.position).addScaledVector(aim, 8);
    this.light.target.updateMatrixWorld();
    return this;
  }
}
