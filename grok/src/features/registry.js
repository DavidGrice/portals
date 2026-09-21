const features = [];

export function registerFeature(feature) {
  if (!feature?.id) {
    throw new Error('feature.id is required');
  }
  if (features.some((entry) => entry.id === feature.id)) {
    return feature;
  }
  features.push(feature);
  return feature;
}

export function clearFeatures() {
  features.length = 0;
}

export function listFeatures() {
  return features.slice();
}

export function indexFeatures(room) {
  for (const feature of features) {
    feature.indexRoom?.(room);
  }
}

export function tickFeatures(rooms, ctx = {}) {
  const out = {};
  for (const feature of features) {
    if (typeof feature.tick !== 'function') {
      continue;
    }
    out[feature.id] = feature.tick(rooms, ctx);
  }
  return out;
}

export function interactFeatures(action, ctx = {}) {
  for (const feature of features) {
    if (typeof feature.onInteract !== 'function') {
      continue;
    }
    const result = feature.onInteract(action, ctx);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}
