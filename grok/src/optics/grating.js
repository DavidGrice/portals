/**
 * Scalar Kirchhoff grating. Not RCWA / Maxwell.
 * Angles are radians from the grating normal. Same-side positive.
 * Reflection m=0 is specular: theta_m = -theta_i.
 */

export const VISIBLE_NM = { min: 380, max: 780 };

export const LINES = {
  gan405: 405,
  diode445: 445,
  diode473: 473,
  ndyag532: 532,
  heNe543: 543.5,
  sodiumD2: 588.995,
  sodiumD1: 589.592,
  heNe633: 632.8,
  hAlpha: 656.3,
  hBeta: 486.1,
  hGamma: 434.0,
  hDelta: 410.2,
  uv365: 365,
  ir850: 850,
  mercury436: 435.8,
  mercury546: 546.1,
  mercury578: 578.0,
  helium588: 587.6,
};

const LINE_ALIASES = {
  405: LINES.gan405,
  445: LINES.diode445,
  473: LINES.diode473,
  532: LINES.ndyag532,
  543: LINES.heNe543,
  589: LINES.sodiumD1,
  '589.0': LINES.sodiumD2,
  '589.6': LINES.sodiumD1,
  633: LINES.heNe633,
  632.8: LINES.heNe633,
  656.3: LINES.hAlpha,
  486.1: LINES.hBeta,
  434: LINES.hGamma,
  410.2: LINES.hDelta,
  850: LINES.ir850,
  365: LINES.uv365,
};

export function nmOf(lineId) {
  if (typeof lineId === 'number' && Number.isFinite(lineId)) {
    return lineId;
  }
  if (LINES[lineId] != null) {
    return LINES[lineId];
  }
  if (LINE_ALIASES[lineId] != null) {
    return LINE_ALIASES[lineId];
  }
  const parsed = Number(lineId);
  return Number.isFinite(parsed) ? parsed : null;
}

export function groovePitchMeters(linesPerMm) {
  const n = Number(linesPerMm);
  if (!(n > 0)) {
    return null;
  }
  return 1e-3 / n;
}

export function wavelengthMeters(nm) {
  const n = Number(nm);
  if (!(n > 0)) {
    return null;
  }
  return n * 1e-9;
}

export function toDeg(rad) {
  return (Number(rad) || 0) * (180 / Math.PI);
}

export function fromDeg(deg) {
  return (Number(deg) || 0) * (Math.PI / 180);
}

export function sinDiffraction(d, lambda, m, sinI) {
  if (!(d > 0) || !(lambda > 0) || !Number.isFinite(m) || !Number.isFinite(sinI)) {
    return null;
  }
  return (m * lambda) / d - sinI;
}

export function diffractionAngle(d, lambda, m, thetaI, { mode = 'reflect' } = {}) {
  if (m === 0) {
    if (mode === 'transmit') {
      return Number.isFinite(thetaI) ? thetaI : 0;
    }
    return Number.isFinite(thetaI) ? -thetaI : 0;
  }
  const sinI = Math.sin(thetaI);
  const sinM = sinDiffraction(d, lambda, m, sinI);
  if (sinM == null || Math.abs(sinM) > 1) {
    return null;
  }
  return Math.asin(sinM);
}

export function ordersFor(d, lambda, thetaI, mMax = 4, extras = {}) {
  const out = [];
  const max = Math.max(0, Math.floor(mMax));
  for (let m = -max; m <= max; m += 1) {
    if (extras.skipEven && m !== 0 && m % 2 === 0) {
      continue;
    }
    const theta = diffractionAngle(d, lambda, m, thetaI, extras);
    if (theta == null) {
      continue;
    }
    out.push({ m, theta });
  }
  return out;
}

export function visibleOrders(d, lambda, thetaI, mMax = 4, extras = {}) {
  return ordersFor(d, lambda, thetaI, mMax, extras);
}

