import { BufferAttribute, BufferGeometry } from 'three';

const FRONT_Z = 0.01;

// Vertex order and face winding match three.portals-master.
// Groups: 0 = front quad, 1 = back-facing volume (Mini-Portal Smooth).
const INDICES = [
  0, 1, 2,
  1, 3, 2,
  1, 3, 5,
  7, 5, 3,
  3, 6, 7,
  2, 6, 3,
  0, 4, 6,
  0, 6, 2,
  0, 5, 4,
  1, 5, 0,
  4, 5, 6,
  5, 7, 6,
];

export class PortalGeometry extends BufferGeometry {
  constructor(width, height) {
    super();

    this.type = 'PortalGeometry';
    this.width = width;
    this.height = height;
    this.halfWidth = width * 0.5;
    this.halfHeight = height * 0.5;

    this.setAttribute('position', new BufferAttribute(new Float32Array(8 * 3), 3));
    this.setIndex(INDICES);
    this.addGroup(0, 6, 0);
    this.addGroup(6, 30, 1);
  }

  setVolume(fov, aspect, near) {
    // FOV split is copied from the original (vertical fov reused as fovX).
    const fovX = fov * (Math.PI / 180);
    const fovY = fovX / aspect;
    const dz = Math.max(near / Math.cos(fovX), near / Math.cos(fovY));
    const dx = (Math.tan(fovX) * dz) / this.width;
    const dy = (Math.tan(fovY) * dz) / this.height;
    const hx = this.halfWidth;
    const hy = this.halfHeight;

    const p = this.attributes.position.array;

    p[0] = -hx;
    p[1] = -hy;
    p[2] = FRONT_Z;

    p[3] = hx;
    p[4] = -hy;
    p[5] = FRONT_Z;

    p[6] = -hx;
    p[7] = hy;
    p[8] = FRONT_Z;

    p[9] = hx;
    p[10] = hy;
    p[11] = FRONT_Z;

    p[12] = -(1 + dx) * hx;
    p[13] = -(1 + dy) * hy;
    p[14] = -dz;

    p[15] = (1 + dx) * hx;
    p[16] = -(1 + dy) * hy;
    p[17] = -dz;

    p[18] = -(1 + dx) * hx;
    p[19] = (1 + dy) * hy;
    p[20] = -dz;

    p[21] = (1 + dx) * hx;
    p[22] = (1 + dy) * hy;
    p[23] = -dz;

    this.attributes.position.needsUpdate = true;
    this.computeBoundingSphere();
  }
}
