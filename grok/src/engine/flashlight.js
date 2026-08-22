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
    this.light = new SpotLight(FLASHLIGHT.color, 0, distance, angle, FLASHLIGHT.penumbra, FLASHLIGHT.decay);
    this.light.name = 'flashlight';
    this.light.castShadow = false;
    this.light.userData.noCollider = true;
    this.light.userData.flashlight = true;
    this.light.target.userData.noCollider = true;
    this.fill = new PointLight(FLASHLIGHT.color, 0, FLASHLIGHT.fillDistance, 2);
    this.fill.name = 'flashlight-fill';
    this.fill.userData.noCollider = true;
    this.fill.userData.flashlight = true;
  }

  attach(scene) {
    if (!scene) {
      return this;
    }
    if (this.light.parent && this.light.parent !== scene) {
      this.light.parent.remove(this.light);
      this.light.target.parent?.remove(this.light.target);
      this.fill.parent?.remove(this.fill);
    }
    if (this.light.parent !== scene) {
      scene.add(this.light);
      scene.add(this.light.target);
      scene.add(this.fill);
    }
    this.apply();
    return this;
  }

  detach() {
    this.light.parent?.remove(this.light);
    this.light.target.parent?.remove(this.light.target);
    this.fill.parent?.remove(this.fill);
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
    this.light.distance = performance ? FLASHLIGHT.performanceDistance : FLASHLIGHT.distance;
    this.baseIntensity = performance ? FLASHLIGHT.performanceIntensity : FLASHLIGHT.intensity;
    this.fillIntensity = performance ? FLASHLIGHT.performanceFill : FLASHLIGHT.fillIntensity;
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
