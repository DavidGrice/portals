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

export const furniturePrefabs = {
water(entity) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(entity.props?.width ?? 8, 0.08, entity.props?.depth ?? 8),
      new THREE.MeshPhysicalMaterial({
        color: parseColor(entity.props?.color, 0x143038),
        roughness: 0.08,
        metalness: 0.04,
        transmission: 0.55,
        thickness: 0.2,
        ior: 1.33,
        transparent: true,
        opacity: 0.82,
      }),
    );
    applyPose(mesh, entity);
    mesh.userData.water = true;
    mesh.userData.collider = { type: 'aabb' };
    return mesh;
  },

column(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0xc8b898), { roughness: 0.72 });
    const h = entity.props?.height ?? 3.4;
    const r = entity.props?.radius ?? 0.22;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 10), material);
    shaft.position.y = h * 0.5;
    shaft.castShadow = true;
    shaft.userData.collider = { type: 'aabb' };
    group.add(shaft);
    addBox(group, material, 0, 0.08, 0, r * 2.4, 0.16, r * 2.4);
    addBox(group, material, 0, h, 0, r * 2.2, 0.12, r * 2.2);
    return group;
  },

pipe(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const material = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0x6a7068), { roughness: 0.4, metalness: 0.65 });
    const length = entity.props?.length ?? 3.2;
    const r = entity.props?.radius ?? 0.12;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, length, 8), material);
    tube.rotation.z = Math.PI / 2;
    tube.position.y = entity.props?.lift ?? 2.4;
    tube.castShadow = true;
    group.add(tube);
    return group;
  },

chair(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const wood = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0x3a2818), { roughness: 0.86 });
    const cloth = entity.props?.upholstery
      ? buildMaterial(entity.props.upholstery)
      : standardMaterial(parseColor(entity.props?.cloth, 0x4a1828), { roughness: 0.9 });
    addBox(group, wood, 0, 0.24, 0, 0.48, 0.06, 0.48);
    addBox(group, wood, -0.2, 0.12, -0.2, 0.06, 0.24, 0.06);
    addBox(group, wood, 0.2, 0.12, -0.2, 0.06, 0.24, 0.06);
    addBox(group, wood, -0.2, 0.12, 0.2, 0.06, 0.24, 0.06);
    addBox(group, wood, 0.2, 0.12, 0.2, 0.06, 0.24, 0.06);
    addBox(group, cloth, 0, 0.58, -0.2, 0.46, 0.62, 0.07);
    addBox(group, cloth, 0, 0.28, 0, 0.44, 0.05, 0.42);
    group.userData.collider = { type: 'aabb' };
    return group;
  },

table(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const wood = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0x3a2818), { roughness: 0.84 });
    const w = entity.props?.width ?? 2.4;
    const d = entity.props?.depth ?? 1.05;
    const h = entity.props?.height ?? 0.76;
    addBox(group, wood, 0, h, 0, w, 0.07, d);
    addBox(group, wood, -w * 0.42, h * 0.48, -d * 0.38, 0.08, h * 0.96, 0.08);
    addBox(group, wood, w * 0.42, h * 0.48, -d * 0.38, 0.08, h * 0.96, 0.08);
    addBox(group, wood, -w * 0.42, h * 0.48, d * 0.38, 0.08, h * 0.96, 0.08);
    addBox(group, wood, w * 0.42, h * 0.48, d * 0.38, 0.08, h * 0.96, 0.08);
    group.userData.collider = { type: 'aabb' };
    return group;
  },

sideboard(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const wood = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0x322418), { roughness: 0.86 });
    addBox(group, wood, 0, 0.48, 0, 1.8, 0.96, 0.46);
    addBox(group, wood, 0, 1.02, 0, 1.86, 0.08, 0.5);
    group.userData.collider = { type: 'aabb' };
    return group;
  },

