import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { spawnEntity } from '../src/content/prefabs.js';
import { buildMaterial, hydrateMaterialMaps, resolveMaterial } from '../src/content/materials.js';
import { loadWorld } from '../src/content/loadWorld.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

describe('haunt furniture and textures', () => {
  it('spawns every haunt furniture kind with a collider or pose', () => {
    const catalog = readJson('data/catalog.json');
    const kinds = [
      'prop.chair', 'prop.table', 'prop.sideboard', 'prop.portrait',
      'prop.curtain', 'prop.window', 'prop.rug', 'prop.books', 'prop.trunk',
    ];
    for (const kind of kinds) {
      const object = spawnEntity({ id: kind, kind, position: [0, 0, 0] }, catalog);
      assert.ok(object, kind);
      let colliders = 0;
      object.traverse((child) => {
        if (child.userData?.collider) {
          colliders += 1;
        }
      });
      if (kind !== 'prop.portrait' && kind !== 'prop.curtain' && kind !== 'prop.window' && kind !== 'prop.books') {
        assert.ok(colliders >= 1 || object.userData.collider, `${kind} has no collider`);
      }
    }
  });

  it('keeps a recipe map when a file path cannot load', () => {
    const spec = resolveMaterial('haunt.boards');
    assert.equal(spec.mapPath, '/assets/textures/haunt/boards.jpg');
    const material = buildMaterial('shared.stone');
    const before = material.map;
    hydrateMaterialMaps(material, { ...spec, mapPath: '/assets/textures/haunt/missing-nope.jpg' }, {
      loader: {
        load() {
          throw new Error('missing');
        },
      },
    });
    assert.equal(material.map, before);
  });

  it('builds Blender-style PBR recipe sets for wood, brick, and metal', () => {
    assert.equal(resolveMaterial('haunt.boards').recipe, 'wood');
    assert.equal(resolveMaterial('haunt.brick').recipe, 'brick');
    assert.equal(resolveMaterial('haunt.iron').recipe, 'metal');
    assert.equal(resolveMaterial('ages.dirt').recipe, 'dirt');
    assert.equal(buildMaterial('shared.stone').type, 'MeshPhysicalMaterial');
  });

  it('uses measured Chaos metal F0 values and a glass IOR of 1.5', () => {
    const gold = resolveMaterial('metal.gold');
    assert.equal(gold.metalness, 1);
    assert.equal(gold.color, 0xffe39d);
    const iron = resolveMaterial('metal.iron');
    assert.equal(iron.metalness, 1);
    const glass = resolveMaterial('glass.pane');
    assert.equal(glass.ior, 1.5);
    assert.ok(glass.transmission > 0.5);
    const dirty = resolveMaterial('haunt.plaster.dirty');
    assert.equal(dirty.overlay, 'cloud');
    assert.equal(buildMaterial('metal.gold').metalness, 1);
  });

  it('assigns a stubbed file map when a loader is provided', () => {
    const fake = { isTexture: true, repeat: { set() {} }, wrapS: 0, wrapT: 0, anisotropy: 1 };
    const material = buildMaterial('haunt.plaster');
    hydrateMaterialMaps(material, resolveMaterial('haunt.plaster'), {
      loader: { load() { return fake; } },
      anisotropy: 8,
    });
    assert.equal(material.map, fake);
    assert.equal(fake.anisotropy, 8);
  });

  it('rebuilds Hollow House as chambers with furniture, not one cube per hall', () => {
    const world = readJson('data/worlds/haunted-house.json');
    const catalog = readJson('data/catalog.json');
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = loadWorld(world, catalog, camera, {
      autoClear: true,
      clippingPlanes: [],
      setClearColor() {},
      setSize() {},
      getContext() { return {}; },
      state: { buffers: {} },
      clear() {},
      render() {},
    });
    const kinds = new Set();
    const shells = {};
    for (const room of controller.rooms) {
      room.scene.traverse((object) => {
        if (object.userData.kind) {
          kinds.add(object.userData.kind);
        }
        if (object.userData.volume?.kind) {
          shells[room.id] = object.userData.volume.kind;
        }
      });
    }
    assert.equal(shells.foyer, 'chamber');
    assert.equal(shells.hall, 'chamber');
    assert.equal(shells.parlor, 'chamber');
    assert.equal(shells.dining, 'chamber');
    assert.equal(shells.attic, 'loft');
    assert.equal(shells.crypt, 'rotunda');
    assert.ok(kinds.has('prop.chair'));
    assert.ok(kinds.has('prop.table'));
    assert.ok(kinds.has('prop.window'));
    assert.ok(kinds.has('prop.trunk'));
    assert.ok(kinds.has('prop.rug'));
    assert.equal(controller.getPortal('door-pa').enabled, false);
    assert.ok(!kinds.has('arch.corridor') || shells.foyer !== 'corridor');
  });
});
