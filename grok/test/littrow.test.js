import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { loadWorld } from '../src/content/loadWorld.js';
import { spawnEntity } from '../src/content/prefabs.js';
import { runInteract } from '../src/engine/interact.js';
import { bedForRoom } from '../src/engine/audio.js';
import { listWorlds, getWorldData } from '../src/ui/worlds.js';
import { validateWorld } from '../scripts/validate-world.js';
import { syncOpticsDoors, tickOptics, applyOpticsInteract } from '../src/optics/tickOptics.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

function mockRenderer() {
  return {
    autoClear: true,
    clippingPlanes: [],
    setClearColor() {},
    setSize() {},
    getContext() { return {}; },
    state: { buffers: {} },
    clear() {},
    render() {},
  };
}

describe('Littrow', () => {
  it('is on the picker and validates', () => {
    assert.ok(listWorlds().some((entry) => entry.id === 'littrow'));
    const world = getWorldData('littrow');
    assert.equal(world.id, 'littrow');
    assert.equal(world.startRoom, 'rotunda');
    assert.equal(world.rooms.length, 16);
    const catalog = readJson('data/catalog.json');
    const materials = readJson('data/materials.json');
    assert.deepEqual(validateWorld(world, catalog, materials), []);
  });

  it('loads a stationary grating card and no combat kinds', () => {
    const world = readJson('data/worlds/littrow.json');
    const catalog = readJson('data/catalog.json');
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    assert.equal(controller.currentRoom.id, 'rotunda');
    const kinds = new Set();
    let card = null;
    let lights = 0;
    for (const room of controller.rooms) {
      room.scene.traverse((object) => {
        if (object.userData.kind) {
          kinds.add(object.userData.kind);
        }
        if (object.name === 'card-main') {
          card = object;
        }
        if (object.userData.runningLight) {
          lights += 1;
        }
      });
    }
    assert.ok(card);
    assert.equal(card.userData.grating.linesPerMm, 600);
    assert.equal(card.userData.spin, undefined);
    assert.ok(kinds.has('prop.grating'));
    assert.ok(kinds.has('prop.laser'));
    assert.ok(kinds.has('prop.detector'));
    assert.ok(!kinds.has('prop.npc'));
    assert.ok(!kinds.has('prop.hearth'));
    assert.ok(lights >= 8);
    assert.equal(bedForRoom(controller.currentRoom), 'grating');
    assert.ok(!controller.rooms.some((room) => room.portals?.some((portal) => Math.abs((portal.rotation?.x ?? 0) + Math.PI / 2) < 0.01)));
  });

  it('keeps the card stationary and cycles options from one pedestal', () => {
    const catalog = readJson('data/catalog.json');
    const world = readJson('data/worlds/littrow.json');
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    const room = controller.currentRoom;
    const card = room.gratings.find((entry) => entry.name === 'card-main') ?? room.gratings[0];
    assert.equal(card.userData.spin, undefined);
    assert.equal(card.userData.grating.locked, true);
    const cycled = runInteract({ spec: { action: 'cycle-options' } }, { controller });
    assert.equal(cycled.type, 'cycle-options');
    assert.equal(card.userData.grating.linesPerMm, 1200);
    const arm = runInteract({
      spec: { action: 'arm-laser', lambdaNm: 532 },
    }, { controller });
    assert.equal(arm.type, 'arm-laser');
    const hot = room.lasers.filter((laser) => laser.userData.laser.enabled);
    assert.equal(hot.length, 1);
    runInteract({ spec: { action: 'kill-laser' } }, { controller });
    assert.equal(room.lasers.filter((laser) => laser.userData.laser.enabled).length, 0);
  });

  it('spawns optics kinds from the catalog', () => {
    const catalog = readJson('data/catalog.json');
    const grating = spawnEntity({ id: 'g', kind: 'prop.grating', props: { linesPerMm: 600 } }, catalog);
    assert.equal(grating.userData.grating.linesPerMm, 600);
    const laser = spawnEntity({ id: 'l', kind: 'prop.laser', props: { lambdaNm: 532 } }, catalog);
    assert.equal(laser.userData.laser.lambdaNm, 532);
    const detector = spawnEntity({ id: 'd', kind: 'prop.detector', props: { order: 1, lambdaNm: 532 } }, catalog);
    assert.equal(detector.userData.detector.order, 1);
  });

  it('keeps lab doors sealed until the optics flags fire', () => {
    const world = readJson('data/worlds/littrow.json');
    const catalog = readJson('data/catalog.json');
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    assert.equal(controller.getPortal('door-rotunda-collimator').enabled, false);
    assert.equal(controller.getPortal('door-rotunda-continuum').enabled, false);
    assert.equal(controller.getPortal('door-rotunda-blaze').enabled, false);
    assert.equal(controller.getPortal('door-rotunda-echelle').enabled, false);
    assert.equal(controller.getPortal('door-rotunda-rowland').enabled, false);
    assert.equal(controller.getPortal('door-rowland-disc').enabled, false);
    assert.equal(controller.getPortal('door-slit-vault').enabled, false);
    controller.flags = { 'found-zero': true };
    syncOpticsDoors(controller);
    assert.equal(controller.getPortal('door-rotunda-collimator').enabled, true);
    controller.flags['diode-405'] = true;
    controller.flags['diode-532'] = true;
    controller.flags['diode-633'] = true;
    syncOpticsDoors(controller);
    assert.equal(controller.flags['three-diodes'], true);
    assert.equal(controller.getPortal('door-rotunda-continuum').enabled, true);
  });

  it('locks the collimator card and keeps 532 nm first order at 18.6 deg', () => {
    const world = readJson('data/worlds/littrow.json');
    const collimator = world.rooms.find((room) => room.id === 'collimator');
    const card = collimator.entities.find((entity) => entity.id === 'card-collimator');
    assert.equal(card.props.spin, undefined);
    assert.ok(world.rooms.every((room) => !room.entities.some((entity) => entity.kind === 'prop.grating' && entity.props?.spin)));
    assert.ok(world.rooms[0].entities.some((entity) => entity.props?.action === 'cycle-options'));
    const echelle = world.rooms.find((room) => room.id === 'echelle').entities.find((entity) => entity.id === 'card-echelle');
    assert.equal(echelle.props.linesPerMm, 75);
    assert.equal(echelle.props.mMin, 12);
    assert.equal(echelle.props.blazeDeg, 63);
  });

  it('emits a continuum rainbow of first-order bins and needs tilt for echelle', () => {
    const catalog = readJson('data/catalog.json');
    const world = readJson('data/worlds/littrow.json');
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    const continuum = controller.rooms.find((room) => room.id === 'continuum');
    controller.setCurrentScene('continuum');
    applyOpticsInteract('arm-laser', { room: continuum, spec: { lambdaNm: 0 }, controller });
    const result = tickOptics([continuum], { camera, dt: 0.016, controller, elapsed: 0 });
    assert.ok(result.beams >= 8, `continuum beams ${result.beams}`);
    const echelle = controller.rooms.find((room) => room.id === 'echelle');
    controller.setCurrentScene('echelle');
    applyOpticsInteract('arm-laser', { room: echelle, spec: { lambdaNm: 532 }, controller });
    const before = tickOptics([echelle], { camera, dt: 0.016, controller, elapsed: 0 });
    const hit = applyOpticsInteract('cycle-options', { room: echelle, spec: {}, controller });
    assert.equal(hit.type, 'cycle-options');
    assert.ok(echelle.gratings[0].userData.grating.crossTilt);
    const after = tickOptics([echelle], { camera, dt: 0.016, controller, elapsed: 0 });
    assert.ok(after.beams >= 1);
    assert.ok(before.beams >= 1);
  });

  it('confirms blaze only after the ruled +1 detector flag', () => {
    const catalog = readJson('data/catalog.json');
    const world = readJson('data/worlds/littrow.json');
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    const blaze = controller.rooms.find((room) => room.id === 'blaze');
    controller.setCurrentScene('blaze');
    const denied = applyOpticsInteract('confirm-blaze', { room: blaze, spec: {}, controller });
    assert.equal(denied.ok, false);
    controller.flags['blaze-ruled-plus'] = true;
    const ok = applyOpticsInteract('confirm-blaze', { room: blaze, spec: {}, controller });
    assert.equal(ok.ok, true);
    assert.equal(controller.flags['understood-blaze'], true);
    assert.equal(controller.getPortal('door-rotunda-echelle').enabled, true);
  });
});
