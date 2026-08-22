import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Scene } from 'three';
import { DEFAULT_KEYBINDS, FLASHLIGHT, Flashlight, GraphicsSettings } from '../src/engine/index.js';

describe('flashlight', () => {
  it('defaults off and T is the bind', () => {
    assert.equal(DEFAULT_KEYBINDS.flashlight, 'KeyT');
    const settings = new GraphicsSettings();
    assert.equal(settings.keybinds.flashlight, 'KeyT');
    const light = new Flashlight(new PerspectiveCamera());
    assert.equal(light.enabled, false);
    assert.equal(light.light.intensity, 0);
  });

  it('toggles on and off without strobing a held state', () => {
    const light = new Flashlight(new PerspectiveCamera());
    assert.equal(light.toggle(), true);
    assert.ok(light.light.intensity >= 20);
    assert.equal(light.toggle(), false);
    assert.equal(light.light.intensity, 0);
  });

  it('reparents onto the current room scene', () => {
    const camera = new PerspectiveCamera();
    const first = new Scene();
    const second = new Scene();
    const light = new Flashlight(camera);
    light.attach(first);
    assert.equal(light.light.parent, first);
    light.attach(second);
    assert.equal(light.light.parent, second);
    assert.equal(light.light.target.parent, second);
    assert.equal(light.fill.parent, second);
  });

  it('shortens the beam on the performance profile', () => {
    const light = new Flashlight(new PerspectiveCamera());
    light.applyProfile('ultra');
    assert.equal(light.light.distance, FLASHLIGHT.distance);
    light.applyProfile('performance');
    assert.equal(light.light.distance, FLASHLIGHT.performanceDistance);
    light.setEnabled(true);
    assert.equal(light.light.intensity, FLASHLIGHT.performanceIntensity);
  });

  it('aims the beam from the camera', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(2, 1, 4);
    camera.lookAt(2, 1, 0);
    camera.updateMatrixWorld();
    const light = new Flashlight(camera);
    light.tick();
    assert.equal(light.light.position.x, 2);
    assert.ok(light.light.target.position.z < camera.position.z);
  });
});
