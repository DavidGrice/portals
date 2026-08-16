import { Matrix4, Plane, Quaternion, Scene, Vector3, Vector4 } from 'three';
import { Portal } from './Portal.js';
import { Room } from './Room.js';

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
const matrixStack = Array.from({ length: 8 }, () => ({
  world: new Matrix4(),
  worldInverse: new Matrix4(),
  projection: new Matrix4(),
  projectionInverse: new Matrix4(),
}));

const CROSS_Z = 0.12;
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
    this._rooms = new Map();
    this._allPortals = [];
    this._currentRoom = null;
    this._currentScene = null;
    this._currentScenePortals = [];
    this._lastCameraPosition = new Vector3();
    this._hasLastPosition = false;
  }

  get currentRoom() {
    return this._currentRoom;
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

  registerScene(name, scene, { clearColor = 0x000000, tags = [], spawn = null } = {}) {
    const room = new Room({ id: name, scene, clearColor, tags, spawn });
    this._rooms.set(name, room);
    return room;
  }

  createPortal(width, height, sceneName) {
    const portal = new Portal(width, height);

    if (sceneName) {
      this.addPortalToScene(sceneName, portal);
    }

    return portal;
  }

  addPortalToScene(sceneOrName, portal) {
    const room = this._getRoom(sceneOrName);

    if (!room) {
      throw new Error(`Unknown portal room: ${sceneOrName}`);
    }

    portal.setScene(room.scene);
    this._stencilScene.add(portal);
    room.portals.push(portal);
    this._allPortals.push(portal);
  }

  setCurrentScene(name) {
    const room = this._rooms.get(name);

    if (!room) {
      throw new Error(`Unknown portal room: ${name}`);
    }

    this._currentRoom = room;
    this._currentScene = room.scene;
    this._currentScenePortals = room.portals;
    this.renderer.setClearColor(room.clearColor, 1);
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
    const saved = matrixStack[level];
    saved.world.copy(camera.matrixWorld);
    saved.worldInverse.copy(camera.matrixWorldInverse);
    saved.projection.copy(camera.projectionMatrix);
    saved.projectionInverse.copy(camera.projectionMatrixInverse);

    stencil.setTest(true);
    stencil.setMask(0xff);

    if (level >= maxDepth) {
      color.setMask(true);
      depth.setMask(true);
      depth.setTest(true);
      stencil.setFunc(gl.EQUAL, level, 0xff);
      stencil.setOp(gl.KEEP, gl.KEEP, gl.KEEP);
      stencil.setLocked(true);
      this._renderRoom(scene, level > 0);
      stencil.setLocked(false);
      return;
    }

    for (const portal of portals) {
      const destination = portal.destinationPortal;

      if (!destination?.scene || !this._isPortalFacingCamera(portal)) {
        continue;
      }

      color.setMask(false);
      color.setLocked(true);
      depth.setMask(false);
      depth.setLocked(true);
      depth.setTest(false);
      // Fail where stencil == level, then increment (Tartu recursive stencil).
      stencil.setFunc(gl.NOTEQUAL, level, 0xff);
      stencil.setOp(gl.INCR, gl.KEEP, gl.KEEP);
      stencil.setLocked(true);
      this._showPortals([portal]);
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

      const destPortals = this._getRoom(destination.scene.name)?.portals || [];
      this._renderLevel(destination.scene, destPortals, level + 1, maxDepth);

      color.setMask(false);
      color.setLocked(true);
      depth.setMask(false);
      depth.setLocked(true);
      depth.setTest(false);
      stencil.setFunc(gl.NOTEQUAL, level + 1, 0xff);
      stencil.setOp(gl.DECR, gl.KEEP, gl.KEEP);
      stencil.setLocked(true);

      camera.matrixWorld.copy(saved.world);
      camera.matrixWorldInverse.copy(saved.worldInverse);
      camera.projectionMatrix.copy(saved.projection);
      camera.projectionMatrixInverse.copy(saved.projectionInverse);

      this._showPortals([portal]);
      renderer.render(this._stencilScene, camera);
      stencil.setLocked(false);
      color.setLocked(false);
      depth.setLocked(false);
      depth.setTest(true);
      camera.matrixAutoUpdate = true;
    }

    camera.matrixWorld.copy(saved.world);
    camera.matrixWorldInverse.copy(saved.worldInverse);
    camera.projectionMatrix.copy(saved.projection);
    camera.projectionMatrixInverse.copy(saved.projectionInverse);
    camera.matrixAutoUpdate = true;

    renderer.clear(false, true, false);

    color.setMask(false);
    color.setLocked(true);
    depth.setMask(true);
    stencil.setFunc(gl.LEQUAL, level, 0xff);
    stencil.setOp(gl.KEEP, gl.KEEP, gl.KEEP);
    stencil.setLocked(true);
    this._showPortals(portals);
    renderer.render(this._stencilScene, camera);
    color.setLocked(false);
    color.setMask(true);
    this._renderRoom(scene, level > 0);
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

  _renderRoom(scene, hideFrames) {
    if (hideFrames) {
      this._setPortalFramesVisible(scene, false);
    }

    this.renderer.render(scene, this.camera);

    if (hideFrames) {
      this._setPortalFramesVisible(scene, true);
    }
  }

  _setPortalFramesVisible(scene, visible) {
    scene.traverse((object) => {
      if (object.userData.portalFrame) {
        object.visible = visible;
      }
    });
  }

  _isPortalFacingCamera(portal) {
    portal.updateMatrixWorld(true);
    cameraWorldPos.setFromMatrixPosition(this.camera.matrixWorld);
    portalWorldPos.setFromMatrixPosition(portal.matrixWorld);
    planeNormal.set(0, 0, 1).transformDirection(portal.matrixWorld);
    return cameraWorldPos.sub(portalWorldPos).dot(planeNormal) > FACING_DOT;
  }

  _getRoom(sceneOrName) {
    if (typeof sceneOrName === 'string') {
      return this._rooms.get(sceneOrName) ?? null;
    }

    for (const room of this._rooms.values()) {
      if (room.scene === sceneOrName) {
        return room;
      }
    }

    return null;
  }

  _showPortals(portals) {
    const visible = new Set(portals);

    for (const child of this._stencilScene.children) {
      child.visible = visible.has(child);
    }
  }
}
