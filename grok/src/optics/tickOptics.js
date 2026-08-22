import {
  AdditiveBlending,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import {
  diffractionAngle,
  diffractedDirection,
  groovePitchMeters,
  rayHitsDisk,
  thetaIFrom,
  toDeg,
  wavelengthMeters,
  wavelengthToRgb,
} from './grating.js';
import { syncGratingMaterial } from './gratingMaterial.js';

const GROOVE_CYCLE = [300, 600, 1200, 1800];
const scratchDir = new Vector3();
const scratchOrigin = new Vector3();
const scratchCenter = new Vector3();
const scratchNormal = new Vector3();
const scratchLight = new Vector3();
const scratchCard = new Vector3();
const scratchTan = new Vector3();
const scratchN = new Vector3();

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

export function applyOpticsInteract(action, { room, spec, controller } = {}) {
  if (!room) {
    return { type: action };
  }
  indexRoomOptics(room);
  controller.flags = controller.flags ?? {};
  if (action === 'arm-laser') {
    const lambda = spec?.lambdaNm;
    for (const laser of room.lasers) {
      const on = lambda == null || laser.userData.laser.lambdaNm === lambda;
      setLaserEnabled(laser, on);
    }
    if (lambda) {
      controller.flags[`armed-${lambda}`] = true;
      controller.flags['tried-green'] = controller.flags['tried-green'] || lambda === 532;
    }
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
    return { type: action, linesPerMm: lines };
  }
  if (action === 'flip-blaze') {
    for (const grating of room.gratings) {
      const g = grating.userData.grating;
      g.blazeDeg = -(g.blazeDeg ?? 17.45);
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

function placeBeam(mesh, origin, direction, length, color) {
  const len = Math.max(0.2, Math.min(length, 14));
  mesh.visible = true;
  mesh.material.color.setHex(color);
  mesh.scale.set(1, len, 1);
  scratchDir.set(direction[0], direction[1], direction[2]).normalize();
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), scratchDir);
  mesh.position.set(
    origin[0] + scratchDir.x * len * 0.5,
    origin[1] + scratchDir.y * len * 0.5,
    origin[2] + scratchDir.z * len * 0.5,
  );
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
    const laser = (room.lasers ?? []).find((entry) => entry.userData.laser.enabled)
      ?? null;
    const lambdaNm = laser?.userData.laser.lambdaNm ?? 0;
    const lightOn = laser ? 1 : 0.28;
    if (laser) {
      const target = room.gratings[0];
      target.getWorldPosition(scratchCard);
      laser.lookAt(scratchCard);
      laser.getWorldPosition(scratchLight);
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
        material.uniforms.uLightLambdaNm.value = lambdaNm;
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
    const grating = room.gratings[0];
    grating.getWorldPosition(scratchCard);
    scratchN.set(0, 0, 1).applyQuaternion(grating.getWorldQuaternion(grating.quaternion.clone()));
    scratchTan.set(1, 0, 0).applyQuaternion(grating.quaternion);
    const n = [scratchN.x, scratchN.y, scratchN.z];
    const tan = [scratchTan.x, scratchTan.y, scratchTan.z];
    const incident = laser
      ? [scratchDir.x, scratchDir.y, scratchDir.z]
      : [0, 0, -1];
    const thetaI = thetaIFrom(incident, n, tan);
    const d = groovePitchMeters(grating.userData.grating.linesPerMm);
    const lambdas = lambdaNm > 0 ? [lambdaNm] : [];
    const mMax = 2;
    for (const nm of lambdas) {
      const lambda = wavelengthMeters(nm);
      const rgb = wavelengthToRgb(nm);
      const visible = rgb.band === 'visible';
      for (let m = -mMax; m <= mMax; m += 1) {
        const thetaM = diffractionAngle(d, lambda, m, thetaI, {
          mode: grating.userData.grating.mode,
        });
        if (thetaM == null) {
          continue;
        }
        const dir = diffractedDirection(n, tan, thetaM);
        const origin = [
          scratchCard.x + n[0] * 0.04,
          scratchCard.y + n[1] * 0.04,
          scratchCard.z + n[2] * 0.04,
        ];
        const mesh = ensureBeam(room, beamIndex);
        const color = m === 0 ? 0xe8eef8 : visible ? rgbColor(rgb) : 0x000000;
        const opacity = visible || m === 0 ? 0.55 : 0;
        mesh.material.opacity = opacity;
        placeBeam(mesh, origin, dir, 10, color);
        mesh.userData.order = m;
        mesh.userData.lambdaNm = nm;
        mesh.userData.thetaDeg = toDeg(thetaM);
        beamIndex += 1;
        beams += 1;

        for (const detector of room.detectors ?? []) {
          const want = detector.userData.detector;
          if (want.order != null && want.order !== m) {
            continue;
          }
          if (want.lambdaNm != null && Math.abs(nm - want.lambdaNm) > (want.lambdaTolNm ?? 8)) {
            continue;
          }
          detector.getWorldPosition(scratchCenter);
          scratchNormal.set(0, 0, 1).applyQuaternion(detector.getWorldQuaternion(detector.quaternion.clone()));
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
          hits += 1;
          if (!wasLit && controller) {
            controller.flags = controller.flags ?? {};
            if (want.flag) {
              controller.flags[want.flag] = true;
            }
            const portal = want.unlockPortalId ? controller.getPortal(want.unlockPortalId) : null;
            if (portal) {
              portal.enabled = true;
            }
          }
          detector.traverse((child) => {
            if (child.material?.emissiveIntensity != null) {
              child.material.emissiveIntensity = 1.4;
            }
          });
        }
      }
    }

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
