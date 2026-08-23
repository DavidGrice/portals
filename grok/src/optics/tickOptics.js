import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import {
  blazeEfficiency,
  diffractionAngle,
  diffractedDirection,
  formatOpticsStatus,
  fromDeg,
  groovePitchMeters,
  rayHitsDisk,
  thetaIFrom,
  toDeg,
  wavelengthMeters,
  wavelengthToRgb,
} from './grating.js';
import { syncGratingMaterial } from './gratingMaterial.js';
import { paintCardPlate } from '../content/prefabs.js';

const GROOVE_CYCLE = [300, 600, 1200, 1800];
const CONTINUUM_BINS = [420, 460, 500, 540, 580, 620, 660, 700];
const Y_UP = new Vector3(0, 1, 0);
const scratchDir = new Vector3();
const scratchOrigin = new Vector3();
const scratchCenter = new Vector3();
const scratchNormal = new Vector3();
const scratchLight = new Vector3();
const scratchCard = new Vector3();
const scratchTan = new Vector3();
const scratchN = new Vector3();
const scratchQuat = new Quaternion();

const OPTICS_DOORS = [
  { all: ['found-zero'], portalId: 'door-rotunda-collimator' },
  { all: ['diode-405', 'diode-532', 'diode-633'], set: 'three-diodes', portalId: 'door-rotunda-continuum' },
  { all: ['collimated-green', 'order-one-green'], portalId: 'door-rotunda-blaze' },
  { all: ['understood-blaze'], portalId: 'door-rotunda-echelle' },
  { all: ['echelle-hit', 'saw-evanescent'], portalId: 'door-rotunda-rowland' },
  { all: ['rowland-focus'], portalId: 'door-rowland-disc' },
  { all: ['disc-pitch'], portalId: 'door-disc-hydrogen' },
  { all: ['balmer'], portalId: 'door-hydrogen-sodium' },
  { all: ['resolved-sodium'], portalId: 'door-sodium-overlap' },
  { all: ['separated-overlap'], portalId: 'door-overlap-polar' },
  { all: ['polar-s'], portalId: 'door-polar-invisible' },
  { all: ['seen-uv', 'seen-ir'], portalId: 'door-invisible-slit' },
  { all: ['exit-532'], portalId: 'door-slit-vault' },
  { all: ['balmer'], portalId: 'door-hydrogen-identify' },
];

export function defaultGratingOptions(spec = {}) {
  if (spec.options?.length) {
    return spec.options;
  }
  const blaze = spec.blazeDeg ?? 10.37;
  return [
    { label: '600 /mm reflect', linesPerMm: 600, mode: 'reflect', blazeDeg: blaze },
    { label: '1200 /mm reflect', linesPerMm: 1200, mode: 'reflect', blazeDeg: blaze },
    { label: '1800 /mm reflect', linesPerMm: 1800, mode: 'reflect', blazeDeg: blaze },
    { label: '600 /mm transmit', linesPerMm: 600, mode: 'transmit', blazeDeg: blaze },
  ];
}

export function applyGratingOption(grating, option, room) {
  const spec = grating?.userData?.grating;
  if (!spec || !option) {
    return null;
  }
  if (option.linesPerMm != null) {
    spec.linesPerMm = option.linesPerMm;
  }
  if (option.mode != null) {
    spec.mode = option.mode;
  }
  if (option.blazeDeg != null) {
    spec.blazeDeg = option.blazeDeg;
  }
  if (option.mMax != null) {
    spec.mMax = option.mMax;
  }
  if (option.mMin != null) {
    spec.mMin = option.mMin;
  }
  if (option.label != null) {
    spec.label = option.label;
  }
  if (option.yaw != null) {
    grating.rotation.y = option.yaw;
  }
  if (option.tilt != null) {
    spec.crossTilt = option.tilt !== 0;
    grating.rotation.x = fromDeg(option.tilt);
  }
  spec.filterBand = option.filterBand ?? null;
  if (option.slitWidth != null && room?.scene) {
    room.scene.traverse((object) => {
      if (object.userData?.slit) {
        object.userData.slit.width = option.slitWidth;
      }
    });
  }
  grating.traverse((child) => {
    if (child.material?.userData?.gratingMaterial) {
      syncGratingMaterial(child.material, {
        linesPerMm: spec.linesPerMm,
        blazeDeg: spec.blazeDeg,
        mode: spec.mode,
      });
    }
  });
  if (spec.plate) {
    paintCardPlate(spec.plate, spec.label ?? option.label ?? '');
  }
  for (const readout of room?.readouts ?? []) {
    if (readout.userData?.readout) {
      readout.userData.readout.text = option.label ?? spec.label ?? '';
    }
  }
  return option;
}

