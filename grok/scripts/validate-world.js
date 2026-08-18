import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

export function validateWorld(world, catalog, materials = null) {
  const errors = [];
  if (!world?.id) {
    errors.push('world.id is required');
  }
  if (!world?.startRoom) {
    errors.push('world.startRoom is required');
  }
  const rooms = world?.rooms ?? [];
  const roomIds = new Set();
  const portalIds = new Map();

  for (const room of rooms) {
    if (!room.id) {
      errors.push('room is missing id');
      continue;
    }
    if (roomIds.has(room.id)) {
      errors.push(`duplicate room id: ${room.id}`);
    }
    roomIds.add(room.id);
    for (const entity of room.entities ?? []) {
      if (!entity.id || !entity.kind) {
        errors.push(`room ${room.id} has an entity without id/kind`);
        continue;
      }
      if (!catalog.kinds?.[entity.kind]) {
        errors.push(`unknown kind ${entity.kind} on ${entity.id}`);
      }
      const materialId = entity.props?.material;
      if (materialId && materials?.materials && !materials.materials[materialId]) {
        errors.push(`unknown material ${materialId} on ${entity.id}`);
      }
    }
    for (const portal of room.portals ?? []) {
      if (!portal.id || !portal.destinationId) {
        errors.push(`room ${room.id} has a portal without id/destinationId`);
        continue;
      }
      if (portalIds.has(portal.id)) {
        errors.push(`duplicate portal id: ${portal.id}`);
      }
      portalIds.set(portal.id, portal.destinationId);
    }
  }

  if (world.startRoom && !roomIds.has(world.startRoom)) {
    errors.push(`startRoom missing: ${world.startRoom}`);
  }

  for (const [id, destinationId] of portalIds) {
    if (!portalIds.has(destinationId)) {
      errors.push(`portal ${id} points at missing ${destinationId}`);
    }
  }

  return errors;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const catalog = readJson('data/catalog.json');
  const materials = readJson('data/materials.json');
  const index = readJson('data/worlds/index.json');
  let failed = false;
  for (const entry of index.worlds ?? []) {
    const world = readJson(`data/worlds/${entry.file}`);
    if (world.generated) {
      console.log(`skip ${entry.id} generated stub`);
      continue;
    }
    const errors = validateWorld(world, catalog, materials);
    if (errors.length) {
      console.error(`${entry.id}:\n${errors.join('\n')}`);
      failed = true;
      continue;
    }
    console.log(`ok ${entry.id} ${world.rooms.length} rooms, ${Object.keys(catalog.kinds).length} kinds`);
  }
  if (failed) {
    process.exit(1);
  }
}
