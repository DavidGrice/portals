import { BufferAttribute, BufferGeometry } from 'three';

// Two triangles, both CCW when looking from +Z (the walk-up side).
const INDICES = [0, 1, 3, 0, 3, 2];

export class PortalGeometry extends BufferGeometry {
  constructor(width, height) {
    super();

    this.type = 'PortalGeometry';
    this.width = width;
    this.height = height;
    this.halfWidth = width * 0.5;
    this.halfHeight = height * 0.5;

    const hx = this.halfWidth;
    const hy = this.halfHeight;
    const positions = new Float32Array([-hx, -hy, 0, hx, -hy, 0, -hx, hy, 0, hx, hy, 0]);

    this.setAttribute('position', new BufferAttribute(positions, 3));
    this.setIndex(INDICES);
    this.computeBoundingSphere();
  }
}
