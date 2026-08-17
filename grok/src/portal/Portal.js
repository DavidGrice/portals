import { AlwaysDepth, FrontSide, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { PortalGeometry } from './PortalGeometry.js';

const localEye = new Vector3();

function frontMaterial() {
  return new MeshBasicMaterial({
    colorWrite: false,
    side: FrontSide,
    depthWrite: true,
    depthTest: true,
    depthFunc: AlwaysDepth,
  });
}

function volumeMaterial() {
  return new MeshBasicMaterial({
    colorWrite: false,
    side: FrontSide,
    depthWrite: false,
    depthTest: false,
    visible: false,
  });
}

export class Portal extends Mesh {
  constructor(width, height, { id = null } = {}) {
    super(new PortalGeometry(width, height), [frontMaterial(), volumeMaterial()]);

    this.type = 'Portal';
    this.portalId = id;
    this.destinationId = null;
    // Logical room this portal belongs to, not Object3D.parent.
    this.scene = null;
    this.destinationPortal = null;
  }

  get volumeMaterial() {
    return this.material[1];
  }

  setVolumeFromCamera(camera) {
    this.geometry.setVolume(camera.fov, camera.aspect, camera.near);
  }

  setVolumeVisible(visible) {
    this.volumeMaterial.visible = visible;
  }

  updateVolumeVisibility(camera) {
    localEye.setFromMatrixPosition(camera.matrixWorld);
    this.worldToLocal(localEye);
    const dz = this.geometry.volumeDepth;
    const near = Math.max(camera.near, this.geometry.frontZ);
    const inside =
      localEye.z < near &&
      localEye.z > -dz &&
      Math.abs(localEye.x) <= this.geometry.halfWidth + 0.25 &&
      Math.abs(localEye.y) <= this.geometry.halfHeight + 0.25;
    this.setVolumeVisible(inside);
  }

  setScene(scene) {
    this.scene = scene;
  }

  setDestinationPortal(portal) {
    this.destinationPortal = portal;
    this.destinationId = portal?.portalId ?? null;
  }
}
