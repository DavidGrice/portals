export function hashSeed(seed) {
  const text = String(seed ?? 'drift');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

export function createRng(seed) {
  let state = hashSeed(seed);
  return function rng() {
    state = (Math.imul(state, 16807) + 0) % 2147483647;
    if (state <= 0) {
      state += 2147483646;
    }
    return (state - 1) / 2147483646;
  };
}

export function pickInt(rng, min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return low + Math.floor(rng() * (high - low + 1));
}

export function pickOne(rng, list) {
  if (!list?.length) {
    return null;
  }
  return list[Math.floor(rng() * list.length) % list.length];
}
