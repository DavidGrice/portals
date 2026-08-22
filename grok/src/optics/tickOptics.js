import {
  AdditiveBlending,
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
  fromDeg,
  groovePitchMeters,
  rayHitsDisk,
  thetaIFrom,
  toDeg,
  wavelengthMeters,
  wavelengthToRgb,
} from './grating.js';
import { syncGratingMaterial } from './gratingMaterial.js';

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
];

export function indexRoomOptics(room) {
  if (!room?.scene) {
    return room;
  }
  const gratings = [];
  const lasers = [];
  const detectors = [];
  const readouts = [];
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
  });
  room.gratings = gratings;
  room.lasers = lasers;
  room.detectors = detectors;
  room.readouts = readouts;
  room.orderBeams = room.orderBeams ?? [];
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
  if (action === 'lock-spin') {
    for (const grating of room.gratings) {
      lockGratingSpin(grating, true);
    }
    controller.flags['spin-locked'] = true;
    return { type: action };
  }
  if (action === 'free-spin') {
    for (const grating of room.gratings) {
      lockGratingSpin(grating, false);
    }
    controller.flags['spin-locked'] = false;
    return { type: action };
  }
  if (action === 'set-grooves') {
    if (spec?.require && !controller.flags[spec.require]) {
      return { type: action, ok: false, need: spec.require };
    }
    let lines = null;
    for (const grating of room.gratings) {
      lines = cycleGrooves(grating);
    }
    maybeSawEvanescent(room, controller);
    return { type: action, linesPerMm: lines };
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
  if (action === 'yaw-left' || action === 'yaw-right') {
    if (!controller.flags['spin-locked']) {
      return { type: action, ok: false, need: 'spin-locked' };
    }
    const delta = (spec?.deltaYaw ?? 0.5) * (Math.PI / 180) * (action === 'yaw-left' ? 1 : -1);
    for (const grating of room.gratings) {
      grating.rotation.y += delta;
    }
    return { type: action };
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
      new CylinderGeometry(0.018, 0.018, 1, 8, 1, true),
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
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

function placeBeam(mesh, origin, direction, length, color, opacity = 0.55) {
  const len = Math.max(0.2, Math.min(length, 14));
  mesh.visible = opacity > 0.02;
  mesh.material.color.setHex(color);
  mesh.material.opacity = opacity;
  mesh.scale.set(1, len, 1);
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

function hitDetectors(room, controller, origin, dir, m, nm, grating, hits) {
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
    }
    detector.traverse((child) => {
      if (child.material?.emissiveIntensity != null) {
        child.material.emissiveIntensity = 1.4;
      }
    });
  }
  return count;
}

function emitOrders(room, grating, laser, incident, beamIndex, hits, controller) {
  grating.getWorldPosition(scratchCard);
  const { n, tan } = worldNormalTangent(grating);
  const thetaI = thetaIFrom(incident, n, tan);
  const spec = grating.userData.grating;
  const d = groovePitchMeters(spec.linesPerMm);
  const lambdaNm = laser.userData.laser.lambdaNm;
  const continuum = lambdaNm === 0;
  const bins = continuum ? CONTINUUM_BINS : [lambdaNm];
  const mMax = spec.mMax ?? 2;
  const mMin = spec.mMin != null ? spec.mMin : -mMax;
  const thetaB = fromDeg(spec.blazeDeg ?? 0);
  let index = beamIndex;
  let hitCount = hits;
  const origin = [
    scratchCard.x + n[0] * 0.04,
    scratchCard.y + n[1] * 0.04,
    scratchCard.z + n[2] * 0.04,
  ];

  const emit = (m, nm, color, opacity) => {
    const thetaM = diffractionAngle(d, wavelengthMeters(nm), m, thetaI, { mode: spec.mode });
    if (thetaM == null) {
      return;
    }
    const dir = diffractedDirection(n, tan, thetaM);
    const eta = blazeEfficiency(thetaI, thetaM, thetaB);
    const mesh = ensureBeam(room, index);
    placeBeam(mesh, origin, dir, 10, color, Math.max(0.12, opacity * (0.35 + 0.65 * eta)));
    mesh.userData.order = m;
    mesh.userData.lambdaNm = nm;
    mesh.userData.thetaDeg = toDeg(thetaM);
    mesh.userData.gratingId = grating.name;
    index += 1;
    hitCount = hitDetectors(room, controller, origin, dir, m, nm, grating, hitCount);
  };

  if (continuum) {
    emit(0, 550, 0xe8eef8, 0.5);
    for (const nm of bins) {
      const rgb = wavelengthToRgb(nm);
      emit(1, nm, rgbColor(rgb), 0.5);
    }
  } else {
    const rgb = wavelengthToRgb(lambdaNm);
    const visible = rgb.band === 'visible';
    const color0 = 0xe8eef8;
    emit(0, lambdaNm, color0, 0.55);
    for (let m = mMin; m <= mMax; m += 1) {
      if (m === 0) {
        continue;
      }
      emit(m, lambdaNm, visible ? rgbColor(rgb) : 0x000000, visible ? 0.55 : 0);
    }
  }
  return { beamIndex: index, hits: hitCount };
}

export function tickOptics(rooms, { camera, dt = 0.016, controller, elapsed = 0 } = {}) {
  let beams = 0;
  let hits = 0;
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
    const lightOn = armed.length ? 1 : 0.28;
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
        grating.position.y = spec.baseY + Math.sin(elapsed * 0.7) * 0.03;
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
  }
  return { beams, hits };
}
