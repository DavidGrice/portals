import * as THREE from 'three';
import { buildMaterial, resolveMaterial } from '../materials.js';
import { makeRecipeTexture } from '../tiles.js';
import { addColonnade, addRectVolume, addStairs, addWallWithHoles } from '../volumes.js';
import { createGratingMaterial } from '../../optics/gratingMaterial.js';
import { wavelengthToRgb } from '../../optics/grating.js';
import {
  FRAME,
  addBox,
  addOpeningWall,
  addRunningLights,
  addSideWall,
  applyPose,
  attachRunningLights,
  foilMaterial,
  hydrateModel,
  paintCardPlate,
  paintYoungDiagram,
  parseColor,
  rotundaWallName,
  roundedRectPath,
  standardMaterial,
  surfaceMaterial,
  volumeMaterial,
} from './shared.js';

export const opticsPrefabs = {
dais(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const radius = entity.props?.radius ?? 2.5;
    const height = entity.props?.height ?? 0.16;
    const metal = buildMaterial(entity.props?.material ?? 'scifi.hull');
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.06, height, 48), metal);
    disc.position.y = height * 0.5;
    disc.receiveShadow = true;
    disc.castShadow = true;
    group.add(disc);
    const well = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.52, radius * 0.52, 0.03, 40),
      buildMaterial('optics.card'),
    );
    well.position.y = height + 0.01;
    well.receiveShadow = true;
    group.add(well);
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.045, 10, 64),
      buildMaterial(entity.props?.stripMaterial ?? 'optics.strip'),
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = height + 0.02;
    lip.userData.runningLight = true;
    group.add(lip);
    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.52, 0.03, 8, 48),
      buildMaterial('optics.foil'),
    );
    inner.rotation.x = Math.PI / 2;
    inner.position.y = height + 0.03;
    group.add(inner);
    return group;
  },

