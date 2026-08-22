import * as THREE from 'three';

export const HOLE_WIDTH = 2.5;
export const HOLE_HEIGHT = 2.35;

export function addBox(group, material, x, y, z, sx, sy, sz, collide = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (collide) {
    mesh.userData.collider = { type: 'aabb' };
  }
  group.add(mesh);
  return mesh;
}

export function addCylinder(group, material, x, y, z, radius, height, collide = true) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 14), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (collide) {
    mesh.userData.collider = { type: 'aabb' };
  }
  group.add(mesh);
  return mesh;
}

export function wallAxis(wall) {
  return wall === 'west' || wall === 'east' ? 'z' : 'x';
}

export function holesOnWall(holes, wall) {
  return (holes ?? []).filter((hole) => hole.wall === wall);
}

export function addWallWithHoles(group, material, {
  wall,
  minX,
  maxX,
  minZ,
  maxZ,
  y0 = 0,
  height,
  thickness,
  holes = [],
  holeWidth = HOLE_WIDTH,
  holeHeight = HOLE_HEIGHT,
}) {
  const cuts = holesOnWall(holes, wall)
    .map((hole) => Number(hole.u ?? 0))
    .sort((a, b) => a - b);
  const alongX = wall === 'north' || wall === 'south';
  const spanMin = alongX ? minX : minZ;
  const spanMax = alongX ? maxX : maxZ;
  const fixed = wall === 'north' ? minZ : wall === 'south' ? maxZ : wall === 'west' ? minX : maxX;
  const thick = thickness;
  const midY = y0 + height * 0.5;

  const place = (center, length) => {
    if (length <= 0.08) {
      return;
    }
    if (alongX) {
      addBox(group, material, center, midY, fixed, length, height, thick);
    } else {
      addBox(group, material, fixed, midY, center, thick, height, length);
    }
  };

  if (!cuts.length) {
    place((spanMin + spanMax) * 0.5, spanMax - spanMin);
    return;
  }

  let cursor = spanMin;
  for (const u of cuts) {
    const start = u - holeWidth * 0.5;
    const end = u + holeWidth * 0.5;
    place((cursor + start) * 0.5, start - cursor);
    const lintel = Math.max(height - holeHeight, 0.08);
    if (alongX) {
      addBox(group, material, u, y0 + holeHeight + lintel * 0.5, fixed, holeWidth, lintel, thick);
    } else {
      addBox(group, material, fixed, y0 + holeHeight + lintel * 0.5, u, thick, lintel, holeWidth);
    }
    cursor = end;
  }
  place((cursor + spanMax) * 0.5, spanMax - cursor);
}

export function addRectVolume(group, material, {
  minX,
  maxX,
  minZ,
  maxZ,
  height = 3.2,
  thickness = 0.24,
  y0 = 0,
  holes = [],
  floor = true,
  ceiling = true,
  holeWidth = HOLE_WIDTH,
  holeHeight = HOLE_HEIGHT,
  openWalls = [],
  roundCorners = false,
  cornerRadius = 0.9,
  floorHoles = [],
}) {
  const midX = (minX + maxX) * 0.5;
  const midZ = (minZ + maxZ) * 0.5;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const radius = roundCorners ? Math.min(cornerRadius, width * 0.22, depth * 0.22) : 0;
  const inset = radius;
  const open = new Set(openWalls ?? []);
  if (floor) {
    addFloorSlab(group, material, {
      minX,
      maxX,
      minZ,
      maxZ,
      y: y0 - thickness * 0.5,
      thickness,
      holes: floorHoles,
    });
  }
  if (ceiling) {
    addBox(group, material, midX, y0 + height + thickness * 0.5, midZ, width + thickness, thickness, depth + thickness, false);
  }
  for (const wall of ['north', 'south', 'west', 'east']) {
    if (open.has(wall)) {
      continue;
    }
    addWallWithHoles(group, material, {
      wall,
      minX: minX + (wall === 'north' || wall === 'south' ? inset : 0),
      maxX: maxX - (wall === 'north' || wall === 'south' ? inset : 0),
      minZ: minZ + (wall === 'west' || wall === 'east' ? inset : 0),
      maxZ: maxZ - (wall === 'west' || wall === 'east' ? inset : 0),
      y0,
      height,
      thickness,
      holes,
      holeWidth,
      holeHeight,
    });
  }
  if (radius > 0.05) {
    const y = y0 + height * 0.5;
    const corners = [
      [minX + radius, minZ + radius],
      [maxX - radius, minZ + radius],
      [minX + radius, maxZ - radius],
      [maxX - radius, maxZ - radius],
    ];
    for (const [x, z] of corners) {
      const post = addCylinder(group, material, x, y, z, radius, height);
      post.userData.roundCorner = true;
    }
  }
  return { minX, maxX, minZ, maxZ, height, y0, openWalls: [...open], roundCorners: radius > 0 };
}

