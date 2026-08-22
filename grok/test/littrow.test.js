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
    assert.equal(world.startRoom, 'exhibit');
    assert.equal(world.freeRoam, true);
    assert.equal(world.rooms.length, 18);
    const catalog = readJson('data/catalog.json');
    const materials = readJson('data/materials.json');
    assert.deepEqual(validateWorld(world, catalog, materials), []);
  });

  it('loads a vertical floating grating card and one door to the labs', () => {
    const world = readJson('data/worlds/littrow.json');
    const catalog = readJson('data/catalog.json');
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    assert.equal(controller.currentRoom.id, 'exhibit');
    const exhibit = world.rooms.find((room) => room.id === 'exhibit');
    assert.equal(exhibit.portals.length, 1);
    assert.equal(exhibit.portals[0].destinationId, 'door-rotunda-exhibit');
    const kinds = new Set();
    let card = null;
    let lights = 0;
    let faces = 0;
    for (const room of controller.rooms) {
      room.scene.traverse((object) => {
        if (object.userData.kind) {
          kinds.add(object.userData.kind);
        }
        if (object.name === 'card-main' && room.id === 'exhibit') {
          card = object;
        }
        if (object.userData.gratingFace) {
          faces += 1;
        }
        if (object.userData.runningLight) {
          lights += 1;
        }
      });
    }
    assert.ok(card);
    assert.ok(card.userData.grating.height > card.userData.grating.width);
    assert.ok(card.userData.grating.height / card.userData.grating.width > 1.3);
    assert.equal(card.userData.grating.linesPerMm, 600);
    assert.equal(card.userData.spin, undefined);
    assert.equal(card.userData.grating.hover, true);
    assert.ok(card.userData.grating.plate);
    assert.ok(faces >= 2);
    assert.ok(kinds.has('arch.exhibit'));
    assert.ok(kinds.has('prop.dais'));
    const hot = controller.currentRoom.lasers.filter((laser) => laser.userData.laser.enabled);
    assert.equal(hot.length, 1);
    const lit = tickOptics([controller.currentRoom], { camera, dt: 0.016, controller, elapsed: 0 });
    assert.ok(lit.beams >= 3, `exhibit beams ${lit.beams}`);
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
    assert.equal(room.id, 'exhibit');
    const card = room.gratings.find((entry) => entry.name === 'card-main') ?? room.gratings[0];
    assert.equal(card.userData.spin, undefined);
    assert.equal(card.userData.grating.locked, true);
    assert.ok(card.userData.grating.height > card.userData.grating.width);
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

  it('opens every lab door from the exhibit and keeps the chain linked', () => {
    const world = readJson('data/worlds/littrow.json');
    const catalog = readJson('data/catalog.json');
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    assert.equal(controller.flags['free-roam'], true);
    assert.equal(controller.getPortal('door-exhibit-labs').enabled, true);
    assert.equal(controller.getPortal('door-rotunda-exhibit').destinationPortal.portalId, 'door-exhibit-labs');
    assert.equal(controller.getPortal('door-rotunda-collimator').enabled, true);
    assert.equal(controller.getPortal('door-rotunda-continuum').enabled, true);
    assert.equal(controller.getPortal('door-rotunda-blaze').enabled, true);
    assert.equal(controller.getPortal('door-rotunda-echelle').enabled, true);
    assert.equal(controller.getPortal('door-rotunda-rowland').enabled, true);
    assert.equal(controller.getPortal('door-rowland-disc').enabled, true);
    assert.equal(controller.getPortal('door-slit-vault').enabled, true);
    assert.ok(world.rooms.every((room) => !(room.portals ?? []).some((portal) => portal.enabled === false)));
  });

  it('locks the collimator card and keeps 532 nm first order at 18.6 deg', () => {
    const world = readJson('data/worlds/littrow.json');
    const collimator = world.rooms.find((room) => room.id === 'collimator');
    const card = collimator.entities.find((entity) => entity.id === 'card-collimator');
    assert.equal(card.props.spin, undefined);
    assert.ok(world.rooms.every((room) => !room.entities.some((entity) => entity.kind === 'prop.grating' && entity.props?.spin)));
    const exhibit = world.rooms.find((room) => room.id === 'exhibit');
    assert.ok(exhibit.entities.some((entity) => entity.props?.action === 'cycle-options'));
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

  it('identifies helium and opens every door after the return beam', () => {
    const catalog = readJson('data/catalog.json');
    const world = readJson('data/worlds/littrow.json');
    assert.ok(world.rooms.some((room) => room.id === 'identify'));
    assert.ok(world.rooms.find((room) => room.id === 'airlock').entities.some((entity) => entity.kind === 'prop.diagram'));
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    const identify = controller.rooms.find((room) => room.id === 'identify');
    controller.setCurrentScene('identify');
    const wrong = applyOpticsInteract('identify-lamp', { room: identify, spec: { answer: 'hydrogen' }, controller });
    assert.equal(wrong.ok, false);
    assert.equal(controller.flags['id-lamp'], undefined);
    const right = applyOpticsInteract('identify-lamp', { room: identify, spec: { answer: 'helium' }, controller });
    assert.equal(right.ok, true);
    assert.equal(controller.flags['id-lamp'], true);
    controller.flags['littrow-lock'] = true;
    syncOpticsDoors(controller);
    assert.equal(controller.flags['free-roam'], true);
    assert.equal(controller.getPortal('door-rotunda-collimator').enabled, true);
    assert.equal(controller.getPortal('door-slit-vault').enabled, true);
    assert.equal(controller.getPortal('door-hydrogen-identify').enabled, true);
  });
});