grating(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const width = entity.props?.width ?? 1.62;
    const height = entity.props?.height ?? 2.36;
    const thickness = entity.props?.thickness ?? 0.058;
    const linesPerMm = entity.props?.linesPerMm ?? 600;
    const blazeDeg = entity.props?.blazeDeg ?? 10.37;
    const mode = entity.props?.mode ?? 'reflect';
    const portrait = height >= width * 0.95;
    const corner = portrait ? 0.09 : 0.05;
    const border = portrait ? Math.min(0.12, width * 0.09) : 0.05;
    const nameH = portrait ? 0.2 : 0;
    const artW = Math.max(0.2, width - border * 2);
    const artH = Math.max(0.2, height - border * 2 - nameH);
    const artY = portrait ? -nameH * 0.42 : 0;
    const label = entity.props?.options?.[0]?.label ?? `${linesPerMm} /mm ${mode}`;
    const stock = buildMaterial('optics.card');
    stock.color.setHex(0x16181c);
    stock.metalness = 0.92;
    stock.roughness = 0.22;
    const bodyShape = roundedRectPath(THREE.Shape, width * 0.98, height * 0.98, corner);
    const body = new THREE.Mesh(
      new THREE.ExtrudeGeometry(bodyShape, {
        depth: thickness * 0.72,
        bevelEnabled: true,
        bevelThickness: 0.006,
        bevelSize: 0.008,
        bevelSegments: 2,
        curveSegments: 10,
      }),
      stock,
    );
    body.position.z = -thickness * 0.36;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.collider = { type: 'aabb' };
    group.add(body);

    const frameShape = roundedRectPath(THREE.Shape, width, height, corner);
    frameShape.holes.push(roundedRectPath(THREE.Path, artW + 0.01, artH + nameH + 0.02, corner * 0.55));
    const rim = foilMaterial(portrait ? 'optics.foil' : 'optics.rim');
    const frame = new THREE.Mesh(
      new THREE.ExtrudeGeometry(frameShape, {
        depth: thickness,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.012,
        bevelSegments: 2,
        curveSegments: 12,
      }),
      rim,
    );
    frame.position.z = -thickness * 0.5;
    frame.castShadow = true;
    frame.receiveShadow = true;
    group.add(frame);

    const gratingMat = createGratingMaterial({ linesPerMm, blazeDeg, mode, lightOn: 0.72 });
    const faceShape = roundedRectPath(THREE.Shape, artW, artH, corner * 0.45);
    const faceGeo = new THREE.ShapeGeometry(faceShape, 18);
    const face = new THREE.Mesh(faceGeo, gratingMat);
    face.position.set(0, artY, thickness * 0.5 + 0.002);
    face.castShadow = false;
    face.receiveShadow = false;
    face.userData.gratingFace = true;
    group.add(face);
    const back = new THREE.Mesh(faceGeo, gratingMat);
    back.position.set(0, artY, -(thickness * 0.5 + 0.002));
    back.rotation.y = Math.PI;
    back.castShadow = false;
    back.receiveShadow = false;
    back.userData.gratingFace = true;
    group.add(back);

    let plate = null;
    if (portrait) {
      plate = new THREE.Mesh(
        new THREE.PlaneGeometry(artW * 0.92, Math.max(0.1, nameH * 0.62)),
        new THREE.MeshStandardMaterial({ color: 0x120e08, roughness: 0.35, metalness: 0.6 }),
      );
      plate.position.set(0, height * 0.5 - border - nameH * 0.42, thickness * 0.5 + 0.004);
      plate.castShadow = false;
      group.add(plate);
      paintCardPlate(plate, label);

      const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 1.55, height * 1.45),
        new THREE.MeshBasicMaterial({
          color: 0x6ad8ff,
          transparent: true,
          opacity: 0.07,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      halo.position.z = -0.08;
      halo.renderOrder = -1;
      halo.userData.cardHalo = true;
      group.add(halo);

      const glow = new THREE.PointLight(0xe8c86a, 0.55, 3.6, 2);
      glow.position.set(0, 0.1, 0.35);
      glow.userData.localLight = true;
      glow.castShadow = false;
      group.add(glow);
    }

    group.userData.grating = {
      linesPerMm,
      blazeDeg,
      mode,
      hover: entity.props?.hover === true,
      baseY: entity.position?.[1] ?? group.position.y,
      locked: true,
      mMin: entity.props?.mMin ?? null,
      mMax: entity.props?.mMax ?? null,
      crossTilt: false,
      options: entity.props?.options ?? null,
      optionIndex: 0,
      label,
      width,
      height,
      plate,
    };
    return group;
  },

laser(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const lambdaNm = entity.props?.lambdaNm ?? 532;
    const rgb = wavelengthToRgb(lambdaNm);
    const color = lambdaNm === 0
      ? 0xe8eef8
      : (Math.round(rgb.r * 255) << 16) + (Math.round(rgb.g * 255) << 8) + Math.round(rgb.b * 255);
    const metal = buildMaterial('scifi.cabin');
    const stand = buildMaterial('scifi.armor');
    addBox(group, stand, 0, 0.06, 0.12, 0.42, 0.08, 0.42);
    const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.34, 12), metal);
    yoke.position.set(0, 0.24, 0.12);
    group.add(yoke);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.62, 16), metal);
    barrel.rotation.x = -Math.PI / 2;
    barrel.position.set(0, 0.42, 0.08);
    barrel.castShadow = true;
    group.add(barrel);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.06, 16), foilMaterial('optics.rim'));
    collar.rotation.x = -Math.PI / 2;
    collar.position.set(0, 0.42, 0.36);
    group.add(collar);
    const aperture = new THREE.Mesh(
      new THREE.CircleGeometry(0.048, 24),
      new THREE.MeshStandardMaterial({
        color: color || 0x888888,
        emissive: color || 0x222222,
        emissiveIntensity: 0.08,
        roughness: 0.18,
        metalness: 0.2,
      }),
    );
    aperture.position.set(0, 0.42, 0.4);
    aperture.userData.laserAperture = true;
    group.add(aperture);
    const spot = new THREE.SpotLight(color || 0xffffff, 0, 22, 0.035, 0.12, 1);
    spot.position.set(0, 0.42, 0.4);
    spot.castShadow = false;
    group.add(spot);
    group.userData.laser = {
      lambdaNm,
      lines: entity.props?.lines ?? null,
      enabled: entity.props?.enabled === true,
      beamWidth: entity.props?.beamWidth ?? 0.04,
      power: entity.props?.power ?? 1,
      targetId: entity.props?.targetId ?? null,
    };
    group.userData.collider = { type: 'aabb' };
    return group;
  },

