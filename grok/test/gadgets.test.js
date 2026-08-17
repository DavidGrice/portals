import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { attachGadgets, collectScreens, listDestViews, tickDestStrip, tickScreens } from '../src/engine/gadgets.js';
import { loadWorld } from '../src/content/loadWorld.js';
import { prefabs } from '../src/content/prefabs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

function mockRenderer() {
  const calls = [];
  return {
    autoClear: true,
    clippingPlanes: [],
    _target: null,
    _clear: { r: 0.1, g: 0.2, b: 0.3 },
    _alpha: 1,
    setClearColor(color, alpha) {
      this._clear = color;
      this._alpha = alpha;
    },
    getClearColor(target) {
      if (target && typeof this._clear === 'object' && 'r' in this._clear) {
        target.r = this._clear.r;
        target.g = this._clear.g;
        target.b = this._clear.b;
      }
      return target ?? this._clear;
    },
    getClearAlpha() {
      return this._alpha;
    },
    setRenderTarget(target) {
      this._target = target;
      calls.push(['target', target]);
    },
    getRenderTarget() {
      return this._target;
    },
    setSize() {},
    getContext() {
      return {};
    },
    state: { buffers: {} },
    clear() {
      calls.push(['clear']);
    },
    render(scene, camera) {
      calls.push(['render', scene, camera]);
    },
    readRenderTargetPixels() {},
    calls,
  };
}

function loadHalls() {
  const world = readJson('data/worlds/two-rooms.json');
  const catalog = readJson('data/catalog.json');
  const camera = new PerspectiveCamera(60, 1, 0.05, 280);
  camera.position.set(0, 1, 4);
  const renderer = mockRenderer();
  const controller = loadWorld(world, catalog, camera, renderer);
  return { controller, renderer, camera };
}

describe('gadgets', () => {
  it('builds a framed glass pane with a collider and a physical pane', () => {
    const glass = prefabs.glass({ props: { color: '#9ecfff' } });
    let pane = null;
    let collider = false;
    glass.traverse((object) => {
      if (object.userData.glass) {
        pane = object;
      }
      if (object.userData.collider) {
        collider = true;
      }
    });
    assert.ok(pane);
    assert.equal(pane.material.transmission > 0.5, true);
    assert.equal(collider, true);
  });

  it('builds a screen with a surface and a room-local camera spec', () => {
    const screen = prefabs.screen({
      props: { stand: false, cameraPosition: [2, 2, 2], lookAt: [0, 1, 0] },
    });
    assert.ok(screen.userData.screen);
    assert.deepEqual(screen.userData.screen.cameraPosition, [2, 2, 2]);
    let surface = null;
    screen.traverse((object) => {
      if (object.userData.screenSurface) {
        surface = object;
      }
    });
    assert.ok(surface);
  });

  it('collects in-room screens and binds render targets', () => {
    const { controller } = loadHalls();
    const found = collectScreens(controller);
    assert.ok(found.length >= 2);
    const gadgets = attachGadgets(controller);
    assert.equal(gadgets.screens.length, found.length);
    assert.ok(gadgets.screens[0].target);
    assert.ok(gadgets.screens[0].camera);
    assert.equal(gadgets.screens[0].surface.material.map, gadgets.screens[0].target.texture);
    gadgets.dispose();
  });

  it('renders only current-room screens to their targets, then restores the renderer', () => {
    const { controller, renderer } = loadHalls();
    const gadgets = attachGadgets(controller);
    const count = tickScreens(gadgets, { controller, renderer, force: true });
    assert.equal(count, 1);
    const rendered = renderer.calls.filter((entry) => entry[0] === 'render');
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0][2], gadgets.screens.find((screen) => screen.roomId === 'room-a').camera);
    assert.equal(renderer.getRenderTarget(), null);
    assert.equal(renderer.autoClear, false);
    gadgets.dispose();
  });

  it('lists dest-camera strip views without treating them as portals', () => {
    const { controller } = loadHalls();
    const fromA = listDestViews(controller);
    assert.equal(fromA.length, 1);
    assert.equal(fromA[0].portalId, 'door-ab');
    assert.equal(fromA[0].destRoomId, 'room-b');
    controller.setCurrentScene('room-d');
    const fromD = listDestViews(controller);
    assert.equal(fromD.length, 2);
    assert.ok(fromD.some((view) => view.portalId === 'door-de' && view.enabled === false));
  });

  it('prepareDestView matches the portal dest camera and tickDestStrip restores state', () => {
    const { controller, renderer, camera } = loadHalls();
    const dest = new PerspectiveCamera(60, 16 / 9, 0.05, 280);
    const clip = controller.prepareDestView(controller.getPortal('door-ab'), dest);
    assert.ok(clip);
    dest.matrixWorld.decompose(dest.position, dest.quaternion, dest.scale);
    assert.ok(dest.position.x > 200, 'dest camera sits in the dest hall origin');
    const gadgets = attachGadgets(controller);
    const root = { hidden: true, querySelectorAll() { return []; } };
    const count = tickDestStrip(gadgets, { controller, renderer, root, enabled: true, force: true });
    assert.equal(count, 1);
    assert.equal(root.hidden, false);
    assert.equal(renderer.getRenderTarget(), null);
    assert.equal(camera.position.x < 10, true);
    const off = { hidden: false, querySelectorAll() { return []; } };
    assert.equal(tickDestStrip(gadgets, { controller, renderer, root: off, enabled: false }), 0);
    assert.equal(off.hidden, true);
    gadgets.dispose();
  });
});
