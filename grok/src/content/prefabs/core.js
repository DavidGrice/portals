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

export const corePrefabs = {
sky(entity) {
    const color = parseColor(entity.props?.color, 0x111111);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(90, 48, 32),
      new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, depthWrite: false }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    applyPose(mesh, entity);
    return mesh;
  },

floor(entity) {
    const color = parseColor(entity.props?.color, 0x333333);
    const size = entity.props?.size ?? 20;
    const material = surfaceMaterial(entity, color, { roughness: 0.94, metalness: 0, line: '#1a1d24', cells: 8 });
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 4;
    material.depthWrite = true;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      material,
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    applyPose(mesh, entity);
    mesh.position.y -= 0.06;
    mesh.renderOrder = -2;
    mesh.userData.materialId = entity.props?.material ?? null;
    mesh.userData.surface = entity.props?.surface ?? resolveMaterial(entity.props?.material)?.surface ?? null;
    return mesh;
  },

box(entity) {
    const color = parseColor(entity.props?.color, 0xffffff);
    const size = entity.props?.size ?? [1, 1, 1];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      entity.props?.material
        ? buildMaterial(entity.props.material, { color })
        : standardMaterial(color, { roughness: 0.45, metalness: 0.12 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    applyPose(mesh, entity);
    mesh.userData.collider = { type: 'aabb' };
    if (entity.props?.scroll) {
      mesh.userData.scroll = entity.props.scroll;
    }
    if (entity.props?.spin) {
      mesh.userData.spin = entity.props.spin;
    }
    return mesh;
  },

light(entity) {
    const group = new THREE.Group();
    applyPose(group, entity);
    const ambient = parseColor(entity.props?.ambient, 0x4a5060);
    const sky = parseColor(entity.props?.sky, 0xc8d4e8);
    const sun = parseColor(entity.props?.sun, 0xfff4e5);
    const hemi = new THREE.HemisphereLight(sky, ambient, (entity.props?.ambientIntensity ?? 0.45) * 1.15);
    hemi.userData.hemiLight = true;
    group.add(hemi);
    group.add(new THREE.AmbientLight(sky, (entity.props?.ambientIntensity ?? 0.45) * 0.22));
    const directional = new THREE.DirectionalLight(sun, entity.props?.sunIntensity ?? 1.05);
    const aim = entity.props?.aim ?? [6, 11, 4];
    directional.position.set(...aim);
    directional.castShadow = Boolean(entity.props?.shadows !== false);
    directional.shadow.mapSize.set(1024, 1024);
    directional.shadow.bias = -0.00035;
    directional.shadow.normalBias = 0.03;
    directional.shadow.camera.near = 0.4;
    directional.shadow.camera.far = 48;
    directional.shadow.camera.left = -16;
    directional.shadow.camera.right = 16;
    directional.shadow.camera.top = 16;
    directional.shadow.camera.bottom = -16;
    group.add(directional);
    const fill = new THREE.DirectionalLight(0x8899bb, 0.18);
    fill.position.set(-5, 4, -3);
    fill.userData.isFillLight = true;
    group.add(fill);
    return group;
  },

point(entity) {
    const light = new THREE.PointLight(
      parseColor(entity.props?.color, 0xffcc88),
      entity.props?.intensity ?? 1.1,
      entity.props?.distance ?? 8,
      entity.props?.decay ?? 2,
    );
    applyPose(light, entity);
    light.userData.localLight = true;
    light.castShadow = entity.props?.shadow === true;
    return light;
  },

spot(entity) {
    const light = new THREE.SpotLight(
      parseColor(entity.props?.color, 0xc8d8ff),
      entity.props?.intensity ?? 1.4,
      entity.props?.distance ?? 14,
      entity.props?.angle ?? 0.55,
      entity.props?.penumbra ?? 0.4,
      entity.props?.decay ?? 2,
    );
    applyPose(light, entity);
    light.target.position.set(...(entity.props?.target ?? [0, 0, -2]));
    light.add(light.target);
    light.userData.localLight = true;
    light.castShadow = entity.props?.shadow === true;
    return light;
  },
};