portrait(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const frame = standardMaterial(parseColor(entity.props?.frame, 0x4a3820), { roughness: 0.5, metalness: 0.2 });
    const canvas = standardMaterial(parseColor(entity.props?.color, 0x3a2a28), { roughness: 0.8 });
    addBox(group, frame, 0, 1.45, 0, 0.86, 1.05, 0.06);
    addBox(group, canvas, 0, 1.45, 0.02, 0.68, 0.86, 0.02, false);
    return group;
  },

curtain(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const cloth = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0x4a1828), { roughness: 0.92 });
    addBox(group, cloth, -0.28, 1.15, 0, 0.34, 2.2, 0.08);
    addBox(group, cloth, 0.28, 1.15, 0, 0.34, 2.2, 0.08);
    addBox(group, cloth, 0, 2.28, 0, 0.9, 0.08, 0.1);
    return group;
  },

window(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const frame = standardMaterial(parseColor(entity.props?.frame, 0x3a2a1c), { roughness: 0.6, metalness: 0.08 });
    const night = standardMaterial(parseColor(entity.props?.color, 0x6a88a8), { roughness: 0.15, metalness: 0.05 });
    addBox(group, frame, 0, 1.35, 0, 1.15, 1.5, 0.08);
    addBox(group, night, 0, 1.35, 0.02, 0.92, 1.26, 0.02, false);
    addBox(group, frame, 0, 1.35, 0.03, 0.05, 1.26, 0.03, false);
    addBox(group, frame, 0, 1.35, 0.03, 0.92, 0.05, 0.03, false);
    group.userData.window = true;
    return group;
  },

rug(entity) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(entity.props?.width ?? 2.8, 0.03, entity.props?.depth ?? 1.4),
      entity.props?.material
        ? buildMaterial(entity.props.material)
        : standardMaterial(parseColor(entity.props?.color, 0x4a1824), { roughness: 0.95 }),
    );
    applyPose(mesh, entity);
    mesh.position.y = entity.position?.[1] ?? 0.02;
    mesh.receiveShadow = true;
    mesh.userData.collider = { type: 'aabb' };
    return mesh;
  },

books(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const colors = [0x3a2030, 0x2a3040, 0x4a3820, 0x203028];
    for (let i = 0; i < 5; i += 1) {
      addBox(group, standardMaterial(colors[i % colors.length], { roughness: 0.88 }), (i - 2) * 0.09, 0.16, 0, 0.08, 0.32, 0.22);
    }
    return group;
  },

trunk(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const wood = entity.props?.material
      ? buildMaterial(entity.props.material)
      : standardMaterial(parseColor(entity.props?.color, 0x4a3420), { roughness: 0.88 });
    const iron = buildMaterial('haunt.iron');
    addBox(group, wood, 0, 0.32, 0, 1.15, 0.64, 0.62);
    addBox(group, iron, 0, 0.64, 0, 1.18, 0.05, 0.64);
    group.userData.collider = { type: 'aabb' };
    return group;
  },

plaque(entity) {
    const color = parseColor(entity.props?.color, 0xcfd3e5);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.7, 0.06),
      standardMaterial(color, { roughness: 0.5, metalness: 0.15 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    applyPose(mesh, entity);
    mesh.userData.plaque = entity.props?.text ?? '';
    return mesh;
  },

pad(entity) {
    const color = parseColor(entity.props?.color, 0xb5abfc);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20),
      standardMaterial(color, { roughness: 0.35, metalness: 0.2 }),
    );
    applyPose(mesh, entity);
    mesh.userData.interact = {
      action: entity.props?.action ?? 'look',
      portalId: entity.props?.portalId ?? null,
      text: entity.props?.text ?? '',
      impulse: entity.props?.impulse ?? null,
      setFlag: entity.props?.setFlag ?? null,
      require: entity.props?.require ?? null,
      lambdaNm: entity.props?.lambdaNm ?? null,
      deltaYaw: entity.props?.deltaYaw ?? null,
      answer: entity.props?.answer ?? null,
    };
    return mesh;
  },

