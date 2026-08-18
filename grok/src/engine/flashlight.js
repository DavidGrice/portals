import { SpotLight, Vector3 } from 'three';

const aim = new Vector3();

export const FLASHLIGHT = {
  color: 0xfff1d0,
  intensity: 2.6,
  distance: 16,
  angle: 0.46,
  penumbra: 0.4,
  decay: 1.6,
  performanceDistance: 9,
  performanceIntensity: 1.6,
};

export class Flashlight {
  constructor(camera, {
    intensity = FLASHLIGHT.intensity,
    distance = FLASHLIGHT.distance,
    angle = FLASHLIGHT.angle,
  } = {}) {
    this.camera = camera;
    this.enabled = false;
    this.baseIntensity = intensity;
    this.light = new SpotLight(FLASHLIGHT.color, 0, distance, angle, FLASHLIGHT.penumbra, FLASHLIGHT.decay);
    this.light.name = 'flashlight';
    this.light.castShadow = false;
    this.light.userData.noCollider = true;
    this.light.target.userData.noCollider = true;
  }

  attach(scene) {
    if (!scene) {
      return this;
    }
    if (this.light.parent && this.light.parent !== scene) {
      this.light.parent.remove(this.light);
      this.light.target.parent?.remove(this.light.target);
    }
    if (this.light.parent !== scene) {
      scene.add(this.light);
      scene.add(this.light.target);
    }
    this.apply();
    return this;
  }

  detach() {
    this.light.parent?.remove(this.light);
    this.light.target.parent?.remove(this.light.target);
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
    this.light.visible = this.enabled;
    return this;
  }

  applyProfile(profileId) {
    const performance = profileId === 'performance';
    this.light.distance = performance ? FLASHLIGHT.performanceDistance : FLASHLIGHT.distance;
    this.baseIntensity = performance ? FLASHLIGHT.performanceIntensity : FLASHLIGHT.intensity;
    this.apply();
    return this;
  }

  tick() {
    if (!this.camera) {
      return this;
    }
    this.camera.updateMatrixWorld();
    this.light.position.copy(this.camera.position);
    this.camera.getWorldDirection(aim);
    this.light.target.position.copy(this.camera.position).addScaledVector(aim, 6);
    this.light.target.updateMatrixWorld();
    return this;
  }
}