export function cycleGratingOptions(grating, room) {
  const spec = grating?.userData?.grating;
  if (!spec) {
    return null;
  }
  const options = defaultGratingOptions(spec);
  spec.optionIndex = ((spec.optionIndex ?? 0) + 1) % options.length;
  return applyGratingOption(grating, options[spec.optionIndex], room);
}

export function indexRoomOptics(room) {
  if (!room?.scene) {
    return room;
  }
  const gratings = [];
  const lasers = [];
  const detectors = [];
  const readouts = [];
  const slits = [];
  const shutters = [];
  room.scene.traverse((object) => {
    if (object.userData?.grating) {
      gratings.push(object);
    }
    if (object.userData?.laser) {
      lasers.push(object);
    }
    if (object.userData?.detector) {
      detectors.push(object);
    }
    if (object.userData?.readout) {
      readouts.push(object);
    }
    if (object.userData?.slit) {
      slits.push(object);
    }
    if (object.userData?.shutter) {
      shutters.push(object);
    }
  });
  room.gratings = gratings;
  room.lasers = lasers;
  room.detectors = detectors;
  room.readouts = readouts;
  room.slits = slits;
  room.shutters = shutters;
  room.orderBeams = room.orderBeams ?? [];
  if (lasers.length) {
    let need = 2;
    for (const laser of lasers) {
      const lines = laser.userData.laser.lines;
      need += lines?.length ? 2 + lines.length * 2 : 8;
    }
    need = Math.min(24, need);
    for (let i = 0; i < need; i += 1) {
      const mesh = ensureBeam(room, i);
      mesh.visible = false;
    }
  }
  return room;
}

export function setLaserEnabled(laser, enabled) {
  const spec = laser?.userData?.laser;
  if (!spec) {
    return;
  }
  spec.enabled = Boolean(enabled);
  laser.traverse((child) => {
    if (child.isSpotLight) {
      child.intensity = spec.enabled ? (spec.power ?? 1) * 1.6 : 0;
    }
    if (child.userData?.laserAperture && child.material) {
      child.material.emissiveIntensity = spec.enabled ? 1.4 : 0.08;
    }
  });
}

export function lockGratingSpin(grating, locked) {
  const spec = grating?.userData?.grating;
  if (!spec) {
    return;
  }
  if (locked) {
    spec.freeSpin = spec.freeSpin ?? grating.userData.spin ?? [0, 0.12, 0];
    grating.userData.spin = [0, 0, 0];
    spec.locked = true;
  } else {
    grating.userData.spin = spec.freeSpin ?? [0, 0.12, 0];
    spec.locked = false;
  }
}

export function cycleGrooves(grating) {
  const spec = grating?.userData?.grating;
  if (!spec) {
    return null;
  }
  const index = GROOVE_CYCLE.indexOf(spec.linesPerMm);
  spec.linesPerMm = GROOVE_CYCLE[(index + 1) % GROOVE_CYCLE.length] ?? 600;
  grating.traverse((child) => {
    if (child.material?.userData?.gratingMaterial) {
      syncGratingMaterial(child.material, { linesPerMm: spec.linesPerMm });
    }
  });
  return spec.linesPerMm;
}

