import { Euler, Matrix4, PerspectiveCamera, Plane, Quaternion, Scene, Vector3 } from 'three';
import { Portal } from './Portal.js';
import { Room } from './Room.js';
import { Emitter } from '../engine/Emitter.js';

const rotationY180 = new Matrix4().makeRotationY(Math.PI);
const srcToCam = new Matrix4();
const dstInverse = new Matrix4();
const srcToDst = new Matrix4();
const viewMatrix = new Matrix4();
const clipPlane = new Plane();
const dstWorldPos = new Vector3();
const planeNormal = new Vector3();
const localPrev = new Vector3();
const localCurr = new Vector3();
const portalWorldPos = new Vector3();
const teleportPos = new Vector3();
const teleportQuat = new Quaternion();
const teleportScale = new Vector3();
const cameraWorldPos = new Vector3();
const poseEuler = new Euler(0, 0, 0, 'YXZ');
const matrixStack = Array.from({ length: 8 }, () => ({
  world: new Matrix4(),
  worldInverse: new Matrix4(),
}));

const EMERGE_Z = 0.18;
const FACING_DOT = 0.05;
const WALK_UP_MIN = 0.08;
const CLIP_OFFSET = 0.06;
const MIN_DEST_VIEW_Z = 0.35;
const IGNORE_CLEAR_Z = 0.45;

export class PortalController {
  constructor({ camera, renderer, maxRecursion = 4 }) {
    this.camera = camera;
    this.renderer = renderer;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x2a3344, 1);
    if (!this.renderer.clippingPlanes) {
      this.renderer.clippingPlanes = [];
    }
    this.maxRecursion = maxRecursion;

