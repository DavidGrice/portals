import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from 'three';
import { FRAME, prefabs } from '../src/content/prefabs.js';
import { Room } from '../src/engine/index.js';
import {
  attachMotes,
  MOTE_BUDGET,
  profileMoteDensity,
  setMoteDensity,
  spawnCrossBurst,
  tickAtmosphere,
} from '../src/engine/atmosphere.js';
import { GRAPHICS_PROFILES } from '../src/engine/GraphicsSettings.js';

describe('atmosphere', () => {
  it('keeps glow lips inside the metal opening', () => {
    const frame = prefabs.frame({ props: { color: '#7ec8ff', coversPortalId: 'door-ab' } });
    let glowCount = 0;
    frame.traverse((object) => {
      if (!object.userData.portalGlow) {
        return;
      }
      glowCount += 1;
      assert.ok(Math.abs(object.position.x) <= FRAME.jambInner / 2 + 0.001);
      assert.ok(Math.abs(object.position.y) <= FRAME.jambInner / 2 + 0.001);
    });
    assert.equal(glowCount, 4);
  });

  it('scales mote draw range from the quality profile', () => {
    assert.equal(profileMoteDensity('performance'), 0);
    assert.equal(profileMoteDensity('balanced'), 1);
    assert.equal(profileMoteDensity('ultra'), 1.3);
    assert.equal(GRAPHICS_PROFILES.performance.particleDensity, 0);
    const room = new Room({ id: 'a', scene: new Scene() });
    attachMotes(room, { origin: [250, 0, 0] });
    assert.equal(setMoteDensity(room, 0), 0);
    assert.equal(room.motes.geometry.drawRange.count, 0);
    assert.equal(setMoteDensity(room, 1), 96);
    assert.equal(setMoteDensity(room, 1.3), Math.round(96 * 1.3));
    assert.ok(setMoteDensity(room, 1.3) <= MOTE_BUDGET);
  });

  it('spawns a short burst and expires it', () => {
    const room = new Room({ id: 'a', scene: new Scene() });
    const burst = spawnCrossBurst(room, { x: 0, y: 1, z: 0 }, 0xff0000);
    assert.ok(burst);
    assert.equal(room.bursts.length, 1);
    tickAtmosphere([room], { elapsed: 1, dt: 1 });
    assert.equal(room.bursts.length, 0);
  });
});
