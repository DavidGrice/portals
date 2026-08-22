import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'assets', 'models');

function packBoxes(boxes) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (const [x, y, z, sx, sy, sz] of boxes) {
    const hx = sx * 0.5;
    const hy = sy * 0.5;
    const hz = sz * 0.5;
    const faces = [
      { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
      { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
      { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
      { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
      { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
      { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    ];
    for (const face of faces) {
      const start = positions.length / 3;
      for (const [vx, vy, vz] of face.v) {
        positions.push(x + vx, y + vy, z + vz);
        normals.push(...face.n);
      }
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint16Array.from(indices) };
}

function writeGltf(name, boxes, color) {
  const geo = packBoxes(boxes);
  const posBytes = Buffer.from(geo.positions.buffer);
  const nrmBytes = Buffer.from(geo.normals.buffer);
  const idxBytes = Buffer.from(geo.indices.buffer);
  const pad = (buf) => {
    const extra = (4 - (buf.length % 4)) % 4;
    return extra ? Buffer.concat([buf, Buffer.alloc(extra)]) : buf;
  };
  const pos = pad(posBytes);
  const nrm = pad(nrmBytes);
  const idx = pad(idxBytes);
  const bin = Buffer.concat([pos, nrm, idx]);
  const gltf = {
    asset: { version: '2.0', generator: 'portals-grok' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0,
      }],
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorFactor: color,
        metallicFactor: 0.05,
        roughnessFactor: 0.82,
      },
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: geo.positions.length / 3, type: 'VEC3', max: max3(geo.positions), min: min3(geo.positions) },
      { bufferView: 1, componentType: 5126, count: geo.normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: geo.indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length, byteLength: nrmBytes.length, target: 34962 },
      { buffer: 0, byteOffset: pos.length + nrm.length, byteLength: idxBytes.length, target: 34963 },
    ],
    buffers: [{
      byteLength: bin.length,
      uri: `data:application/octet-stream;base64,${bin.toString('base64')}`,
    }],
  };
  writeFileSync(join(out, `${name}.gltf`), `${JSON.stringify(gltf)}\n`);
  console.log(`baked ${name}.gltf ${bin.length} bytes`);
}

function min3(data) {
  let x = data[0];
  let y = data[1];
  let z = data[2];
  for (let i = 0; i < data.length; i += 3) {
    x = Math.min(x, data[i]);
    y = Math.min(y, data[i + 1]);
    z = Math.min(z, data[i + 2]);
  }
  return [x, y, z];
}

function max3(data) {
  let x = data[0];
  let y = data[1];
  let z = data[2];
  for (let i = 0; i < data.length; i += 3) {
    x = Math.max(x, data[i]);
    y = Math.max(y, data[i + 1]);
    z = Math.max(z, data[i + 2]);
  }
  return [x, y, z];
}

mkdirSync(out, { recursive: true });

writeGltf('chair', [
  [0, 0.24, 0, 0.48, 0.06, 0.48],
  [-0.2, 0.12, -0.2, 0.06, 0.24, 0.06],
  [0.2, 0.12, -0.2, 0.06, 0.24, 0.06],
  [-0.2, 0.12, 0.2, 0.06, 0.24, 0.06],
  [0.2, 0.12, 0.2, 0.06, 0.24, 0.06],
  [0, 0.58, -0.2, 0.46, 0.62, 0.07],
  [0, 0.28, 0, 0.44, 0.05, 0.42],
], [0.42, 0.28, 0.16, 1]);

writeGltf('trunk', [
  [0, 0.32, 0, 1.15, 0.64, 0.62],
  [0, 0.64, 0, 1.18, 0.05, 0.64],
], [0.32, 0.22, 0.12, 1]);

writeGltf('column', [
  [0, 1.7, 0, 0.4, 3.2, 0.4],
  [0, 0.08, 0, 0.52, 0.16, 0.52],
  [0, 3.34, 0, 0.48, 0.12, 0.48],
], [0.82, 0.76, 0.62, 1]);
