import { PerspectiveCamera } from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GraphicsSettings, Player, PostAA, createPortalRenderer } from '../engine/index.js';
import { loadWorld } from '../content/loadWorld.js';

const TEXTURE_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

export function createSession({
  settings,
  world,
  catalog,
  renderer = null,
  camera = null,
  mount = null,
  width = globalThis.innerWidth || 1280,
  height = globalThis.innerHeight || 720,
} = {}) {
  const nextSettings = settings ?? GraphicsSettings.load();
  const nextCamera = camera ?? new PerspectiveCamera(nextSettings.fov, width / Math.max(height, 1), 0.05, 280);
  const ownsRenderer = !renderer;
  const nextRenderer = renderer ?? createPortalRenderer({
    antialias: nextSettings.hardwareAa,
    pixelRatio: nextSettings.pixelRatio === 'device' ? undefined : Number(nextSettings.pixelRatio),
    shadows: nextSettings.shadows,
  });

  if (ownsRenderer && mount) {
    mount.insertBefore(nextRenderer.domElement, mount.firstChild);
  } else if (ownsRenderer && typeof document !== 'undefined') {
    document.body.insertBefore(nextRenderer.domElement, document.body.firstChild);
  }

  const controller = loadWorld(world, catalog, nextCamera, nextRenderer);
  const postAA = ownsRenderer ? new PostAA(nextRenderer) : stubPostAA();
  const controls = createControls(nextCamera, nextRenderer.domElement);
  controls.pointerSpeed = 0;
  const player = new Player({
    camera: nextCamera,
    eyeHeight: 1,
    moveSpeed: nextSettings.moveSpeed,
    jumpSpeed: nextSettings.jumpSpeed,
  });

  nextSettings.apply({
    camera: nextCamera,
    renderer: nextRenderer,
    controller,
    player,
    postAA,
    controls,
  });
  controller.setSize(width, height);
  postAA.setSize(width, height, typeof nextRenderer.getPixelRatio === 'function' ? nextRenderer.getPixelRatio() : 1);

  return {
    settings: nextSettings,
    camera: nextCamera,
    renderer: nextRenderer,
    controller,
    player,
    postAA,
    controls,
    ownsRenderer,
    dispose() {
      disposeSession(this);
    },
  };
}

export function disposeSession(session) {
  if (!session) {
    return;
  }

  try {
    session.controls?.unlock?.();
  } catch {
    // pointer lock may already be gone
  }
  session.controls?.dispose?.();
  session.postAA?.dispose?.();

  for (const room of session.controller?.rooms ?? []) {
    room.scene?.traverse(disposeObject3D);
  }

  if (session.ownsRenderer && session.renderer) {
    session.renderer.dispose?.();
    session.renderer.forceContextLoss?.();
    session.renderer.domElement?.remove?.();
  }

  session.camera = null;
  session.renderer = null;
  session.controller = null;
  session.player = null;
  session.postAA = null;
  session.controls = null;
}

function stubPostAA() {
  return {
    mode: 'off',
    setMode() {
      return this;
    },
    setSize() {
      return this;
    },
    begin() {},
    end() {},
    dispose() {},
  };
}

function createControls(camera, element) {
  if (!element?.ownerDocument) {
    return {
      pointerSpeed: 0,
      isLocked: false,
      enabled: true,
      moveForward() {},
      moveRight() {},
      lock() {},
      unlock() {},
      dispose() {},
      addEventListener() {},
      removeEventListener() {},
    };
  }
  return new PointerLockControls(camera, element);
}

function disposeObject3D(object) {
  if (object.isPortal || object.type === 'Portal') {
    return;
  }
  object.geometry?.dispose?.();
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  for (const material of materials) {
    if (!material) {
      continue;
    }
    for (const key of TEXTURE_KEYS) {
      material[key]?.dispose?.();
    }
    material.dispose?.();
  }
}
