export function detectTouch() {
  if (typeof window === 'undefined') {
    return false;
  }
  return 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
}

// One-shot heuristic for a brand-new install. Never overrides a saved choice.
export function suggestGraphicsQuality() {
  if (typeof window === 'undefined') {
    return 'balanced';
  }
  const touch = detectTouch();
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = navigator.deviceMemory;
  const weakCores = cores <= 4;
  const weakMem = mem !== undefined && mem <= 4;
  if (weakCores && weakMem) {
    return 'performance';
  }
  if (touch && (weakCores || weakMem)) {
    return 'performance';
  }
  if (touch || weakCores || weakMem) {
    return 'balanced';
  }
  return 'ultra';
}