glass(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const width = entity.props?.width ?? 1.72;
    const height = entity.props?.height ?? 2.05;
    const frameT = 0.07;
    const depth = 0.09;
    const frameColor = parseColor(entity.props?.frame, 0x8a93a8);
    const tint = parseColor(entity.props?.color, 0xb8d4e8);
    const frame = entity.props?.frameMaterial
      ? buildMaterial(entity.props.frameMaterial)
      : standardMaterial(frameColor, { roughness: 0.32, metalness: 0.62 });
    addBox(group, frame, 0, height / 2, 0, width + frameT, frameT, depth, false);
    addBox(group, frame, 0, -height / 2, 0, width + frameT, frameT, depth, false);
    addBox(group, frame, -width / 2, 0, 0, frameT, height, depth, false);
    addBox(group, frame, width / 2, 0, 0, frameT, height, depth, false);

    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(width - frameT, height - frameT),
      new THREE.MeshPhysicalMaterial({
        color: tint,
        metalness: 0.04,
        roughness: 0.06,
        transmission: 0.82,
        thickness: 0.045,
        ior: 1.5,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: true,
      }),
    );
    pane.userData.glass = true;
    group.add(pane);

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(width + frameT, height + frameT, 0.08),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    slab.userData.collider = { type: 'aabb' };
    group.add(slab);
    return group;
  },

screen(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const width = entity.props?.width ?? 0.92;
    const height = entity.props?.height ?? 0.54;
    const bezel = 0.045;
    const frameColor = parseColor(entity.props?.frame, 0x1a1c22);
    const housing = standardMaterial(frameColor, { roughness: 0.42, metalness: 0.38 });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width + bezel * 2, height + bezel * 2, 0.08),
      housing,
    );
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.collider = { type: 'aabb' };
    group.add(body);

    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color: 0x101218 }),
    );
    surface.position.z = 0.044;
    surface.userData.screenSurface = true;
    group.add(surface);

    if (entity.props?.stand !== false) {
      addBox(group, housing, 0, -(height / 2 + 0.24), 0, 0.08, 0.42, 0.08);
      addBox(group, housing, 0, -(height / 2 + 0.46), 0.02, 0.42, 0.05, 0.22);
    }

    group.userData.screen = {
      cameraPosition: entity.props?.cameraPosition ?? [4.8, 2.3, 5.2],
      lookAt: entity.props?.lookAt ?? [0, 1.05, 0.2],
      fov: entity.props?.fov ?? 58,
      width: entity.props?.resolution?.[0] ?? 320,
      height: entity.props?.resolution?.[1] ?? 180,
      video: entity.props?.video ?? null,
    };
    return group;
  },

hearth(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const width = entity.props?.width ?? 1.85;
    const height = entity.props?.height ?? 1.45;
    const depth = entity.props?.depth ?? 0.58;
    const stone = parseColor(entity.props?.color, 0x3a322c);
    const ember = parseColor(entity.props?.ember, 0xff6a22);
    const mat = standardMaterial(stone, { roughness: 0.92, metalness: 0.06 });
    addBox(group, mat, 0, height * 0.5, -depth * 0.42, width, height, 0.16);
    addBox(group, mat, -width * 0.5 + 0.08, height * 0.38, 0.02, 0.16, height * 0.76, depth);
    addBox(group, mat, width * 0.5 - 0.08, height * 0.38, 0.02, 0.16, height * 0.76, depth);
    addBox(group, mat, 0, 0.08, 0.04, width - 0.1, 0.16, depth);
    addBox(group, mat, 0, height * 0.84, 0.06, width + 0.14, 0.12, depth + 0.08);

    const wood = standardMaterial(parseColor(entity.props?.wood, 0x4a3020), { roughness: 0.9, metalness: 0 });
    const log = (y, z, yaw) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.68, 8), wood);
      mesh.rotation.z = Math.PI / 2;
      mesh.rotation.y = yaw;
      mesh.position.set(0, y, z);
      mesh.castShadow = true;
      group.add(mesh);
    };
    log(0.22, 0.08, 0.22);
    log(0.28, 0, -0.32);

    const count = entity.props?.flames ?? 18;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const lives = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 0.52;
      positions[i * 3 + 1] = 0.26 + Math.random() * 0.4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.16;
      lives[i] = Math.random();
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const flames = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: ember,
        size: 0.09,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    flames.frustumCulled = false;
    flames.userData.flames = { lives, rise: 0.95 };
    group.add(flames);

    const light = new THREE.PointLight(ember, entity.props?.intensity ?? 1.45, 9, 2);
    light.position.set(0, 0.55, 0.14);
    light.userData.fireLight = true;
    group.add(light);
    group.userData.fire = {
      base: entity.props?.intensity ?? 1.45,
      seed: Math.random() * Math.PI * 2,
    };
    return group;
  },

