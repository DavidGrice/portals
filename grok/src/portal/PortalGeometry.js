import { BufferAttribute, BufferGeometry } from 'three';

// Front: two CCW tris from +Z (walk-up). Volume: inward faces so FrontSide
// is culled from the hall and only covers the screen from inside the slab.
const FRONT_INDICES = [0, 1, 3, 0, 3, 2];
const VOLUME_INDICES = [1, 3, 5, 7, 5, 3, 3, 6, 7, 2, 6, 3, 0, 4, 6, 0, 6, 2, 0, 5, 4, 1, 5, 0, 4, 5, 6, 5, 7, 6];
const FRONT_Z = 0.01;
export const FRONT_INSET = 0.06;

export class PortalGeometry extends BufferGeometry {
  constructor(width, height) {
    super();

    this.type = 'PortalGeometry';
    this.width = width;
    this.height = height;
    this.halfWidth = width * 0.5;
    this.halfHeight = height * 0.5;
    this.volumeDepth = 0.1;
    this.frontZ = FRONT_Z;

    this.setAttribute('position', new BufferAttribute(new Float32Array(8 * 3), 3));
    this.setIndex([...FRONT_INDICES, ...VOLUME_INDICES]);
    this.addGroup(0, FRONT_INDICES.length, 0);
    this.addGroup(FRONT_INDICES.length, VOLUME_INDICES.length, 1);
    this.setVolume(60, 1, 0.05);
  }

  setVolume(fov, aspect, near) {
    const fovY = (fov * Math.PI) / 180;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * Math.max(aspect, 1e-4));
    const dz = Math.max(near / Math.cos(fovX / 2), near / Math.cos(fovY / 2));
    this.volumeDepth = dz;
    this.frontZ = FRONT_Z;

    const hx = this.halfWidth;
    const hy = this.halfHeight;
    const inset = Math.min(FRONT_INSET, hx * 0.2, hy * 0.2);
    const fx = hx - inset;
    const fy = hy - inset;
    const dx = Math.tan(fovX / 2) * dz / Math.max(hx, 1e-4);
    const dy = Math.tan(fovY / 2) * dz / Math.max(hy, 1e-4);
    const wx = hx * (1 + dx);
    const wy = hy * (1 + dy);

    const p = this.attributes.position.array;
    const verts = [
      -fx, -fy, FRONT_Z,
      fx, -fy, FRONT_Z,
      -fx, fy, FRONT_Z,
      fx, fy, FRONT_Z,
      -wx, -wy, -dz,
      wx, -wy, -dz,
      -wx, wy, -dz,
      wx, wy, -dz,
    ];
    p.set(verts);
    this.attributes.position.needsUpdate = true;
    this.computeBoundingSphere();
  }
}
