import { Color, PerspectiveCamera, WebGLRenderTarget } from 'three';

const SCREEN_FPS = 12;
const STRIP_FPS = 8;
const TILE_W = 160;
const TILE_H = 90;
const savedClear = new Color();

export function collectScreens(controller) {
  const screens = [];
  for (const room of controller.rooms ?? []) {
    const origin = room.origin ?? [0, 0, 0];
    room.scene.traverse((object) => {
      const spec = object.userData?.screen;
      if (!spec || object.userData.screenSurface) {
        return;
      }
      const surface = findScreenSurface(object);
      if (!surface) {
        return;
      }
      screens.push({
        object,
        surface,
        roomId: room.id,
        spec,
        origin,
      });
    });
  }
  return screens;
}

export function listDestViews(controller) {
  return (controller.currentScenePortals ?? [])
    .filter((portal) => portal.destinationPortal)
    .map((portal) => {
      const destRoom = controller.rooms.find((entry) => entry.scene === portal.destinationPortal.scene);
      return {
        portalId: portal.portalId ?? '?',
        enabled: portal.enabled !== false,
        destRoomId: destRoom?.id ?? null,
        destTitle: destRoom?.title || destRoom?.id || '?',
      };
    });
}

export function attachGadgets(controller) {
  const screens = collectScreens(controller).map((entry) => bindScreen(entry));
  return {
    screens,
    destCamera: new PerspectiveCamera(60, TILE_W / TILE_H, 0.05, 280),
    destTarget: new WebGLRenderTarget(TILE_W, TILE_H),
    screenAcc: SCREEN_FPS,
    stripAcc: STRIP_FPS,
    lastStripKey: '',
    dispose() {
      for (const screen of screens) {
        if (screen.surface?.material) {
          screen.surface.material.map = null;
        }
        screen.target?.dispose?.();
      }
      this.destTarget?.dispose?.();
      this.screens = [];
    },
  };
}

export function tickScreens(gadgets, { controller, renderer, dt = 0, force = false } = {}) {
  if (!gadgets?.screens?.length || !renderer?.setRenderTarget) {
    return 0;
  }
  gadgets.screenAcc = (gadgets.screenAcc ?? 0) + dt;
  if (!force && gadgets.screenAcc < 1 / SCREEN_FPS) {
    return 0;
  }
  gadgets.screenAcc = 0;

  const room = controller.currentRoom;
  const current = gadgets.screens.filter((screen) => screen.roomId === room?.id);
  if (!current.length) {
    return 0;
  }

  const restore = pushTarget(renderer);
  for (const screen of gadgets.screens) {
    setScreenVisible(screen, false);
  }

  renderer.autoClear = true;
  renderer.clippingPlanes = [];
  for (const screen of current) {
    renderer.setRenderTarget(screen.target);
    renderer.setClearColor?.(room.clearColor, 1);
    renderer.clear?.(true, true, true);
    renderer.render(room.scene, screen.camera);
  }

  popTarget(renderer, restore);
  for (const screen of gadgets.screens) {
    setScreenVisible(screen, true);
  }
  return current.length;
}

export function tickDestStrip(gadgets, { controller, renderer, root, enabled = false, dt = 0, force = false } = {}) {
  if (!root) {
    return 0;
  }
  if (!enabled) {
    root.hidden = true;
    return 0;
  }

  const views = listDestViews(controller);
  const key = views.map((view) => `${view.portalId}:${view.enabled}`).join('|');
  if (typeof document !== 'undefined' && key !== gadgets.lastStripKey) {
    rebuildStrip(root, views);
    gadgets.lastStripKey = key;
  }

  root.hidden = views.length === 0;
  if (!views.length || !renderer?.setRenderTarget) {
    return 0;
  }

  gadgets.stripAcc = (gadgets.stripAcc ?? 0) + dt;
  if (!force && gadgets.stripAcc < 1 / STRIP_FPS) {
    return 0;
  }
  gadgets.stripAcc = 0;

  const tiles = typeof document !== 'undefined' ? [...root.querySelectorAll('.dest-tile')] : [];
  const restore = pushTarget(renderer);
  renderer.autoClear = true;

  for (let i = 0; i < views.length; i += 1) {
    const portal = controller.getPortal(views[i].portalId);
    if (!portal?.destinationPortal) {
      continue;
    }
    const destRoom = controller.rooms.find((entry) => entry.scene === portal.destinationPortal.scene);
    if (!destRoom) {
      continue;
    }
    gadgets.destCamera.aspect = TILE_W / TILE_H;
    const clip = controller.prepareDestView(portal, gadgets.destCamera);
    renderer.setRenderTarget(gadgets.destTarget);
    renderer.clippingPlanes = clip ? [clip] : [];
    renderer.setClearColor?.(destRoom.clearColor, 1);
    renderer.clear?.(true, true, true);
    setFramesVisible(destRoom.scene, portal.destinationPortal.portalId, false);
    renderer.render(destRoom.scene, gadgets.destCamera);
    setFramesVisible(destRoom.scene, portal.destinationPortal.portalId, true);
    blitTargetToCanvas(renderer, gadgets.destTarget, tiles[i]?.querySelector?.('canvas'));
  }

  popTarget(renderer, restore);
  return views.length;
}