candle(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const wax = standardMaterial(parseColor(entity.props?.color, 0xe8d8b8), { roughness: 0.72, metalness: 0 });
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.22, 8), wax);
    stick.position.y = 0.11;
    stick.castShadow = true;
    group.add(stick);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc66 }),
    );
    flame.position.y = 0.24;
    flame.scale.set(0.65, 1.35, 0.65);
    group.add(flame);
    const light = new THREE.PointLight(0xffb060, entity.props?.intensity ?? 0.32, 3.6, 2);
    light.position.y = 0.26;
    light.userData.fireLight = true;
    group.add(light);
    group.userData.fire = {
      base: entity.props?.intensity ?? 0.32,
      seed: Math.random() * 10,
      candle: true,
    };
    return group;
  },

ring(entity) {
    const radius = entity.props?.radius ?? 1.85;
    const tube = entity.props?.tube ?? 0.16;
    const color = parseColor(entity.props?.color, 0xc8b090);
    const group = new THREE.Group();
    applyPose(group, entity);
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 18, 64),
      entity.props?.material
        ? buildMaterial(entity.props.material, { color })
        : standardMaterial(color, { roughness: 0.28, metalness: 0.88, emissive: color, emissiveIntensity: 0.35 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.materialId = entity.props?.material ?? null;
    group.add(mesh);
    if (entity.props?.horizon !== false) {
      const inner = Math.max(0.25, radius - tube * 0.9);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(inner, 48),
        buildMaterial(entity.props?.horizonMaterial ?? 'scifi.horizon', { color: 0x88c8ff }),
      );
      disc.material.side = THREE.DoubleSide;
      disc.material.transparent = true;
      disc.material.depthWrite = false;
      disc.renderOrder = 1;
      disc.userData.horizon = true;
      disc.userData.materialId = entity.props?.horizonMaterial ?? 'scifi.horizon';
      group.add(disc);
    }
    group.userData.ring = { radius, tube };
    return group;
  },

model(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const size = entity.props?.size ?? [1, 1.6, 0.8];
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      standardMaterial(parseColor(entity.props?.color, 0x2a2a2a), { roughness: 0.85, metalness: 0.05 }),
    );
    proxy.castShadow = true;
    proxy.userData.collider = { type: 'aabb' };
    proxy.userData.modelProxy = true;
    group.add(proxy);
    group.userData.model = { src: entity.props?.src ?? null, size };
    if (entity.props?.src && typeof document !== 'undefined') {
      hydrateModel(group).catch(() => {});
    }
    return group;
  },

npc(entity) {
    const size = entity.props?.size ?? [0.5, 1.6, 0.4];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      standardMaterial(parseColor(entity.props?.color, 0x3a3030), { roughness: 0.8, metalness: 0.04 }),
    );
    applyPose(mesh, entity);
    mesh.position.y = (entity.position?.[1] ?? 0) + size[1] * 0.5;
    mesh.userData.collider = { type: 'aabb' };
    mesh.userData.npc = { lookAtPlayer: entity.props?.lookAtPlayer !== false };
    return mesh;
  },
};
