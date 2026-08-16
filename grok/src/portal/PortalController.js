import { Portal } from './Portal.js';

export class PortalController {
  constructor({ camera, renderer }) {
    this.camera = camera;
    this.renderer = renderer;
    this.renderer.autoClear = false;

    this._nameToSceneMap = {};
    this._sceneNameToPortalsMap = {};
    this._allPortals = [];
    this._currentScene = null;
    this._currentScenePortals = [];
  }

  get currentScene() {
    return this._currentScene;
  }

  get currentScenePortals() {
    return this._currentScenePortals;
  }

  get allPortals() {
    return this._allPortals;
  }

  registerScene(name, scene) {
    scene.name = name;
    this._nameToSceneMap[name] = scene;
    this._sceneNameToPortalsMap[name] = [];
  }

  createPortal(width, height, sceneName) {
    const portal = new Portal(width, height);

    if (sceneName) {
      this.addPortalToScene(sceneName, portal);
    }

    return portal;
  }

  addPortalToScene(sceneOrName, portal) {
    const scene = typeof sceneOrName === 'string' ? this._nameToSceneMap[sceneOrName] : sceneOrName;

    if (!scene || !this._sceneNameToPortalsMap[scene.name]) {
      throw new Error(`Unknown portal scene: ${sceneOrName}`);
    }

    portal.setScene(scene);
    this._sceneNameToPortalsMap[scene.name].push(portal);
    this._allPortals.push(portal);
  }

  setCurrentScene(name) {
    const scene = this._nameToSceneMap[name];

    if (!scene) {
      throw new Error(`Unknown portal scene: ${name}`);
    }

    this._currentScene = scene;
    this._currentScenePortals = this._sceneNameToPortalsMap[name];
  }

  setCameraPosition(x = 0, y = 0, z = 0) {
    this.camera.position.set(x, y, z);
  }

  setSize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    for (const portal of this._allPortals) {
      portal.setVolumeFromCamera(this.camera);
    }

    this.renderer.setSize(width, height);
  }
}