function bindScreen(entry) {
  const { spec, origin } = entry;
  const width = Math.max(64, spec.width ?? 320);
  const height = Math.max(64, spec.height ?? 180);
  const target = new WebGLRenderTarget(width, height);
  const camera = new PerspectiveCamera(spec.fov ?? 58, width / height, 0.08, 80);
  const from = spec.cameraPosition ?? [4.8, 2.3, 5.2];
  const at = spec.lookAt ?? [0, 1.05, 0.2];
  camera.position.set(from[0] + origin[0], from[1] + origin[1], from[2] + origin[2]);
  camera.lookAt(at[0] + origin[0], at[1] + origin[1], at[2] + origin[2]);
  camera.updateMatrixWorld();

  const material = entry.surface.material;
  if (material) {
    material.map = target.texture;
    material.color?.set?.(0xffffff);
    material.needsUpdate = true;
  }

  return { ...entry, target, camera };
}

function findScreenSurface(root) {
  if (root.userData?.screenSurface) {
    return root;
  }
  let found = null;
  root.traverse((object) => {
    if (!found && object.userData?.screenSurface) {
      found = object;
    }
  });
  return found;
}

function setScreenVisible(screen, visible) {
  if (screen.surface) {
    screen.surface.visible = visible;
  }
}

function setFramesVisible(scene, portalId, visible) {
  scene.traverse((object) => {
    if (object.userData?.portalFrame && object.userData.coversPortalId === portalId) {
      object.visible = visible;
    }
  });
}

function pushTarget(renderer) {
  const clear = renderer.getClearColor?.(savedClear) ?? savedClear;
  return {
    target: renderer.getRenderTarget?.() ?? null,
    autoClear: renderer.autoClear,
    planes: renderer.clippingPlanes,
    clearR: clear.r,
    clearG: clear.g,
    clearB: clear.b,
    clearA: renderer.getClearAlpha?.() ?? 1,
  };
}

function popTarget(renderer, restore) {
  renderer.setRenderTarget?.(restore.target);
  renderer.autoClear = restore.autoClear;
  renderer.clippingPlanes = restore.planes ?? [];
  if (renderer.setClearColor) {
    savedClear.setRGB(restore.clearR ?? 0, restore.clearG ?? 0, restore.clearB ?? 0);
    renderer.setClearColor(savedClear, restore.clearA ?? 1);
  }
}

function rebuildStrip(root, views) {
  root.replaceChildren();
  for (const view of views) {
    const tile = document.createElement('div');
    tile.className = `dest-tile${view.enabled ? '' : ' dest-tile-off'}`;
    const canvas = document.createElement('canvas');
    canvas.width = TILE_W;
    canvas.height = TILE_H;
    const label = document.createElement('span');
    label.textContent = `${view.portalId} → ${view.destTitle}${view.enabled ? '' : ' (sealed)'}`;
    tile.append(canvas, label);
    root.append(tile);
  }
}

function blitTargetToCanvas(renderer, target, canvas) {
  if (!canvas || typeof renderer.readRenderTargetPixels !== 'function') {
    return;
  }
  const width = target.width;
  const height = target.height;
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
  const context = canvas.getContext?.('2d');
  if (!context?.createImageData) {
    return;
  }
  try {
    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      const src = (height - 1 - y) * width * 4;
      image.data.set(pixels.subarray(src, src + width * 4), y * width * 4);
    }
    context.putImageData(image, 0, 0);
  } catch {
    // Node mocks and lost contexts skip the blit.
  }
}
