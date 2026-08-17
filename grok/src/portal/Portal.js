import { DoubleSide, Mesh, MeshBasicMaterial } from 'three';
import { PortalGeometry } from './PortalGeometry.js';

export class Portal extends Mesh {
  constructor(width, height, { id = null } = {}) {
    super(
      new PortalGeometry(width, height),
      new MeshBasicMaterial({ colorWrite: false, side: DoubleSide }),
    );

    this.type = 'Portal';
    this.portalId = id;
    this.destinationId = null;
    // Logical room this portal belongs to, not Object3D.parent.
    this.scene = null;
    this.destinationPortal = null;
  }

  setVolumeFromCamera() {}

  setScene(scene) {
    this.scene = scene;
  }

  setDestinationPortal(portal) {
    this.destinationPortal = portal;
    this.destinationId = portal?.portalId ?? null;
  }
}
