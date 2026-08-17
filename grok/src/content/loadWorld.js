import { Scene } from 'three';
import { PortalController } from '../engine/index.js';
import { parseColor, spawnEntity } from './prefabs.js';

export function loadWorld(world, catalog, camera, renderer) {
  const controller = new PortalController({ camera, renderer });

  for (const roomData of world.rooms) {
    const scene = new Scene();
    controller.registerScene(roomData.id, scene, {
      clearColor: parseColor(roomData.clearColor, 0x000000),
      tags: roomData.tags ?? [],
      spawn: roomData.spawn ?? null,
    });

    for (const entity of roomData.entities ?? []) {
      scene.add(spawnEntity(entity, catalog));
    }

    for (const portalData of roomData.portals ?? []) {
      const [width, height] = portalData.size ?? [2, 2];
      const portal = controller.createPortal(width, height, roomData.id, { id: portalData.id });
      if (portalData.position) {
        portal.position.set(...portalData.position);
      }
      if (portalData.yaw) {
        portal.rotation.y = portalData.yaw;
      }
      portal.userData.destinationId = portalData.destinationId;
      portal.enabled = portalData.enabled !== false;
      portal.oneWay = Boolean(portalData.oneWay);
    }
  }

  for (const portal of controller.allPortals) {
    const destination = controller.getPortal(portal.userData.destinationId);
    if (!destination) {
      throw new Error(`Missing destination portal: ${portal.userData.destinationId}`);
    }
    portal.setDestinationPortal(destination);
  }

  controller.setCurrentScene(world.startRoom);
  if (world.startSpawn) {
    controller.setCameraPosition(...world.startSpawn);
  }
  if (world.lookAt) {
    camera.lookAt(...world.lookAt);
  }

  return controller;
}

export function kindsByCategory(catalog) {
  const groups = {};
  for (const [kind, entry] of Object.entries(catalog.kinds ?? {})) {
    const category = entry.category ?? 'uncategorized';
    groups[category] ??= [];
    groups[category].push(kind);
  }
  return groups;
}
