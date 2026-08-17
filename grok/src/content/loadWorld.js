import { Scene } from 'three';
import { PortalController } from '../engine/index.js';
import { parseColor, spawnEntity } from './prefabs.js';
import { attachMotes, setMoteDensity, tintGlow } from '../engine/atmosphere.js';

export function withOrigin(vec, origin) {
  const base = vec ?? [0, 0, 0];
  const shift = origin ?? [0, 0, 0];
  return [base[0] + shift[0], base[1] + shift[1], base[2] + shift[2]];
}

export function loadWorld(world, catalog, camera, renderer) {
  const controller = new PortalController({ camera, renderer });

  for (const roomData of world.rooms) {
    const scene = new Scene();
    const origin = roomData.origin ?? [0, 0, 0];
    controller.registerScene(roomData.id, scene, {
      clearColor: parseColor(roomData.clearColor, 0x000000),
      tags: roomData.tags ?? [],
      spawn: roomData.spawn ?? null,
      title: roomData.title ?? roomData.id,
      origin,
    });

    for (const entity of roomData.entities ?? []) {
      scene.add(spawnEntity({
        ...entity,
        position: withOrigin(entity.position, origin),
      }, catalog));
    }

    for (const portalData of roomData.portals ?? []) {
      const [width, height] = portalData.size ?? [2, 2];
      const portal = controller.createPortal(width, height, roomData.id, { id: portalData.id });
      portal.position.set(...withOrigin(portalData.position, origin));
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

  dressRooms(controller);

  controller.setCurrentScene(world.startRoom);
  if (world.startSpawn) {
    controller.setCameraPosition(...world.startSpawn);
  }
  if (world.lookAt) {
    camera.lookAt(...world.lookAt);
  }

  return controller;
}

export function dressRooms(controller) {
  for (const room of controller.rooms) {
    attachMotes(room, {
      color: room.clearColor,
      origin: room.origin ?? [0, 0, 0],
      half: [7.2, 1.35, 5.6],
    });
    setMoteDensity(room, 1);
    room.scene.traverse((object) => {
      if (!object.userData.portalFrame || !object.userData.coversPortalId) {
        return;
      }
      const portal = controller.getPortal(object.userData.coversPortalId);
      const destRoom = controller.rooms.find((entry) => entry.scene === portal?.destinationPortal?.scene);
      if (destRoom) {
        tintGlow(object, destRoom.clearColor);
      }
    });
  }
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
