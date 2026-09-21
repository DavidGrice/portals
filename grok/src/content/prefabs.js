import { corePrefabs } from './prefabs/core.js';
import { furniturePrefabs } from './prefabs/furniture.js';
import { opticsPrefabs } from './prefabs/optics.js';
import { volumePrefabs } from './prefabs/volumes.js';

export { FRAME, hydrateModel, paintCardPlate, parseColor } from './prefabs/shared.js';

export const prefabs = {
  ...corePrefabs,
  ...volumePrefabs,
  ...furniturePrefabs,
  ...opticsPrefabs,
};

export function spawnEntity(entity, catalog) {
  const kind = catalog.kinds?.[entity.kind];
  if (!kind) {
    throw new Error(`Unknown kind: ${entity.kind}`);
  }
  const build = prefabs[kind.prefab];
  if (!build) {
    throw new Error(`Unknown prefab: ${kind.prefab}`);
  }
  const object = build(entity);
  object.name = entity.id;
  object.userData.kind = entity.kind;
  object.userData.tags = entity.tags ?? kind.tags ?? [];
  object.userData.category = kind.category;
  if (entity.props?.action && !object.userData.interact) {
    object.userData.interact = {
      action: entity.props.action,
      portalId: entity.props.portalId ?? null,
      text: entity.props.text ?? '',
      impulse: entity.props.impulse ?? null,
      setFlag: entity.props.setFlag ?? null,
      require: entity.props.require ?? null,
    };
  }
  return object;
}
