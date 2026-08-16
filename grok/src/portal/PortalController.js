import { BackSide, Matrix4, Plane, Quaternion, Scene, Vector3, Vector4 } from 'three';
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
const localPrev = new Vector3();
const localCurr = new Vector3();
const portalWorldPos = new Vector3();
const teleportPos = new Vector3();
const teleportQuat = new Quaternion();
const teleportScale = new Vector3();
const cameraWorldPos = new Vector3();
const localCamera = new Vector3();

const CROSS_Z = 0.08;
const FACING_DOT = -0.2;

function sign(value) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

export class PortalController {
  constructor({ camera, renderer, maxRecursion = 4 }) {
    this.camera = camera;
    this.renderer = renderer;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x2a3344, 1);
    this.maxRecursion = maxRecursion;

    this._stencilScene = new Scene();
    this._nameToSceneMap = {};
    this._sceneNameToPortalsMap = {};
    this._allPortals = [];
    this._currentScene = null;
    this._currentScenePortals = [];
    this._lastCameraPosition = new Vector3();
    this._hasLastPosition = false;
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
    this._syncClearColor();
  }

  setCameraPosition(x = 0, y = 0, z = 0) {
    this.camera.position.set(x, y, z);
    this._lastCameraPosition.copy(this.camera.position);
    this._hasLastPosition = true;
  }

  update() {
    const camera = this.camera;
    camera.updateMatrixWorld();

    for (const portal of this._allPortals) {
      portal.updateMatrixWorld(true);
    }

    if (!this._hasLastPosition) {
      this._lastCameraPosition.copy(camera.position);
      this._hasLastPosition = true;
      return;
    }

    let crossed = null;

    for (const portal of this._currentScenePortals) {
      this._updateVolumeFaces(portal, camera.position);

      if (!crossed && portal.destinationPortal?.scene && this._crossedPortal(portal, camera.position)) {
        crossed = portal;
      }
    }

    if (crossed) {
      this.teleport(crossed);
    } else {
      this._lastCameraPosition.copy(camera.position);
    }
  }

  teleport(portal) {
    this.camera.updateMatrixWorld();
    this.computePortalViewMatrix(portal).decompose(teleportPos, teleportQuat, teleportScale);
    this.camera.position.copy(teleportPos);
    this.camera.quaternion.copy(teleportQuat);
    this.camera.updateMatrixWorld();
    this.setCurrentScene(portal.destinationPortal.scene.name);
    this._lastCameraPosition.copy(this.camera.position);
    this._hasLastPosition = true;
    this._updateVolumeFaces(portal.destinationPortal, this.camera.position);
  }

  _updateVolumeFaces(portal, worldPosition) {
    const distance = worldPosition.distanceTo(portal.getWorldPosition(portalWorldPos));
    localCamera.copy(worldPosition);
    portal.worldToLocal(localCamera);
    const near = Math.max(portal.geometry.width, portal.geometry.height) * 1.5;
    portal.toggleVolumeFaces(distance < near || Math.abs(localCamera.z) < 1);
  }

  _crossedPortal(portal, currentPosition) {
    localPrev.copy(this._lastCameraPosition);
    localCurr.copy(currentPosition);
    portal.worldToLocal(localPrev);
    portal.worldToLocal(localCurr);

    if (localPrev.z <= CROSS_Z || localCurr.z > CROSS_Z) {
      return false;
    }

    const span = localPrev.z - localCurr.z;
    const t = (localPrev.z - CROSS_Z) / span;
    const x = localPrev.x + (localCurr.x - localPrev.x) * t;
    const y = localPrev.y + (localCurr.y - localPrev.y) * t;

    return Math.abs(x) <= portal.geometry.halfWidth && Math.abs(y) <= portal.geometry.halfHeight;
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
    this.camera.updateMatrixWorld();
    this.renderer.clear(true, true, true);
    this._renderLevel(this._currentScene, this._currentScenePortals, 0, this.maxRecursion);
  }

  _renderLevel(scene, portals, level, maxDepth) {
    const { renderer, camera } = this;
    const gl = renderer.getContext();
    const { color, depth, stencil } = renderer.state.buffers;
    const savedWorld = camera.matrixWorld.clone();
    const savedWorldInverse = camera.matrixWorldInverse.clone();
    const savedProjection = camera.projectionMatrix.clone();
    const savedProjectionInverse = camera.projectionMatrixInverse.clone();

    stencil.setTest(true);
    stencil.setMask(0xff);

    if (level >= maxDepth) {
      color.setMask(true);
      depth.setMask(true);
      depth.setTest(true);
      stencil.setFunc(gl.EQUAL, level, 0xff);
      stencil.setOp(gl.KEEP, gl.KEEP, gl.KEEP);
      stencil.setLocked(true);
      renderer.render(scene, camera);
      stencil.setLocked(false);
      return;
    }

    for (const portal of portals) {
      const destination = portal.destinationPortal;

      if (!destination?.scene || !this._isPortalFacingCamera(portal)) {
        continue;
      }

      this._showPortals([portal]);

      color.setMask(false);
      color.setLocked(true);
      depth.setMask(false);
      depth.setLocked(true);
      depth.setTest(false);
      // Fail where stencil == level, then increment (Tartu recursive stencil).
      stencil.setFunc(gl.NOTEQUAL, level, 0xff);
      stencil.setOp(gl.INCR, gl.KEEP, gl.KEEP);
      stencil.setLocked(true);
      renderer.render(this._stencilScene, camera);
      stencil.setLocked(false);
      color.setLocked(false);
      depth.setLocked(false);
      depth.setTest(true);

      camera.matrixAutoUpdate = false;
      camera.matrixWorld.copy(this.computePortalViewMatrix(portal));
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      camera.projectionMatrix.copy(this.computePortalProjectionMatrix(destination));
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      const destPortals = this._sceneNameToPortalsMap[destination.scene.name] || [];
      this._renderLevel(destination.scene, destPortals, level + 1, maxDepth);

      color.setMask(false);
      color.setLocked(true);
      depth.setMask(false);
      depth.setLocked(true);
      depth.setTest(false);
      stencil.setFunc(gl.NOTEQUAL, level + 1, 0xff);
      stencil.setOp(gl.DECR, gl.KEEP, gl.KEEP);
      stencil.setLocked(true);

      camera.matrixWorld.copy(savedWorld);
      camera.matrixWorldInverse.copy(savedWorldInverse);
      camera.projectionMatrix.copy(savedProjection);
      camera.projectionMatrixInverse.copy(savedProjectionInverse);

      this._showPortals([portal]);
      renderer.render(this._stencilScene, camera);
      stencil.setLocked(false);
      color.setLocked(false);
      depth.setLocked(false);
      depth.setTest(true);
      camera.matrixAutoUpdate = true;
    }

    camera.matrixWorld.copy(savedWorld);
    camera.matrixWorldInverse.copy(savedWorldInverse);
    camera.projectionMatrix.copy(savedProjection);
    camera.projectionMatrixInverse.copy(savedProjectionInverse);
    camera.matrixAutoUpdate = true;

    renderer.clear(false, true, false);

    this._showPortals(portals);
    color.setMask(false);
    color.setLocked(true);
    depth.setMask(true);
    stencil.setFunc(gl.LEQUAL, level, 0xff);
    stencil.setOp(gl.KEEP, gl.KEEP, gl.KEEP);
    stencil.setLocked(true);
    renderer.render(this._stencilScene, camera);
    color.setLocked(false);
    color.setMask(true);
    renderer.render(scene, camera);
    stencil.setLocked(false);

    if (level === 0) {
      stencil.setTest(false);
    }
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

  _isPortalFacingCamera(portal) {
    portal.updateMatrixWorld(true);
    cameraWorldPos.setFromMatrixPosition(this.camera.matrixWorld);
    portalWorldPos.setFromMatrixPosition(portal.matrixWorld);
    planeNormal.set(0, 0, 1).transformDirection(portal.matrixWorld);
    return cameraWorldPos.sub(portalWorldPos).dot(planeNormal) > FACING_DOT;
  }

  _syncClearColor() {
    const sky = this._currentScene?.children.find(
      (child) => child.geometry?.type === 'SphereGeometry' && child.material?.side === BackSide,
    );
    const color = sky?.material?.color;

    if (color) {
      this.renderer.setClearColor(color, 1);
    }
  }

  _showPortals(portals) {
    const visible = new Set(portals);

    for (const child of this._stencilScene.children) {
      child.visible = visible.has(child);
    }
  }
}
