import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Group, Mesh, PerspectiveCamera, PointLight } from 'three';
import { hydrateModel, spawnEntity } from '../src/content/prefabs.js';
import { buildMaterial, hydrateMaterialMaps, resolveMaterial } from '../src/content/materials.js';
import { loadWorld } from '../src/content/loadWorld.js';
import { makeWoodSet } from '../src/content/tiles-pbr.js';

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
    const gate = resolveMaterial('scifi.gate.floor');
    assert.equal(gate.mapPath, '/assets/textures/scifi/gate-floor.jpg');
    assert.ok(gate.normalMapPath.endsWith('gate-floor-n.jpg'));
    assert.equal(resolveMaterial('scifi.hull').mapPath, '/assets/textures/scifi/hull.png');
    assert.equal(resolveMaterial('scifi.hull').normalMapPath, '/assets/textures/scifi/hull-n.png');
    assert.equal(resolveMaterial('scifi.hazard').mapPath, '/assets/textures/scifi/hazard.jpg');
    assert.equal(resolveMaterial('scifi.horizon').mapPath, '/assets/textures/scifi/horizon.jpg');
    assert.equal(resolveMaterial('scifi.armor').metalnessMapPath, '/assets/textures/scifi/armor-m.png');
    assert.equal(resolveMaterial('scifi.plasma').emissiveMapPath, '/assets/textures/scifi/plasma-e.png');
    assert.equal(resolveMaterial('scifi.marble').mapPath, '/assets/textures/scifi/marble.png');
  });

  it('packs PBR maps from a canvas element using the 2d context', () => {
    const previous = globalThis.document;
    function stubCanvas(size = 16) {
      const pixels = new Uint8ClampedArray(size * size * 4).fill(140);
      const ctx = {
        fillStyle: '',
        canvas: null,
        fillRect() {},
        getImageData() {
          return { data: pixels, width: size, height: size };
        },
        putImageData() {},
        createImageData(width, height) {
          return { data: new Uint8ClampedArray(width * height * 4), width, height };
        },
      };
      const canvas = {
        width: size,
        height: size,
        getContext() {
          return ctx;
        },
      };
      ctx.canvas = canvas;
      return canvas;
    }
    globalThis.document = {
      createElement() {
        return stubCanvas(16);
      },
    };
    try {
      const set = makeWoodSet({ size: 16, cells: 4, repeat: [1, 1] });
      assert.ok(set.map);
      assert.ok(set.roughnessMap);
      assert.ok(set.normalMap);
    } finally {
      if (previous === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = previous;
      }
    }
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
    assert.ok(kinds.has('prop.model'));
  });

  it('keeps a GLTF box fallback and collider when the file is missing', async () => {
    const catalog = readJson('data/catalog.json');
    const object = spawnEntity({
      id: 'model-missing',
      kind: 'prop.model',
      props: { src: '/assets/models/nope.gltf', size: [1, 1, 1] },
    }, catalog);
    const proxy = object.children.find((child) => child.userData?.modelProxy);
    assert.ok(proxy.userData.collider);
    const failed = await hydrateModel(object, { load: async () => { throw new Error('missing'); } });
    assert.equal(failed, false);
    assert.equal(proxy.visible, true);
    const fake = new Group();
    fake.add(new Mesh());
    const ok = await hydrateModel(object, { load: async () => fake });
    assert.equal(ok, true);
    assert.equal(proxy.visible, false);
    assert.ok(proxy.userData.collider);
  });

  it('builds a standing ring with an inner horizon disc and no collider', () => {
    const catalog = readJson('data/catalog.json');
    const object = spawnEntity({
      id: 'ring-test',
      kind: 'prop.ring',
      position: [0, 1.9, -4],
      props: { radius: 1.7, tube: 0.14, material: 'scifi.gate.ring' },
    }, catalog);
    assert.equal(object.userData.kind, 'prop.ring');
    assert.equal(object.position.y, 1.9);
    let torus = null;
    let disc = null;
    object.traverse((child) => {
      if (child.geometry?.type === 'TorusGeometry') {
        torus = child;
      }
      if (child.userData?.horizon) {
        disc = child;
      }
    });
    assert.ok(torus);
    assert.ok(disc);
    assert.equal(disc.userData.materialId, 'scifi.horizon');
    assert.equal(object.userData.collider, undefined);
    assert.equal(torus.userData.collider, undefined);
  });

  it('strips imported GLTF lights so a DHD cannot hitch the room', async () => {
    const catalog = readJson('data/catalog.json');
    const object = spawnEntity({
      id: 'model-lit',
      kind: 'prop.model',
      props: { src: '/assets/models/dhd.glb', size: [1, 1, 1] },
    }, catalog);
    const fake = new Group();
    const mesh = new Mesh();
    const light = new PointLight(0xffffff, 8);
    fake.add(mesh);
    fake.add(light);
    const ok = await hydrateModel(object, { load: async () => fake });
    assert.equal(ok, true);
    let lights = 0;
    object.traverse((child) => {
      if (child.isLight) {
        lights += 1;
      }
    });
    assert.equal(lights, 0);
    assert.equal(mesh.castShadow, true);
  });
});