export function syncOpticsDoors(controller) {
  if (!controller) {
    return;
  }
  const flags = controller.flags ?? {};
  const continuumHits = CONTINUUM_BINS.filter((nm) => flags[`continuum-${nm}`]).length;
  if (continuumHits >= 3) {
    flags['walked-spectrum'] = true;
  }
  if (flags['balmer-ha'] && flags['balmer-hb'] && flags['balmer-hg'] && flags['balmer-hd']) {
    flags['balmer'] = true;
  }
  if (flags['littrow-lock']) {
    flags['free-roam'] = true;
    for (const portal of controller.allPortals ?? []) {
      portal.enabled = true;
    }
  }
  for (const rule of OPTICS_DOORS) {
    if (rule.all.every((name) => flags[name])) {
      if (rule.set) {
        flags[rule.set] = true;
      }
      const portal = controller.getPortal?.(rule.portalId);
      if (portal) {
        portal.enabled = true;
      }
    }
  }
}

export function applyOpticsInteract(action, { room, spec, controller } = {}) {
  if (!room) {
    return { type: action };
  }
  indexRoomOptics(room);
  controller.flags = controller.flags ?? {};
  if (action === 'arm-laser' || action === 'arm-lamp') {
    const lambda = spec?.lambdaNm;
    for (const laser of room.lasers) {
      const on = lambda == null || laser.userData.laser.lambdaNm === lambda;
      setLaserEnabled(laser, on);
    }
    if (lambda != null) {
      controller.flags[`armed-${lambda}`] = true;
      if (lambda === 532) {
        controller.flags['tried-green'] = true;
      }
    }
    maybeSawEvanescent(room, controller);
    syncOpticsDoors(controller);
    return { type: action, lambdaNm: lambda };
  }
  if (action === 'kill-laser') {
    for (const laser of room.lasers) {
      setLaserEnabled(laser, false);
    }
    return { type: action };
  }
  if (action === 'cycle-options') {
    let option = null;
    for (const grating of room.gratings) {
      option = cycleGratingOptions(grating, room);
    }
    if (option?.filterBand) {
      controller.flags['separated-overlap'] = true;
    }
    maybeSawEvanescent(room, controller);
    syncOpticsDoors(controller);
    return { type: action, option, linesPerMm: option?.linesPerMm ?? null, label: option?.label ?? '' };
  }
  if (action === 'lock-spin') {
    for (const grating of room.gratings) {
      lockGratingSpin(grating, true);
    }
    return { type: action };
  }
  if (action === 'free-spin') {
    for (const grating of room.gratings) {
      lockGratingSpin(grating, false);
    }
    return { type: action };
  }
  if (action === 'set-grooves') {
    let option = null;
    for (const grating of room.gratings) {
      option = cycleGratingOptions(grating, room);
    }
    maybeSawEvanescent(room, controller);
    return { type: action, linesPerMm: option?.linesPerMm ?? null };
  }
  if (action === 'flip-blaze') {
    for (const grating of room.gratings) {
      const g = grating.userData.grating;
      if (Math.abs(g.blazeDeg ?? 0) < 0.05) {
        continue;
      }
      g.blazeDeg = -(g.blazeDeg ?? 10.37);
      grating.traverse((child) => {
        if (child.material?.userData?.gratingMaterial) {
          syncGratingMaterial(child.material, { blazeDeg: g.blazeDeg });
        }
      });
    }
    return { type: action };
  }
  if (action === 'set-mode') {
    for (const grating of room.gratings) {
      const g = grating.userData.grating;
      g.mode = g.mode === 'transmit' ? 'reflect' : 'transmit';
      grating.traverse((child) => {
        if (child.material?.userData?.gratingMaterial) {
          syncGratingMaterial(child.material, { mode: g.mode });
        }
      });
    }
    return { type: action };
  }
  if (action === 'set-slit') {
    const widths = [0.02, 0.04, 0.08];
    room.scene.traverse((object) => {
      const slit = object.userData?.slit;
      if (!slit) {
        return;
      }
      const index = widths.indexOf(slit.width);
      slit.width = widths[(index + 1) % widths.length];
    });
    return { type: action };
  }
  if (action === 'tilt-cross') {
    for (const grating of room.gratings) {
      const g = grating.userData.grating;
      g.crossTilt = !g.crossTilt;
      grating.rotation.x = g.crossTilt ? fromDeg(8) : 0;
    }
    return { type: action };
  }
  if (action === 'confirm-blaze') {
    const ok = Boolean(controller.flags['blaze-ruled-plus']);
    if (ok) {
      controller.flags['understood-blaze'] = true;
      syncOpticsDoors(controller);
    }
    return { type: action, ok };
  }
  if (action === 'confirm-evanescent') {
    const lines = room.gratings[0]?.userData?.grating?.linesPerMm;
    const armed = (room.lasers ?? []).some((laser) => laser.userData.laser.enabled && laser.userData.laser.lambdaNm === 633);
    const ok = lines >= 1800 && armed;
    if (ok) {
      controller.flags['saw-evanescent'] = true;
      syncOpticsDoors(controller);
    }
    return { type: action, ok };
  }
  if (action === 'confirm-polar') {
    controller.flags['polar-s'] = true;
    syncOpticsDoors(controller);
    return { type: action, ok: true };
  }
  if (action === 'identify-lamp') {
    const ok = spec?.answer === 'helium';
    if (ok) {
      controller.flags['id-lamp'] = true;
    }
    return { type: action, ok, answer: spec?.answer ?? null };
  }
  if (action === 'resolve-sodium') {
    let width = 0.04;
    room.scene.traverse((object) => {
      if (object.userData?.slit?.width != null) {
        width = object.userData.slit.width;
      }
    });
    const armed = (room.lasers ?? []).some((laser) => laser.userData.laser.enabled);
    const ok = armed && width <= 0.021;
    if (ok) {
      controller.flags['resolved-sodium'] = true;
      syncOpticsDoors(controller);
    }
    return { type: action, ok, slitWidth: width };
  }
  return { type: action, text: spec?.text ?? '' };
}

