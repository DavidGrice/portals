import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { Player } from '../src/engine/index.js';

describe('player', () => {
  it('stays on the floor at eye height', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 3, 0);
    const player = new Player({ camera, eyeHeight: 1, gravity: 50 });
    player.onGround = false;
    player.step(1, {}, null);
    assert.equal(camera.position.y, 1);
    assert.equal(player.onGround, true);
  });

  it('jumps only from the ground', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 1, 0);
    const player = new Player({ camera, eyeHeight: 1, jumpSpeed: 6, gravity: 0 });
    assert.equal(player.jump(), true);
    player.step(0.1, {}, null);
    assert.ok(camera.position.y > 1, `y ${camera.position.y}`);
    assert.equal(player.onGround, false);
    assert.equal(player.jump(), false);
  });
});