export function formatOpticsStatus({
  linesPerMm = 600,
  mode = 'reflect',
  lambdaNm = null,
  thetaI = 0,
  order = 1,
  label = null,
} = {}) {
  const d = groovePitchMeters(linesPerMm);
  const i = toDeg(thetaI).toFixed(1);
  const head = `${linesPerMm} /mm  ${mode}  i=${i}`;
  const prefix = label ? `${label}  |  ` : '';
  if (lambdaNm == null || lambdaNm === 0) {
    return `${prefix}${head}  NO SOURCE`;
  }
  const thetaM = d ? diffractionAngle(d, wavelengthMeters(lambdaNm), order, thetaI, { mode }) : null;
  const mLabel = `${order > 0 ? '+' : ''}${order}`;
  if (thetaM == null) {
    return `${prefix}${head}  m=${mLabel} ${lambdaNm}nm evanescent`;
  }
  return `${prefix}${head}  m=${mLabel} ${lambdaNm}nm -> ${toDeg(thetaM).toFixed(1)}`;
}

export function angularDispersion(d, thetaM, m) {
  if (!(d > 0) || !Number.isFinite(thetaM) || !m) {
    return 0;
  }
  const c = Math.cos(thetaM);
  if (Math.abs(c) < 1e-3) {
    return 0;
  }
  return m / (d * c);
}

export function illuminatedGrooves(linesPerMm, beamWidthM) {
  const n = Number(linesPerMm);
  const w = Number(beamWidthM);
  if (!(n > 0) || !(w > 0)) {
    return 0;
  }
  return n * w * 1e3;
}

export function resolvingPower(m, nGrooves) {
  return Math.abs(m) * Math.max(0, nGrooves);
}

export function deltaLambda(lambda, r) {
  if (!(lambda > 0) || !(r > 0)) {
    return Infinity;
  }
  return lambda / r;
}

export function freeSpectralRange(lambda, m) {
  if (!(lambda > 0)) {
    return Infinity;
  }
  if (!m) {
    return Infinity;
  }
  return lambda / Math.abs(m);
}

export function ordersOverlap(lambda1, m1, lambda2, m2, eps = 1e-12) {
  return Math.abs(m1 * lambda1 - m2 * lambda2) < eps;
}

export function blazeAngleFor(d, lambdaB, m = 1) {
  if (!(d > 0) || !(lambdaB > 0) || !m) {
    return null;
  }
  const s = (m * lambdaB) / (2 * d);
  if (Math.abs(s) > 1) {
    return null;
  }
  return Math.asin(s);
}

export function blazeEfficiency(thetaI, thetaM, thetaB) {
  const i = thetaI ?? 0;
  const m = thetaM ?? 0;
  const b = thetaB ?? 0;
  const facetSpecular = 2 * b - i;
  const delta = m - facetSpecular;
  const sigma = Math.PI / 18;
  return Math.exp(-((delta / sigma) ** 2));
}

export function missingEvenOrders(dutyCycle) {
  return Math.abs((dutyCycle ?? 0.5) - 0.5) < 0.02;
}

export function bandOf(nm) {
  if (!(nm > 0)) {
    return 'none';
  }
  if (nm < VISIBLE_NM.min) {
    return 'uv';
  }
  if (nm > VISIBLE_NM.max) {
    return 'ir';
  }
  return 'visible';
}

export function wavelengthToRgb(nm) {
  const band = bandOf(nm);
  if (band !== 'visible') {
    return { r: 0, g: 0, b: 0, band };
  }
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm < 440) {
    r = -(nm - 440) / (440 - 380);
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / (490 - 440);
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = -(nm - 510) / (510 - 490);
  } else if (nm < 580) {
    r = (nm - 510) / (580 - 510);
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = -(nm - 645) / (645 - 580);
  } else {
    r = 1;
  }
  let factor = 1;
  if (nm > 700) {
    factor = 0.3 + 0.7 * (780 - nm) / (780 - 700);
  } else if (nm < 420) {
    factor = 0.3 + 0.7 * (nm - 380) / (420 - 380);
  }
  const gamma = (c) => (c <= 0 ? 0 : c ** 0.8);
  return {
    r: Math.min(1, Math.max(0, gamma(r * factor))),
    g: Math.min(1, Math.max(0, gamma(g * factor))),
    b: Math.min(1, Math.max(0, gamma(b * factor))),
    band,
  };
}