function maybeSawEvanescent(room, controller) {
  const grating = room.gratings?.[0];
  const lines = grating?.userData?.grating?.linesPerMm ?? 0;
  const armed633 = (room.lasers ?? []).some((laser) => laser.userData.laser.enabled && Number(laser.userData.laser.lambdaNm) === 633);
  if (lines >= 1800 && armed633) {
    const d = groovePitchMeters(lines);
    const theta = diffractionAngle(d, wavelengthMeters(633), 1, 0);
    if (theta == null) {
      controller.flags['saw-evanescent'] = true;
      syncOpticsDoors(controller);
    }
  }
}

function rgbColor({ r, g, b }) {
  return (Math.round(r * 255) << 16) + (Math.round(g * 255) << 8) + Math.round(b * 255);
}

function ensureBeam(room, index) {
  let mesh = room.orderBeams[index];
  if (!mesh) {
    mesh = new Mesh(
      new CylinderGeometry(0.022, 0.022, 1, 12, 1, true),
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 2;
    mesh.userData.orderBeam = true;
    room.scene.add(mesh);
    room.orderBeams[index] = mesh;
  }
  return mesh;
}

function placeBeam(mesh, origin, direction, length, color, opacity = 0.55, radiusScale = 1) {
  const len = Math.max(0.2, Math.min(length, 16));
  mesh.visible = opacity > 0.02;
  mesh.material.color.setHex(color);
  mesh.material.opacity = opacity;
  mesh.scale.set(radiusScale, len, radiusScale);
  scratchDir.set(direction[0], direction[1], direction[2]).normalize();
  mesh.quaternion.setFromUnitVectors(Y_UP, scratchDir);
  mesh.position.set(
    origin[0] + scratchDir.x * len * 0.5,
    origin[1] + scratchDir.y * len * 0.5,
    origin[2] + scratchDir.z * len * 0.5,
  );
}

function gratingForLaser(room, laser) {
  const id = laser?.userData?.laser?.targetId;
  if (id) {
    const named = room.gratings.find((entry) => entry.name === id);
    if (named) {
      return named;
    }
  }
  return room.gratings[0];
}

function worldNormalTangent(object) {
  object.getWorldQuaternion(scratchQuat);
  scratchN.set(0, 0, 1).applyQuaternion(scratchQuat);
  scratchTan.set(1, 0, 0).applyQuaternion(scratchQuat);
  return {
    n: [scratchN.x, scratchN.y, scratchN.z],
    tan: [scratchTan.x, scratchTan.y, scratchTan.z],
  };
}

export function paintReadout(mesh, text) {
  const readout = mesh?.userData?.readout;
  if (!readout) {
    return mesh;
  }
  const line = String(text ?? '');
  if (readout.text === line && readout.painted) {
    return mesh;
  }
  readout.text = line;
  if (typeof document === 'undefined' || !mesh.material) {
    return mesh;
  }
  let canvas = readout.canvas;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    readout.canvas = canvas;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return mesh;
  }
  ctx.fillStyle = '#041018';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#6ad8ff';
  ctx.font = '18px monospace';
  ctx.fillText(line.slice(0, 64), 16, 40);
  if (line.length > 64) {
    ctx.fillText(line.slice(64, 128), 16, 68);
  }
  if (!readout.texture) {
    readout.texture = new CanvasTexture(canvas);
    mesh.material.map = readout.texture;
    mesh.material.color.setHex(0xffffff);
  }
  readout.texture.needsUpdate = true;
  readout.painted = true;
  mesh.material.needsUpdate = true;
  return mesh;
}

