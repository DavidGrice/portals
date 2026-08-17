import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { Player, Room, collectColliders, resolveColliders } from '../src/engine/index.js';

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

  it('pushes the capsule out of a solid box', () => {
    const scene = new Scene();
    const box = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    box.position.set(0, 0.5, 0);
    box.userData.collider = { type: 'aabb' };
    scene.add(box);
    box.updateMatrixWorld(true);
    const room = new Room({ id: 'test', scene });
    const position = new Vector3(0, 1, 0);
    resolveColliders(position, { radius: 0.3, eyeHeight: 1 }, collectColliders(room));
    assert.ok(Math.abs(position.z) >= 0.79 || Math.abs(position.x) >= 0.79, `pushed to ${position.x},${position.z}`);
  });
});
