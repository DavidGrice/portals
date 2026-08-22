import { PerspectiveCamera } from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Flashlight, GraphicsSettings, Player, PostAA, attachGadgets, createPortalRenderer } from '../engine/index.js';
import { loadWorld } from '../content/loadWorld.js';
import { hydrateRoomMaterials } from '../content/materials.js';
import { openDrift } from '../content/drift.js';
import { createOriginPool } from '../content/generateRoom.js';
import { applyPose } from '../content/save.js';

const TEXTURE_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

export function createSession({
  settings,
  world,
  catalog,
  renderer = null,
  createRenderer = createPortalRenderer,
  camera = null,
  mount = null,
  pose = null,
  width = globalThis.innerWidth || 1280,
  height = globalThis.innerHeight || 720,
} = {}) {
  const nextSettings = settings ?? GraphicsSettings.load();
  const nextCamera = camera ?? new PerspectiveCamera(nextSettings.fov, width / Math.max(height, 1), 0.05, 280);
  const ownsRenderer = !renderer;
  let nextRenderer = renderer;

  try {
    nextRenderer ??= createRenderer({
      antialias: nextSettings.hardwareAa,
      pixelRatio: nextSettings.pixelRatio === 'device' ? undefined : Number(nextSettings.pixelRatio),
      shadows: nextSettings.shadows,
    });
    if (ownsRenderer && mount) {
      mount.insertBefore(nextRenderer.domElement, mount.firstChild);
    } else if (ownsRenderer && typeof document !== 'undefined') {
      document.body.insertBefore(nextRenderer.domElement, document.body.firstChild);
    }

    if (world?.multiplayer && (world.id === 'drift' || world.generated)) {
      throw new Error('Drift cannot host multiplayer');
    }
    const resolvedWorld = world?.id === 'drift' || world?.generated
      ? openDrift({ seed: pose?.seed, depth: pose?.depth ?? 0, kitId: pose?.kitId })
      : world;
    const controller = loadWorld(resolvedWorld, catalog, nextCamera, nextRenderer);
    if (typeof document !== 'undefined') {
      import('three').then(({ TextureLoader }) => {
        hydrateRoomMaterials(controller.rooms, {
          loader: new TextureLoader(),
          anisotropy: nextSettings.anisotropy ?? 4,
        });
      }).catch(() => {});
    }
    controller.drift = resolvedWorld?.id === 'drift'
      ? {
        seed: resolvedWorld.seed,
        depth: resolvedWorld.depth ?? 0,
        origins: resolvedWorld.originPool ?? createOriginPool(),
        recent: resolvedWorld.recent ?? [],
        seq: 0,
      }
      : null;
    if (pose) {
      applyPose({ camera: nextCamera, controller }, pose);
    }
    const postAA = ownsRenderer ? new PostAA(nextRenderer) : stubPostAA();
    const controls = createControls(nextCamera, nextRenderer.domElement);
    controls.pointerSpeed = 0;
    const player = new Player({
      camera: nextCamera,
      eyeHeight: 1,
      moveSpeed: nextSettings.moveSpeed,
      jumpSpeed: nextSettings.jumpSpeed,
    });
    const gadgets = attachGadgets(controller);
    const flashlight = new Flashlight(nextCamera);
    flashlight.applyProfile(nextSettings.profile);
    flashlight.attach(controller.currentRoom?.scene);

    nextSettings.apply({
      camera: nextCamera,
      renderer: nextRenderer,
      controller,
      player,
      postAA,
      controls,
      flashlight,
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
      gadgets,
      flashlight,
      ownsRenderer,
      dispose() {
        disposeSession(this);
      },
    };
  } catch (error) {
    if (ownsRenderer && nextRenderer) {
      nextRenderer.dispose?.();
      nextRenderer.forceContextLoss?.();
      nextRenderer.domElement?.remove?.();
    }
    throw error;
  }
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
  session.flashlight?.detach?.();
  session.gadgets?.dispose?.();

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
  session.gadgets = null;
  session.flashlight = null;
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