function hitDetectors(room, controller, origin, dir, m, nm, grating, hits, events) {
  let count = hits;
  for (const detector of room.detectors ?? []) {
    const want = detector.userData.detector;
    if (want.order != null && want.order !== m) {
      continue;
    }
    if (want.lambdaNm != null && Math.abs(nm - want.lambdaNm) > (want.lambdaTolNm ?? 8)) {
      continue;
    }
    if (want.requireTilt && !grating.userData.grating.crossTilt) {
      continue;
    }
    if (want.requireNarrowSlit) {
      const slit = room.slits?.[0]?.userData?.slit;
      if ((slit?.width ?? 0.04) > 0.021) {
        continue;
      }
    }
    if (want.gratingId && grating.name !== want.gratingId) {
      continue;
    }
    detector.getWorldPosition(scratchCenter);
    detector.getWorldQuaternion(scratchQuat);
    scratchNormal.set(0, 0, 1).applyQuaternion(scratchQuat);
    const hit = rayHitsDisk(
      origin,
      dir,
      [scratchCenter.x, scratchCenter.y, scratchCenter.z],
      [scratchNormal.x, scratchNormal.y, scratchNormal.z],
      want.radius ?? 0.22,
    );
    if (!hit) {
      continue;
    }
    const wasLit = want.lit;
    want.lit = true;
    want.hold = 0.6;
    count += 1;
    if (!wasLit && controller) {
      controller.flags = controller.flags ?? {};
      if (want.flag) {
        controller.flags[want.flag] = true;
      }
      const portal = want.unlockPortalId ? controller.getPortal(want.unlockPortalId) : null;
      if (portal) {
        portal.enabled = true;
      }
      syncOpticsDoors(controller);
      events?.push('detector-hit');
    }
    detector.traverse((child) => {
      if (child.material?.emissiveIntensity != null) {
        child.material.emissiveIntensity = 1.4;
      }
    });
  }
  return count;
}

