import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';

const fireWorld = new Vector3();

export const MOTE_BUDGET = 128;
const MOTE_BASE = 96;
export const BURST_COUNT = 28;
const PROFILE_DENSITY = {
  performance: 0,
  balanced: 1,
  ultra: 1.3,
};

export function profileMoteDensity(profileId) {
  return PROFILE_DENSITY[profileId] ?? 1;
}

export function attachMotes(room, { color = 0xffffff, origin = [0, 0, 0], half = [7.2, 1.4, 5.4] } = {}) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(MOTE_BUDGET * 3);
  const seeds = new Float32Array(MOTE_BUDGET);
  for (let i = 0; i < MOTE_BUDGET; i += 1) {
    positions[i * 3] = origin[0] + (Math.random() * 2 - 1) * half[0];
    positions[i * 3 + 1] = 0.35 + Math.random() * half[1] * 2;
    positions[i * 3 + 2] = origin[2] + (Math.random() * 2 - 1) * half[2];
    seeds[i] = Math.random() * Math.PI * 2;
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const material = new PointsMaterial({
    color,
    size: 0.055,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.userData.motes = { seeds, origin, half };
  points.userData.noCollider = true;
  room.scene.add(points);
  room.motes = points;
  room.bursts = [];
  return points;
}

export function setMoteDensity(room, density) {
  const count = Math.min(MOTE_BUDGET, Math.max(0, Math.round(MOTE_BASE * Number(density || 0))));
  room.motes?.geometry.setDrawRange(0, count);
  return count;
}

export function tickAtmosphere(rooms, { elapsed = 0, dt = 0.016 } = {}) {
  for (const room of rooms) {
    tickMotes(room, elapsed);
    tickBursts(room, dt);
    tickFires(room, elapsed, dt);
  }
}

export function nearestFireDistance(room, position) {
  if (!room?.scene || !position) {
    return Infinity;
  }
  let best = Infinity;
  room.scene.traverse((object) => {
    if (!object.userData?.fire || object.userData.fire.candle) {
      return;
    }
    object.getWorldPosition(fireWorld);
    best = Math.min(best, fireWorld.distanceTo(position));
  });
  return best;
}

export function tickFires(room, elapsed = 0, dt = 0.016) {
  room?.scene?.traverse((object) => {
    const spec = object.userData?.fire;
    if (!spec) {
      return;
    }
    const flicker = 0.78 + Math.sin(elapsed * (spec.candle ? 14 : 9) + spec.seed) * 0.14 + Math.random() * 0.08;
    object.traverse((child) => {
      if (child.userData?.fireLight) {
        child.intensity = spec.base * flicker;
      }
      const flames = child.userData?.flames;
      if (!flames) {
        return;
      }
      const positions = child.geometry.attributes.position.array;
      const { lives, rise } = flames;
      for (let i = 0; i < lives.length; i += 1) {
        lives[i] += dt * (0.7 + Math.random() * 0.8);
        positions[i * 3 + 1] += rise * dt;
        positions[i * 3] += Math.sin(elapsed * 6 + i) * 0.01;
        if (lives[i] > 1) {
          lives[i] = 0;
          positions[i * 3] = (Math.random() - 0.5) * 0.52;
          positions[i * 3 + 1] = 0.24 + Math.random() * 0.08;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 0.16;
        }
      }
      child.geometry.attributes.position.needsUpdate = true;
      child.material.opacity = 0.55 + flicker * 0.35;
    });
  });
}

export function spawnCrossBurst(room, position, color = 0xffffff) {
  if (!room?.scene) {
    return null;
  }
  const geometry = new BufferGeometry();
  const positions = new Float32Array(BURST_COUNT * 3);
  const velocities = [];
  for (let i = 0; i < BURST_COUNT; i += 1) {
    positions[i * 3] = position.x;
    positions[i * 3 + 1] = position.y;
    positions[i * 3 + 2] = position.z;
    const yaw = Math.random() * Math.PI * 2;
    const pitch = (Math.random() - 0.35) * Math.PI * 0.6;
    const speed = 1.2 + Math.random() * 2.2;
    velocities.push({
      x: Math.cos(yaw) * Math.cos(pitch) * speed,
      y: Math.sin(pitch) * speed,
      z: Math.sin(yaw) * Math.cos(pitch) * speed,
    });
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color,
    size: 0.08,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  room.scene.add(points);
  const burst = { points, velocities, born: 0, life: 0.55 };
  room.bursts = room.bursts ?? [];
  room.bursts.push(burst);
  return burst;
}

function tickMotes(room, elapsed) {
  const points = room.motes;
  const spec = points?.userData.motes;
  if (!spec) {
    return;
  }
  const positions = points.geometry.attributes.position.array;
  const count = points.geometry.drawRange.count;
  for (let i = 0; i < count; i += 1) {
    const seed = spec.seeds[i];
    positions[i * 3 + 1] += Math.sin(elapsed * 0.7 + seed) * 0.002;
  }
  points.geometry.attributes.position.needsUpdate = true;
}

function tickBursts(room, dt) {
  if (!room.bursts?.length) {
    return;
  }
  const keep = [];
  for (const burst of room.bursts) {
    burst.born += dt;
    const positions = burst.points.geometry.attributes.position.array;
    const fade = 1 - burst.born / burst.life;
    burst.points.material.opacity = Math.max(0, fade);
    for (let i = 0; i < burst.velocities.length; i += 1) {
      const velocity = burst.velocities[i];
      positions[i * 3] += velocity.x * dt;
      positions[i * 3 + 1] += velocity.y * dt;
      positions[i * 3 + 2] += velocity.z * dt;
      velocity.y -= 2.4 * dt;
    }
    burst.points.geometry.attributes.position.needsUpdate = true;
    if (burst.born < burst.life) {
      keep.push(burst);
    } else {
      burst.points.parent?.remove(burst.points);
      burst.points.geometry.dispose();
      burst.points.material.dispose();
    }
  }
  room.bursts = keep;
}

export function tickNpcs(rooms, camera) {
  if (!camera) {
    return 0;
  }
  let count = 0;
  for (const room of rooms ?? []) {
    room.scene?.traverse((object) => {
      if (!object.userData?.npc?.lookAtPlayer) {
        return;
      }
      object.lookAt(camera.position.x, object.position.y, camera.position.z);
      count += 1;
    });
  }
  return count;
}

export function tintGlow(object, color) {
  object?.traverse((child) => {
    if (child.userData.portalGlow && child.material) {
      child.material.color = new Color(color);
    }
  });
}
