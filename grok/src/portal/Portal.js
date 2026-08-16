import { Mesh, MeshBasicMaterial } from 'three';
import { PortalGeometry } from './PortalGeometry.js';

function createPortalMaterials() {
  return [
    new MeshBasicMaterial(),
    new MeshBasicMaterial({ visible: false }),
  ];
}

export class Portal extends Mesh {
  constructor(width, height) {
    super(new PortalGeometry(width, height), createPortalMaterials());

    this.type = 'Portal';
    this.volumeFacesVisible = false;
    // Logical room this portal belongs to, not Object3D.parent (stencil parent later).
    this.scene = null;
    this.destinationPortal = null;
  }

  setVolumeFromCamera(camera) {
    this.geometry.setVolume(camera.fov, camera.aspect, camera.near);
  }

  toggleVolumeFaces(state) {
    this.volumeFacesVisible = state;
    this.material[1].visible = state;
  }

  setScene(scene) {
    this.scene = scene;
  }

  setDestinationPortal(portal) {
    this.destinationPortal = portal;
  }
}