export function incidentDirection(lightPos, cardPos) {
  const dx = (cardPos?.[0] ?? 0) - (lightPos?.[0] ?? 0);
  const dy = (cardPos?.[1] ?? 0) - (lightPos?.[1] ?? 0);
  const dz = (cardPos?.[2] ?? 0) - (lightPos?.[2] ?? 0);
  const len = Math.hypot(dx, dy, dz) || 1;
  return [dx / len, dy / len, dz / len];
}

export function thetaIFrom(incident, normal, tangent) {
  const n = normalize3(normal) ?? [0, 0, 1];
  const inc = normalize3(incident);
  if (!inc) {
    return 0;
  }
  const toward = [-inc[0], -inc[1], -inc[2]];
  const c = clamp(dot3(toward, n), -1, 1);
  const unsigned = Math.acos(c);
  const t = normalize3(tangent) ?? [1, 0, 0];
  const sign = Math.sign(dot3(toward, t)) || 1;
  return sign * unsigned;
}

export function diffractedDirection(normal, tangent, thetaM) {
  const n = normalize3(normal) ?? [0, 0, 1];
  const t = normalize3(tangent) ?? [1, 0, 0];
  const c = Math.cos(thetaM);
  const s = Math.sin(thetaM);
  return normalize3([
    t[0] * s + n[0] * c,
    t[1] * s + n[1] * c,
    t[2] * s + n[2] * c,
  ]) ?? n;
}

export function rayHitsSphere(origin, dir, center, radius) {
  const d = normalize3(dir);
  if (!d || !(radius > 0)) {
    return false;
  }
  const ox = (origin?.[0] ?? 0) - (center?.[0] ?? 0);
  const oy = (origin?.[1] ?? 0) - (center?.[1] ?? 0);
  const oz = (origin?.[2] ?? 0) - (center?.[2] ?? 0);
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) {
    return false;
  }
  const t = -b - Math.sqrt(disc);
  const t2 = -b + Math.sqrt(disc);
  return t >= 0 || t2 >= 0;
}

export function rayHitsDisk(origin, dir, center, normal, radius) {
  const d = normalize3(dir);
  const n = normalize3(normal);
  if (!d || !n || !(radius > 0)) {
    return false;
  }
  const denom = dot3(d, n);
  if (Math.abs(denom) < 1e-6) {
    return false;
  }
  const w = [
    (center?.[0] ?? 0) - (origin?.[0] ?? 0),
    (center?.[1] ?? 0) - (origin?.[1] ?? 0),
    (center?.[2] ?? 0) - (origin?.[2] ?? 0),
  ];
  const t = dot3(w, n) / denom;
  if (t < 0) {
    return false;
  }
  const px = (origin?.[0] ?? 0) + d[0] * t - (center?.[0] ?? 0);
  const py = (origin?.[1] ?? 0) + d[1] * t - (center?.[1] ?? 0);
  const pz = (origin?.[2] ?? 0) + d[2] * t - (center?.[2] ?? 0);
  return px * px + py * py + pz * pz <= radius * radius;
}

export function detectorHit({
  origin,
  direction,
  center,
  normal,
  radius,
  order,
  lambdaNm,
  wantOrder,
  wantNm,
  toleranceDeg = 2.5,
  lambdaTolNm = 8,
  angleDeg = null,
} = {}) {
  if (wantOrder != null && order !== wantOrder) {
    return false;
  }
  if (wantNm != null && Math.abs((lambdaNm ?? 0) - wantNm) > lambdaTolNm) {
    return false;
  }
  if (angleDeg != null && Math.abs(angleDeg) > toleranceDeg) {
    return false;
  }
  if (origin && direction && center) {
    if (normal) {
      return rayHitsDisk(origin, direction, center, normal, radius ?? 0.22);
    }
    return rayHitsSphere(origin, direction, center, radius ?? 0.22);
  }
  return true;
}

function dot3(a, b) {
  return (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
}

function normalize3(v) {
  if (!v) {
    return null;
  }
  const len = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  if (len < 1e-9) {
    return null;
  }
  return [v[0] / len, v[1] / len, v[2] / len];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