function emitOrders(room, grating, laser, incident, beamIndex, hits, controller, events) {
  grating.getWorldPosition(scratchCard);
  const { n, tan } = worldNormalTangent(grating);
  const thetaI = thetaIFrom(incident, n, tan);
  const spec = grating.userData.grating;
  spec.lastThetaI = thetaI;
  spec.lastLambdaNm = laser.userData.laser.lambdaNm;
  const d = groovePitchMeters(spec.linesPerMm);
  const lambdaNm = laser.userData.laser.lambdaNm;
  const lineList = laser.userData.laser.lines;
  const continuum = lambdaNm === 0 && !lineList?.length;
  let bins = continuum ? CONTINUUM_BINS.slice() : (lineList?.length ? lineList : [lambdaNm]);
  if (spec.filterBand) {
    bins = bins.filter((nm) => nm >= spec.filterBand[0] && nm <= spec.filterBand[1]);
  }
  const converters = (room.detectors ?? []).map((entry) => entry.userData.detector?.convert).filter(Boolean);
  const mMax = spec.mMax ?? (lineList?.length > 1 ? 1 : 2);
  const mMin = spec.mMin != null ? spec.mMin : -mMax;
  const thetaB = fromDeg(spec.blazeDeg ?? 0);
  let index = beamIndex;
  let hitCount = hits;
  const origin = [
    scratchCard.x + n[0] * 0.04,
    scratchCard.y + n[1] * 0.04,
    scratchCard.z + n[2] * 0.04,
  ];

  laser.getWorldPosition(scratchLight);
  scratchDir.set(origin[0] - scratchLight.x, origin[1] - scratchLight.y, origin[2] - scratchLight.z);
  const incidentLen = scratchDir.length();
  if (incidentLen > 0.2) {
    scratchDir.multiplyScalar(1 / incidentLen);
    const incRgb = wavelengthToRgb(lambdaNm === 0 ? 550 : (lineList?.[0] ?? lambdaNm));
    const incMesh = ensureBeam(room, index);
    placeBeam(
      incMesh,
      [scratchLight.x, scratchLight.y, scratchLight.z],
      [scratchDir.x, scratchDir.y, scratchDir.z],
      incidentLen,
      rgbColor(incRgb.r != null ? incRgb : { r: 0.91, g: 0.93, b: 0.97 }),
      0.82,
      2.15,
    );
    incMesh.userData.order = 'incident';
    incMesh.userData.gratingId = grating.name;
    index += 1;
  }

  const emit = (m, nm, color, opacity) => {
    const thetaM = diffractionAngle(d, wavelengthMeters(nm), m, thetaI, { mode: spec.mode });
    if (thetaM == null) {
      return;
    }
    const dir = diffractedDirection(n, tan, thetaM);
    const eta = blazeEfficiency(thetaI, thetaM, thetaB);
    const mesh = ensureBeam(room, index);
    placeBeam(mesh, origin, dir, 12, color, Math.max(0.18, opacity * (0.45 + 0.7 * eta)), m === 0 ? 1.35 : 1.15);
    mesh.userData.order = m;
    mesh.userData.lambdaNm = nm;
    mesh.userData.thetaDeg = toDeg(thetaM);
    mesh.userData.gratingId = grating.name;
    index += 1;
    hitCount = hitDetectors(room, controller, origin, dir, m, nm, grating, hitCount, events);
  };

  if (continuum) {
    emit(0, 550, 0xe8eef8, 0.5);
    for (const nm of bins) {
      const rgb = wavelengthToRgb(nm);
      emit(1, nm, rgbColor(rgb), 0.5);
      if ((spec.mMax ?? 1) >= 2) {
        emit(2, nm, rgbColor(rgb), 0.28);
      }
    }
  } else {
    emit(0, bins[0], 0xe8eef8, 0.55);
    for (const nm of bins) {
      const rgb = wavelengthToRgb(nm);
      let opacity = rgb.band === 'visible' ? 0.55 : 0;
      let color = rgb.band === 'visible' ? rgbColor(rgb) : 0x000000;
      if (rgb.band === 'uv' && converters.includes('phosphor')) {
        opacity = 0.5;
        color = 0x40e0c0;
      }
      if (rgb.band === 'ir' && converters.includes('thermal')) {
        opacity = 0.4;
        color = 0x884040;
      }
      for (let m = mMin; m <= mMax; m += 1) {
        if (m === 0) {
          continue;
        }
        emit(m, nm, color, opacity);
      }
    }
  }
  return { beamIndex: index, hits: hitCount };
}