    this._stencilScene = new Scene();
    this._stencilSlot = [];
    this._stencilScene.children = this._stencilSlot;
    this._portalCamera = new PerspectiveCamera();
    this._portalCamera.matrixAutoUpdate = false;
    this._portalCamera.matrixWorldAutoUpdate = false;
    this._copyCameraOptics(this._portalCamera);
    this._rooms = new Map();
    this._portalsById = new Map();
    this._allPortals = [];
    this._currentRoom = null;
    this._currentScene = null;
    this._currentScenePortals = [];
    this._lastCameraPosition = new Vector3();
    this._lastCameraWorld = new Matrix4();
    this._hasLastPosition = false;
    this._ignorePortalId = null;
    this._events = new Emitter();
    this.lastDrawInfo = { drawn: [], skipped: [], destCam: null, clip: 'none' };
  }

  on(type, handler) {
    return this._events.on(type, handler);
  }

  off(type, handler) {
    this._events.off(type, handler);
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

  get rooms() {
    return [...this._rooms.values()];
  }

  registerScene(name, scene, { clearColor = 0x000000, tags = [], spawn = null } = {}) {
    const room = new Room({ id: name, scene, clearColor, tags, spawn });
    this._rooms.set(name, room);
    return room;
  }

  createPortal(width, height, sceneName, { id = null } = {}) {
    const portal = new Portal(width, height, { id });

    if (id) {
      this._portalsById.set(id, portal);
    }

    if (sceneName) {
      this.addPortalToScene(sceneName, portal);
    }

    return portal;
  }

  getPortal(id) {
    return this._portalsById.get(id) ?? null;
  }

  addPortalToScene(sceneOrName, portal) {
    const room = this._getRoom(sceneOrName);

    if (!room) {
      throw new Error(`Unknown portal room: ${sceneOrName}`);
    }

    portal.setScene(room.scene);
    room.portals.push(portal);
    this._allPortals.push(portal);
  }

  setCurrentScene(name) {
    const room = this._rooms.get(name);

    if (!room) {
      throw new Error(`Unknown portal room: ${name}`);
    }

    const previous = this._currentRoom;
    if (previous?.id === room.id) {
      return;
    }

    if (previous) {
      this._events.emit('room:leave', { room: previous, roomId: previous.id });
    }

    this._currentRoom = room;
    this._currentScene = room.scene;
    this._currentScenePortals = room.portals;
    this._events.emit('room:enter', { room, roomId: room.id });
  }

  setCameraPosition(x = 0, y = 0, z = 0) {
    this.camera.position.set(x, y, z);
    this.camera.updateMatrixWorld();
    this._rememberCameraPose();
  }

  update() {
    const camera = this.camera;
    camera.updateMatrixWorld();

    for (const portal of this._allPortals) {
      portal.updateMatrixWorld(true);
    }

    if (!this._hasLastPosition) {
      this._rememberCameraPose();
      return;
    }

    this._clearIgnoreIfAway();

    let crossed = null;

    for (const portal of this._currentScenePortals) {
      if (!crossed && this._canTraverse(portal) && this._crossedPortal(portal, camera.position)) {
        crossed = portal;
      }
    }

    if (crossed) {
      this.teleport(crossed);
    } else {
      this._rememberCameraPose();
    }
  }

  _rememberCameraPose() {
    this.camera.updateMatrixWorld();
    this._lastCameraPosition.copy(this.camera.position);
    this._lastCameraWorld.copy(this.camera.matrixWorld);
    this._hasLastPosition = true;
  }

  teleport(portal) {
    // Dest view from the last pose still on the approach side. After the
    // plane crossing the current pose looks back at the dest door.
    this.camera.matrixWorld.copy(this._lastCameraWorld);
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this.computePortalViewMatrix(portal, this.camera).decompose(teleportPos, teleportQuat, teleportScale);
    this._applyCameraPose(teleportPos, teleportQuat);
    this._settleInDestHall(portal.destinationPortal);
    const fromId = this._currentRoom?.id ?? null;
    const toId = this._getRoom(portal.destinationPortal.scene)?.id ?? portal.destinationPortal.scene.name;
    this.setCurrentScene(toId);
    this._ignorePortalId = portal.destinationPortal?.portalId ?? null;
    this._rememberCameraPose();
    this._events.emit('portal:cross', {
      portal,
      portalId: portal.portalId,
      from: fromId,
      to: toId,
    });
  }

  _applyCameraPose(position, quaternion) {
    this.camera.position.copy(position);
    poseEuler.setFromQuaternion(quaternion);
    this.camera.quaternion.setFromEuler(poseEuler);
    this.camera.updateMatrixWorld();
  }

  _crossedPortal(portal, currentPosition) {
    localPrev.copy(this._lastCameraPosition);
    localCurr.copy(currentPosition);
    portal.worldToLocal(localPrev);
    portal.worldToLocal(localCurr);

    if (localPrev.z * localCurr.z > 0) {
      return false;
    }
    const span = localPrev.z - localCurr.z;
    if (span === 0) {
      return false;
    }

    const t = localPrev.z / span;
    const x = localPrev.x + (localCurr.x - localPrev.x) * t;
    const y = localPrev.y + (localCurr.y - localPrev.y) * t;

    return Math.abs(x) <= portal.geometry.halfWidth && Math.abs(y) <= portal.geometry.halfHeight;
  }

  _settleInDestHall(destination) {
    destination.updateMatrixWorld(true);
    localCurr.copy(this.camera.position);
    destination.worldToLocal(localCurr);
    if (localCurr.z >= EMERGE_Z) {
      return;
    }
    localCurr.z = EMERGE_Z;
    destination.localToWorld(localCurr);
    this.camera.position.copy(localCurr);
    this.camera.updateMatrixWorld();
  }

  _canTraverse(portal) {
    if (!portal.enabled || !portal.destinationPortal?.scene) {
      return false;
    }
    if (portal.oneWay) {
      localPrev.copy(this._lastCameraPosition);
      portal.worldToLocal(localPrev);
      if (localPrev.z <= 0) {
        return false;
      }
    }
    return true;
  }

  _shouldDrawPortal(portal, skipReturnId, viewCamera = this.camera) {
    const destination = portal.destinationPortal;
    if (!portal.enabled || !destination?.scene) {
      return false;
    }
    if (destination.portalId === skipReturnId) {
      return false;
    }
    if (portal.portalId && portal.portalId === this._ignorePortalId) {
      return false;
    }
    if (!this._isPortalFacingCamera(portal, viewCamera)) {
      return false;
    }
    if (!this._isPortalInFrontOfCamera(portal, viewCamera)) {
      return false;
    }
    return true;
  }

  _clearIgnoreIfAway() {
    if (!this._ignorePortalId) {
      return;
    }
    const ignored = this.getPortal(this._ignorePortalId);
    if (!ignored) {
      this._ignorePortalId = null;
      return;
    }
    localCurr.copy(this.camera.position);
    ignored.worldToLocal(localCurr);
    if (Math.abs(localCurr.z) > IGNORE_CLEAR_Z) {
      this._ignorePortalId = null;
    }
  }

  _isPortalInFrontOfCamera(portal, viewCamera = this.camera) {
    portalWorldPos.setFromMatrixPosition(portal.matrixWorld);
    portalWorldPos.applyMatrix4(viewCamera.matrixWorldInverse);
    return portalWorldPos.z < 0;
  }

  _stabilizeDestCamera(destCamera, destination) {
    destCamera.matrixWorld.decompose(teleportPos, teleportQuat, teleportScale);
    localCurr.copy(teleportPos);
    destination.updateMatrixWorld(true);
    destination.worldToLocal(localCurr);
    if (Math.abs(localCurr.z) >= MIN_DEST_VIEW_Z) {
      destCamera.matrixWorldInverse.copy(destCamera.matrixWorld).invert();
      return;
    }
    localCurr.z = localCurr.z < 0 ? -MIN_DEST_VIEW_Z : MIN_DEST_VIEW_Z;
    destination.localToWorld(localCurr);
    destCamera.matrixWorld.compose(localCurr, teleportQuat, teleportScale.set(1, 1, 1));
    destCamera.matrixWorldInverse.copy(destCamera.matrixWorld).invert();
  }

  setSize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this._copyCameraOptics(this._portalCamera);

    for (const portal of this._allPortals) {
      portal.setVolumeFromCamera(this.camera);
    }

    this.renderer.setSize(width, height);
  }

  render() {
    this.camera.updateMatrixWorld();
    if (this._currentRoom) {
      this.renderer.setClearColor(this._currentRoom.clearColor, 1);
    }
    this.lastDrawInfo.drawn.length = 0;
    this.lastDrawInfo.skipped.length = 0;
    this.lastDrawInfo.destCam = null;
    this.lastDrawInfo.clip = 'none';
    this.renderer.clear(true, true, true);
    this._renderLevel(this._currentScene, this._currentScenePortals, 0, this.maxRecursion, null, null, this.camera, null);
    this._bindStencil([]);
  }

  _renderLevel(scene, portals, level, maxDepth, hideFrameForPortalId, skipReturnId, viewCamera, destClipPlane) {
    const { renderer } = this;
    const camera = viewCamera;
    const gl = renderer.getContext();
    const { color, depth, stencil } = renderer.state.buffers;
    const saved = matrixStack[level];
    saved.world.copy(camera.matrixWorld);
    saved.worldInverse.copy(camera.matrixWorldInverse);

    stencil.setTest(true);
    stencil.setMask(0xff);

    if (level >= maxDepth) {
      color.setMask(true);
      depth.setMask(true);
      depth.setTest(true);
      stencil.setFunc(gl.EQUAL, level, 0xff);
      stencil.setOp(gl.KEEP, gl.KEEP, gl.KEEP);
      stencil.setLocked(true);
      this._renderRoom(scene, hideFrameForPortalId, camera, destClipPlane);
      stencil.setLocked(false);
      return;
    }

    const drawn = [];

    for (const portal of portals) {
      if (!this._shouldDrawPortal(portal, skipReturnId, camera)) {
        if (level === 0) {
          this.lastDrawInfo.skipped.push(portal.portalId ?? '?');
        }
        continue;
      }

      drawn.push(portal);
      if (level === 0) {
        this.lastDrawInfo.drawn.push(portal.portalId ?? '?');
      }
      const destination = portal.destinationPortal;

      color.setMask(false);
      color.setLocked(true);
      depth.setMask(false);
      depth.setLocked(true);
      depth.setTest(false);
      stencil.setFunc(gl.NOTEQUAL, level, 0xff);
      stencil.setOp(gl.INCR, gl.KEEP, gl.KEEP);
      stencil.setLocked(true);
      this._bindStencil([portal], { allowVolume: true, camera });
      renderer.render(this._stencilScene, camera);
      stencil.setLocked(false);
      color.setLocked(false);
      depth.setLocked(false);
      depth.setTest(true);

      const destCamera = this._portalCamera;
      this._copyCameraOptics(destCamera);
      destCamera.matrixWorld.copy(this.computePortalViewMatrix(portal, camera));
      this._stabilizeDestCamera(destCamera, destination);
      const nextClip = this.buildDestClipPlane(destination, destCamera);
      if (level === 0) {
        destCamera.matrixWorld.decompose(teleportPos, teleportQuat, teleportScale);
        this.lastDrawInfo.destCam = `${teleportPos.x.toFixed(2)},${teleportPos.y.toFixed(2)},${teleportPos.z.toFixed(2)}`;
        this.lastDrawInfo.clip = 'plane';
      }

      const destPortals = this._getRoom(destination.scene.name)?.portals || [];
      this._renderLevel(
        destination.scene,
        destPortals,
        level + 1,
        maxDepth,
        destination.portalId,
        portal.portalId,
        destCamera,
        nextClip,
      );

      camera.matrixWorld.copy(saved.world);
      camera.matrixWorldInverse.copy(saved.worldInverse);

      color.setMask(false);
      color.setLocked(true);
      depth.setMask(false);
      depth.setLocked(true);
      depth.setTest(false);
      stencil.setFunc(gl.NOTEQUAL, level + 1, 0xff);
      stencil.setOp(gl.DECR, gl.KEEP, gl.KEEP);
      stencil.setLocked(true);
      this._bindStencil([portal], { allowVolume: true, camera });
      renderer.render(this._stencilScene, camera);
      stencil.setLocked(false);
      color.setLocked(false);
      depth.setLocked(false);
      depth.setTest(true);
    }

    camera.matrixWorld.copy(saved.world);
    camera.matrixWorldInverse.copy(saved.worldInverse);

    renderer.clear(false, true, false);

    color.setMask(false);
    color.setLocked(true);
    depth.setMask(true);
    stencil.setFunc(gl.LEQUAL, level, 0xff);
    stencil.setOp(gl.KEEP, gl.KEEP, gl.KEEP);
    stencil.setLocked(true);
    this._bindStencil(drawn, { allowVolume: false, camera });
    renderer.render(this._stencilScene, camera);
    color.setLocked(false);
    color.setMask(true);
    this._renderRoom(scene, hideFrameForPortalId, camera, destClipPlane);
    stencil.setLocked(false);

    if (level === 0) {
      stencil.setTest(false);
    }
  }

  _copyCameraOptics(destCamera) {
    destCamera.fov = this.camera.fov;
    destCamera.aspect = this.camera.aspect;
    destCamera.near = this.camera.near;
    destCamera.far = this.camera.far;
    destCamera.updateProjectionMatrix();
  }

  computePortalViewMatrix(portal, sourceCamera = this.camera) {
    const src = portal;
    const dst = portal.destinationPortal;

    src.updateMatrixWorld(true);
    dst.updateMatrixWorld(true);

    srcToCam.multiplyMatrices(sourceCamera.matrixWorldInverse, src.matrixWorld);
    dstInverse.copy(dst.matrixWorld).invert();
    srcToDst.multiplyMatrices(srcToCam, rotationY180).multiply(dstInverse);
    viewMatrix.copy(srcToDst).invert();

    return viewMatrix;
  }

  buildDestClipPlane(destination, destCamera) {
    destination.updateMatrixWorld(true);
    planeNormal.set(0, 0, 1).transformDirection(destination.matrixWorld);
    dstWorldPos.setFromMatrixPosition(destination.matrixWorld).addScaledVector(planeNormal, CLIP_OFFSET);
    clipPlane.setFromNormalAndCoplanarPoint(planeNormal, dstWorldPos);
    cameraWorldPos.setFromMatrixPosition(destCamera.matrixWorld);
    // Three.js clips the negative half-space. Dest +Z is the hall (keep);
    // dest -Z is behind the door toward dest camera (clip).
    if (clipPlane.distanceToPoint(cameraWorldPos) > 0) {
      clipPlane.negate();
    }
    return clipPlane.clone();
  }

  _renderRoom(scene, hideFrameForPortalId, viewCamera = this.camera, destClipPlane = null) {
    if (hideFrameForPortalId) {
      this._setPortalFramesVisible(scene, false, hideFrameForPortalId);
    }

    const previousPlanes = this.renderer.clippingPlanes;
    const culled = [];
    if (destClipPlane) {
      this.renderer.clippingPlanes = [destClipPlane];
      scene.traverse((object) => {
        culled.push([object, object.frustumCulled]);
        object.frustumCulled = false;
      });
    }

    this.renderer.render(scene, viewCamera);

    if (destClipPlane) {
      this.renderer.clippingPlanes = previousPlanes ?? [];
      for (const [object, value] of culled) {
        object.frustumCulled = value;
      }
    }

    if (hideFrameForPortalId) {
      this._setPortalFramesVisible(scene, true, hideFrameForPortalId);
    }
  }

  _setPortalFramesVisible(scene, visible, onlyPortalId = null) {
    scene.traverse((object) => {
      if (!object.userData.portalFrame) {
        return;
      }
      if (onlyPortalId && object.userData.coversPortalId !== onlyPortalId) {
        return;
      }
      object.visible = visible;
    });
  }

  _isPortalFacingCamera(portal, viewCamera = this.camera) {
    portal.updateMatrixWorld(true);
    cameraWorldPos.setFromMatrixPosition(viewCamera.matrixWorld);
    portalWorldPos.setFromMatrixPosition(portal.matrixWorld);
    planeNormal.set(0, 0, 1).transformDirection(portal.matrixWorld);
    if (cameraWorldPos.sub(portalWorldPos).dot(planeNormal) < FACING_DOT) {
      return false;
    }
    localCurr.setFromMatrixPosition(viewCamera.matrixWorld);
    portal.worldToLocal(localCurr);
    return localCurr.z > WALK_UP_MIN;
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

  _bindStencil(portals, { allowVolume = false, camera = this.camera } = {}) {
    this._stencilSlot.length = 0;
    for (const portal of portals) {
      if (allowVolume) {
        portal.updateVolumeVisibility(camera);
      } else {
        portal.setVolumeVisible(false);
      }
      portal.parent = this._stencilScene;
      this._stencilSlot.push(portal);
    }
  }
}
