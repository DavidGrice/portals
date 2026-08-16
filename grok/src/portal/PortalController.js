import { Matrix4, Plane, Scene, Vector3, Vector4 } from 'three';
import { Portal } from './Portal.js';

const rotationY180 = new Matrix4().makeRotationY(Math.PI);
const srcToCam = new Matrix4();
const dstInverse = new Matrix4();
const srcToDst = new Matrix4();
const viewMatrix = new Matrix4();
const dstRotation = new Matrix4();
const clipPlane = new Plane();
const clipVector = new Vector4();
const q = new Vector4();
const obliqueProjection = new Matrix4();
const dstWorldPos = new Vector3();
const planeNormal = new Vector3();
const savedWorld = new Matrix4();
const savedProjection = new Matrix4();

function sign(value) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

export class PortalController {
  constructor({ camera, renderer }) {
    this.camera = camera;
    this.renderer = renderer;
    this.renderer.autoClear = false;

    this._stencilScene = new Scene();
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
    this._stencilScene.add(portal);
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

  render() {
    const { renderer, camera } = this;
    const gl = renderer.getContext();
    const { color, depth, stencil } = renderer.state.buffers;

    camera.updateMatrixWorld();
    savedWorld.copy(camera.matrixWorld);
    savedProjection.copy(camera.projectionMatrix);

    renderer.clear(true, true, true);

    stencil.setTest(true);
    stencil.setMask(0xff);

    for (const portal of this._currentScenePortals) {
      const destination = portal.destinationPortal;

      if (!destination?.scene) {
        continue;
      }

      this._showPortals([portal]);

      color.setMask(false);
      color.setLocked(true);
      depth.setMask(false);
      depth.setLocked(true);
      stencil.setFunc(gl.NEVER, 1, 0xff);
      stencil.setOp(gl.REPLACE, gl.KEEP, gl.KEEP);
      stencil.setLocked(true);
      renderer.render(this._stencilScene, camera);
      stencil.setLocked(false);
      color.setLocked(false);
      depth.setLocked(false);

      color.setMask(true);
      depth.setMask(true);
      stencil.setFunc(gl.EQUAL, 1, 0xff);
      stencil.setOp(gl.KEEP, gl.KEEP, gl.KEEP);
      stencil.setLocked(true);

      camera.matrixAutoUpdate = false;
      camera.matrixWorld.copy(this.computePortalViewMatrix(portal));
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      camera.projectionMatrix.copy(this.computePortalProjectionMatrix(destination));
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      renderer.render(destination.scene, camera);

      stencil.setLocked(false);
      renderer.clear(false, false, true);

      camera.matrixWorld.copy(savedWorld);
      camera.matrixWorldInverse.copy(savedWorld).invert();
      camera.projectionMatrix.copy(savedProjection);
      camera.projectionMatrixInverse.copy(savedProjection).invert();
      camera.matrixAutoUpdate = true;
    }

    stencil.setTest(false);
    renderer.clear(false, true, false);

    this._showPortals(this._currentScenePortals);
    color.setMask(false);
    color.setLocked(true);
    renderer.render(this._stencilScene, camera);
    color.setLocked(false);
    color.setMask(true);

    renderer.render(this._currentScene, camera);
  }

  computePortalViewMatrix(portal) {
    const src = portal;
    const dst = portal.destinationPortal;

    src.updateMatrixWorld(true);
    dst.updateMatrixWorld(true);

    srcToCam.multiplyMatrices(this.camera.matrixWorldInverse, src.matrixWorld);
    dstInverse.copy(dst.matrixWorld).invert();
    srcToDst.multiplyMatrices(srcToCam, rotationY180).multiply(dstInverse);
    viewMatrix.copy(srcToDst).invert();

    return viewMatrix;
  }

  computePortalProjectionMatrix(destination) {
    destination.updateMatrixWorld(true);
    dstRotation.extractRotation(destination.matrixWorld);
    planeNormal.set(0, 0, 1).applyMatrix4(dstRotation);
    dstWorldPos.setFromMatrixPosition(destination.matrixWorld);
    clipPlane.setFromNormalAndCoplanarPoint(planeNormal, dstWorldPos);
    clipPlane.applyMatrix4(this.camera.matrixWorldInverse);

    clipVector.set(clipPlane.normal.x, clipPlane.normal.y, clipPlane.normal.z, clipPlane.constant);
    obliqueProjection.copy(this.camera.projectionMatrix);

    q.x = (sign(clipVector.x) + obliqueProjection.elements[8]) / obliqueProjection.elements[0];
    q.y = (sign(clipVector.y) + obliqueProjection.elements[9]) / obliqueProjection.elements[5];
    q.z = -1;
    q.w = (1 + obliqueProjection.elements[10]) / this.camera.projectionMatrix.elements[14];

    clipVector.multiplyScalar(2 / clipVector.dot(q));
    obliqueProjection.elements[2] = clipVector.x;
    obliqueProjection.elements[6] = clipVector.y;
    obliqueProjection.elements[10] = clipVector.z + 1;
    obliqueProjection.elements[14] = clipVector.w;

    return obliqueProjection;
  }

  _showPortals(portals) {
    const visible = new Set(portals);

    for (const child of this._stencilScene.children) {
      child.visible = visible.has(child);
    }
  }
}