export function tickOptics(rooms, { camera, dt = 0.016, controller, elapsed = 0 } = {}) {
  let beams = 0;
  let hits = 0;
  const events = [];
  let status = null;
  for (const room of rooms ?? []) {
    if (!room?.gratings && room?.scene) {
      indexRoomOptics(room);
    }
    if (!room?.gratings?.length) {
      for (const mesh of room?.orderBeams ?? []) {
        if (mesh) {
          mesh.visible = false;
        }
      }
      continue;
    }

    const armed = (room.lasers ?? []).filter((entry) => entry.userData.laser.enabled);
    const lightOn = armed.length ? 1 : 0.62;
    const firstLaser = armed[0] ?? null;
    if (firstLaser) {
      const target = gratingForLaser(room, firstLaser);
      target.getWorldPosition(scratchCard);
      firstLaser.lookAt(scratchCard);
      firstLaser.getWorldPosition(scratchLight);
      scratchDir.subVectors(scratchCard, scratchLight).normalize();
    } else {
      scratchDir.set(0, -0.15, -1).normalize();
    }

    for (const grating of room.gratings) {
      const spec = grating.userData.grating;
      if (spec.hover) {
        grating.position.y = spec.baseY + Math.sin(elapsed * 0.52) * 0.06 + Math.sin(elapsed * 1.15) * 0.014;
      }
      grating.updateMatrixWorld(true);
      grating.traverse((child) => {
        const material = child.material;
        if (!material?.uniforms) {
          return;
        }
        if (camera) {
          camera.getWorldPosition(scratchOrigin);
          material.uniforms.uViewPos.value.copy(scratchOrigin);
        }
        material.uniforms.uLightDir.value.copy(scratchDir);
        material.uniforms.uLightLambdaNm.value = firstLaser?.userData.laser.lambdaNm ?? 0;
        material.uniforms.uLightOn.value = lightOn;
        material.uniforms.uTime.value = elapsed;
        syncGratingMaterial(material, {
          linesPerMm: spec.linesPerMm,
          blazeDeg: spec.blazeDeg,
          mode: spec.mode,
        });
      });
    }

    let beamIndex = 0;
    if (armed.length) {
      maybeSawEvanescent(room, controller ?? { flags: {} });
      for (const laser of armed) {
        const grating = gratingForLaser(room, laser);
        grating.getWorldPosition(scratchCard);
        laser.lookAt(scratchCard);
        laser.getWorldPosition(scratchLight);
        scratchDir.subVectors(scratchCard, scratchLight).normalize();
        const emitted = emitOrders(
          room,
          grating,
          laser,
          [scratchDir.x, scratchDir.y, scratchDir.z],
          beamIndex,
          hits,
          controller,
          events,
        );
        beamIndex = emitted.beamIndex;
        hits = emitted.hits;
      }
    }
    beams += beamIndex;

    for (const detector of room.detectors ?? []) {
      const want = detector.userData.detector;
      if (!want.lit) {
        continue;
      }
      want.hold = (want.hold ?? 0) - dt;
      if (want.hold <= 0) {
        want.lit = false;
        detector.traverse((child) => {
          if (child.material?.emissiveIntensity != null) {
            child.material.emissiveIntensity = 0.05;
          }
        });
      }
    }

    for (let i = beamIndex; i < (room.orderBeams?.length ?? 0); i += 1) {
      if (room.orderBeams[i]) {
        room.orderBeams[i].visible = false;
      }
    }

    for (const shutter of room.shutters ?? []) {
      const open = Boolean(controller?.flags?.[shutter.userData.shutter.flag]);
      shutter.traverse((child) => {
        if (child.material?.opacity != null) {
          child.material.opacity = open ? 0.05 : 0.45;
          child.material.transparent = true;
        }
        if (open) {
          delete child.userData.collider;
        } else if (child.isMesh) {
          child.userData.collider = { type: 'aabb' };
        }
      });
      if (open && shutter.userData.shutter.portalId && controller) {
        const portal = controller.getPortal(shutter.userData.shutter.portalId);
        if (portal) {
          portal.enabled = true;
        }
      }
    }

    const live = gratingForLaser(room, firstLaser) ?? room.gratings[0];
    const spec = live?.userData?.grating;
    if (spec) {
      const line = formatOpticsStatus({
        linesPerMm: spec.linesPerMm,
        mode: spec.mode,
        lambdaNm: firstLaser ? (spec.lastLambdaNm ?? firstLaser.userData.laser.lambdaNm) : null,
        thetaI: spec.lastThetaI ?? 0,
        order: 1,
        label: spec.label ?? null,
      });
      room.opticsStatus = line;
      if (!status) {
        status = line;
      }
      room._readoutClock = (room._readoutClock ?? 0) + dt;
      if (room._readoutClock >= 0.125) {
        room._readoutClock = 0;
        for (const readout of room.readouts ?? []) {
          paintReadout(readout, line);
        }
      }
    }
  }
  return { beams, hits, events, status };
}
