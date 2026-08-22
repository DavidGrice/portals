import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { Player, Portal, Room, collectColliders, findInteract, findSupportY, resolveColliders, runInteract } from '../src/engine/index.js';
import { FRAME, prefabs } from '../src/content/prefabs.js';
import { HOLE_WIDTH, addStairs } from '../src/content/volumes.js';

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

  it('launches even when already in the air', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 1.4, 0);
    const player = new Player({ camera, eyeHeight: 1, gravity: 0 });
    player.onGround = false;
    assert.equal(player.launch([0, 5, 0]), true);
    assert.equal(player.velocity.y, 5);
    assert.equal(player.onGround, false);
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

  it('lets the capsule pass through a door opening', () => {
    const scene = new Scene();
    const frame = prefabs.frame({
      id: 'frame-ab',
      props: { color: '#ffffff', coversPortalId: 'door-ab' },
    });
    scene.add(frame);
    scene.updateMatrixWorld(true);
    const room = new Room({ id: 'test', scene });
    const position = new Vector3(0, 1, 0.1);
    resolveColliders(position, { radius: 0.28, eyeHeight: 1 }, collectColliders(room));
    assert.ok(Math.abs(position.z - 0.1) < 0.001, `blocked in opening at z=${position.z}`);
    assert.ok(Math.abs(position.x) < 0.001, `slid sideways to x=${position.x}`);
  });

  it('lands on a box top and stays there', () => {
    const scene = new Scene();
    const box = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    box.position.set(0, 0.5, 0);
    box.userData.collider = { type: 'aabb' };
    scene.add(box);
    box.updateMatrixWorld(true);
    const room = new Room({ id: 'test', scene });
    const camera = new PerspectiveCamera();
    camera.position.set(0, 2.4, 0);
    const player = new Player({ camera, eyeHeight: 1, gravity: 50 });
    player.onGround = false;
    player.step(1, {}, null, room);
    assert.ok(Math.abs(camera.position.y - 2) < 0.001, `y ${camera.position.y}`);
    assert.equal(player.onGround, true);
    assert.ok(Math.abs(camera.position.x) < 0.001, `ejected x ${camera.position.x}`);
    assert.ok(Math.abs(camera.position.z) < 0.001, `ejected z ${camera.position.z}`);
  });

  it('walks off a box and falls to the floor', () => {
    const scene = new Scene();
    const box = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    box.position.set(0, 0.5, 0);
    box.userData.collider = { type: 'aabb' };
    scene.add(box);
    box.updateMatrixWorld(true);
    const room = new Room({ id: 'test', scene });
    const camera = new PerspectiveCamera();
    camera.position.set(0, 2, 0);
    const player = new Player({ camera, eyeHeight: 1, gravity: 50, moveSpeed: 8 });
    const controls = {
      moveForward() {},
      moveRight(distance) {
        camera.position.x += distance;
      },
    };
    player.step(1, { right: 1 }, controls, room);
    assert.ok(camera.position.x > 1, `x ${camera.position.x}`);
    assert.equal(camera.position.y, 1);
    assert.equal(player.onGround, true);
  });

  it('corridor walls block the capsule but the door hole stays open', () => {
    const scene = new Scene();
    scene.add(prefabs.corridor({
      props: { halfX: 8, zMin: 0, zMax: 6, openings: [0] },
    }));
    scene.updateMatrixWorld(true);
    const room = new Room({ id: 'test', scene });
    const inWall = new Vector3(0, 1, 6);
    resolveColliders(inWall, { radius: 0.28, eyeHeight: 1 }, collectColliders(room));
    assert.ok(Math.abs(inWall.z - 6) > 0.2, `still inside the back wall at z=${inWall.z}`);
    const hole = new Vector3(0, 1, 0);
    resolveColliders(hole, { radius: 0.28, eyeHeight: 1 }, collectColliders(room));
    assert.ok(Math.abs(hole.x) < 0.001, `hole pushed x=${hole.x}`);
    assert.ok(Math.abs(hole.z) < 0.001, `hole pushed z=${hole.z}`);
    assert.ok(HOLE_WIDTH > FRAME.outer, 'opening must stay wider than the metal frame');
  });

  it('climbs stairs without getting stuck in overlapping treads', () => {
    const scene = new Scene();
    const group = new Group();
    addStairs(group, new MeshBasicMaterial(), {
      x: 0, z0: 1.4, z1: -2.2, y0: 0, y1: 2.18, width: 1.55, steps: 10,
    });
    scene.add(group);
    scene.updateMatrixWorld(true);
    const room = new Room({ id: 'stairs', scene });
    const stairCols = collectColliders(room);
    assert.ok(stairCols.length >= 8, `stair colliders ${stairCols.length}`);
    assert.ok(stairCols.some((entry) => entry.walkable), 'stairs must be walkable');
    const camera = new PerspectiveCamera();
    camera.position.set(0, 1, 1.22);
    const firstSupport = findSupportY(camera.position, { eyeHeight: 1, velocity: { y: 0 } }, stairCols, 1);
    assert.ok(firstSupport > 0.05, `first tread support ${firstSupport} from ${JSON.stringify(stairCols[0])}`);
    const player = new Player({ camera, eyeHeight: 1, gravity: 40, moveSpeed: 4 });
    const controls = {
      moveForward(distance) {
        camera.position.z -= distance;
      },
      moveRight() {},
    };
    for (let i = 0; i < 16; i += 1) {
      player.step(0.05, { forward: 1 }, controls, room);
    }
    assert.ok(camera.position.y > 1.8, `should climb, y=${camera.position.y} z=${camera.position.z}`);
    assert.ok(Math.abs(camera.position.x) < 0.35, `sideways push x=${camera.position.x}`);
  });

  it('falls through an open floor portal instead of standing on it', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 1, 0);
    const player = new Player({ camera, eyeHeight: 1, gravity: 20 });
    const scene = new Scene();
    const room = new Room({ id: 'pit', scene });
    const pit = new Portal(2, 2, { id: 'pit-a' });
    pit.position.set(0, 0, 0);
    pit.rotation.x = -Math.PI / 2;
    pit.updateMatrixWorld(true);
    room.portals = [pit];
    player.onGround = true;
    player.step(0.16, {}, null, room);
    assert.equal(player.onGround, false);
    assert.ok(camera.position.y < 1, `y ${camera.position.y}`);
  });

  it('finds an interact pad in range and unlocks a portal', () => {
    const scene = new Scene();
    const pad = prefabs.pad({
      props: { action: 'unlock', portalId: 'door-de' },
    });
    pad.position.set(0, 0.04, 0);
    scene.add(pad);
    scene.updateMatrixWorld(true);
    const room = new Room({ id: 'test', scene });
    const near = findInteract(room, new Vector3(0, 1, 0.4));
    assert.equal(near.spec.action, 'unlock');
    const far = findInteract(room, new Vector3(0, 1, 8));
    assert.equal(far, null);
    const portal = { enabled: false, portalId: 'door-de' };
    const result = runInteract(near, {
      controller: {
        getPortal(id) {
          return id === 'door-de' ? portal : null;
        },
      },
    });
    assert.equal(result.type, 'unlock');
    assert.equal(portal.enabled, true);
  });

  it('holds a two-pad unlock behind a flag and stokes a hearth', () => {
    const portal = { enabled: false, portalId: 'door-cg' };
    const controller = {
      flags: {},
      getPortal(id) {
        return id === 'door-cg' ? portal : null;
      },
    };
    const blocked = runInteract({
      spec: { action: 'unlock', portalId: 'door-cg', require: 'gold-core' },
    }, { controller });
    assert.equal(blocked.ok, false);
    assert.equal(portal.enabled, false);
    runInteract({ spec: { action: 'look', setFlag: 'gold-core' } }, { controller });
    const opened = runInteract({
      spec: { action: 'unlock', portalId: 'door-cg', require: 'gold-core' },
    }, { controller });
    assert.equal(opened.ok, true);
    assert.equal(portal.enabled, true);
    const hearth = { userData: { fire: { base: 1.2 } } };
    const stoked = runInteract({ object: hearth, spec: { action: 'stoke' } }, { controller });
    assert.equal(stoked.type, 'stoke');
    assert.ok(hearth.userData.fire.base > 1.2);
  });
});