detector(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const lambdaNm = entity.props?.lambdaNm ?? 532;
    const rgb = wavelengthToRgb(lambdaNm);
    const color = lambdaNm ? (Math.round(rgb.r * 255) << 16) + (Math.round(rgb.g * 255) << 8) + Math.round(rgb.b * 255) : 0xe8eef8;
    const bezel = buildMaterial('scifi.tile');
    addBox(group, bezel, 0, 0, 0.02, 0.55, 0.55, 0.06);
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(entity.props?.radius ?? 0.22, 24),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.05,
        roughness: 0.35,
        metalness: 0.2,
      }),
    );
    face.position.z = 0.06;
    group.add(face);
    group.userData.detector = {
      lambdaNm: entity.props?.lambdaNm ?? null,
      order: entity.props?.order ?? 1,
      toleranceDeg: entity.props?.toleranceDeg ?? 2.5,
      lambdaTolNm: entity.props?.lambdaTolNm ?? 8,
      radius: entity.props?.radius ?? 0.22,
      flag: entity.props?.flag ?? null,
      unlockPortalId: entity.props?.unlockPortalId ?? null,
      gratingId: entity.props?.gratingId ?? null,
      requireTilt: entity.props?.requireTilt === true,
      requireNarrowSlit: entity.props?.requireNarrowSlit === true,
      convert: entity.props?.convert ?? null,
      lit: false,
      hold: 0,
    };
    return group;
  },

slit(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const metal = buildMaterial('scifi.cabin');
    const width = entity.props?.width ?? 0.04;
    addBox(group, metal, -0.55, 1.1, 0, 0.9, 2.2, 0.08);
    addBox(group, metal, 0.55, 1.1, 0, 0.9, 2.2, 0.08);
    group.userData.slit = { width };
    return group;
  },

shutter(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const width = entity.props?.width ?? 2.1;
    const height = entity.props?.height ?? 2.3;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, 0.08),
      buildMaterial('glass.pane'),
    );
    mesh.position.y = height * 0.5;
    mesh.material.transparent = true;
    mesh.material.opacity = 0.45;
    mesh.userData.collider = { type: 'aabb' };
    group.add(mesh);
    group.userData.shutter = {
      flag: entity.props?.flag ?? 'exit-532',
      portalId: entity.props?.portalId ?? null,
    };
    return group;
  },

protractor(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const radius = entity.props?.radius ?? 2.4;
    const ticks = buildMaterial('optics.ticks');
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 8, 64), ticks);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      const len = deg % 15 === 0 ? 0.18 : 0.08;
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, len), ticks);
      mark.position.set(Math.sin(rad) * radius, 0.03, -Math.cos(rad) * radius);
      mark.rotation.y = -rad;
      group.add(mark);
    }
    group.userData.protractor = { radius };
    return group;
  },

readout(entity) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(entity.props?.width ?? 1.8, entity.props?.height ?? 0.42),
      new THREE.MeshBasicMaterial({ color: 0x041018 }),
    );
    applyPose(mesh, entity);
    mesh.userData.readout = { text: entity.props?.text ?? 'NO SOURCE' };
    return mesh;
  },

diagram(entity) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(entity.props?.width ?? 2.6, entity.props?.height ?? 0.9),
      new THREE.MeshBasicMaterial({ color: 0x041018 }),
    );
    applyPose(mesh, entity);
    mesh.userData.diagram = { kind: entity.props?.kind ?? 'young' };
    paintYoungDiagram(mesh);
    return mesh;
  },
};