export function addFloorSlab(group, material, {
  minX,
  maxX,
  minZ,
  maxZ,
  y,
  thickness,
  holes = [],
}) {
  const hole = holes[0];
  if (!hole) {
    addBox(group, material, (minX + maxX) * 0.5, y, (minZ + maxZ) * 0.5, maxX - minX, thickness, maxZ - minZ);
    return;
  }
  const hx = Number(hole.halfX ?? hole.half ?? 1.1);
  const hz = Number(hole.halfZ ?? hole.half ?? 1.1);
  const x0 = Number(hole.x ?? 0);
  const z0 = Number(hole.z ?? 0);
  const left = x0 - hx;
  const right = x0 + hx;
  const south = z0 - hz;
  const north = z0 + hz;
  if (left - minX > 0.08) {
    addBox(group, material, (minX + left) * 0.5, y, (minZ + maxZ) * 0.5, left - minX, thickness, maxZ - minZ);
  }
  if (maxX - right > 0.08) {
    addBox(group, material, (right + maxX) * 0.5, y, (minZ + maxZ) * 0.5, maxX - right, thickness, maxZ - minZ);
  }
  if (south - minZ > 0.08) {
    addBox(group, material, (left + right) * 0.5, y, (minZ + south) * 0.5, right - left, thickness, south - minZ);
  }
  if (maxZ - north > 0.08) {
    addBox(group, material, (left + right) * 0.5, y, (north + maxZ) * 0.5, right - left, thickness, maxZ - north);
  }
}

export function addColonnade(group, material, {
  x,
  z0,
  z1,
  y0 = 0,
  height = 3.2,
  radius = 0.22,
  spacing = 2.6,
}) {
  const span = z1 - z0;
  const count = Math.max(2, Math.round(Math.abs(span) / spacing) + 1);
  const posts = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const z = z0 + span * t;
    const post = addCylinder(group, material, x, y0 + height * 0.5, z, radius, height);
    post.userData.colonnade = true;
    posts.push(post);
  }
  return posts;
}

export function addStairs(group, material, {
  x = 0,
  z0 = 0,
  z1 = -3,
  y0 = 0,
  y1 = 2.2,
  width = 1.8,
  steps = 8,
}) {
  const dz = (z1 - z0) / steps;
  const dy = (y1 - y0) / steps;
  for (let i = 0; i < steps; i += 1) {
    addBox(
      group,
      material,
      x,
      y0 + dy * (i + 0.5),
      z0 + dz * (i + 0.5),
      width,
      Math.max(Math.abs(dy), 0.12),
      Math.max(Math.abs(dz), 0.18),
    );
  }
}

export function socketWorld(socket, footprint) {
  const halfX = Number(footprint.halfX ?? 8);
  const zMin = Number(footprint.zMin ?? -6.2);
  const zMax = Number(footprint.zMax ?? 5.2);
  const y = Number(socket.y ?? 1);
  const u = Number(socket.u ?? 0);
  const wall = socket.wall ?? 'north';
  if (wall === 'north') {
    return { position: [u, y, zMin], yaw: 0, wall };
  }
  if (wall === 'south') {
    return { position: [u, y, zMax], yaw: Math.PI, wall };
  }
  if (wall === 'west') {
    return { position: [-halfX, y, u], yaw: Math.PI / 2, wall };
  }
  return { position: [halfX, y, u], yaw: -Math.PI / 2, wall };
}
