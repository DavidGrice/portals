import { Color, FogExp2 } from 'three';
import generatorConfig from '../../data/generators/drift.json' with { type: 'json' };
import { setMoteDensity } from '../engine/atmosphere.js';

export function climateForDepth(depth = 0, config = generatorConfig) {
  const rows = config.climate ?? [];
  const row = rows.find((entry) => Number(depth) <= (entry.until ?? 99))
    ?? rows[rows.length - 1]
    ?? {
      until: 99,
      ambientScale: 1,
      sunScale: 1,
      density: 1,
      fog: 0,
      emissiveScale: 1,
    };
  return row;
}

export function mixHex(base, tint, amount = 0) {
  if (!tint || !amount) {
    return base;
  }
  const a = new Color(base);
  const b = new Color(tint);
  return `#${a.lerp(b, amount).getHexString()}`;
}

export function applyClimateToRoomData(room, climate) {
  if (!room || !climate) {
    return room;
  }
  const light = (room.entities ?? []).find((entity) => entity.kind === 'env.light');
  if (light) {
    light.props = {
      ...light.props,
      sunIntensity: (light.props.sunIntensity ?? 0.4) * (climate.sunScale ?? 1),
      ambientIntensity: (light.props.ambientIntensity ?? 0.35) * (climate.ambientScale ?? 1),
    };
  }
  if (climate.tint && climate.fog) {
    room.clearColor = mixHex(room.clearColor ?? '#111111', climate.tint, Math.min(0.55, Number(climate.fog) || 0));
  }
  if (room.atmosphere) {
    room.atmosphere = {
      ...room.atmosphere,
      density: (room.atmosphere.density ?? 1) * (climate.density ?? 1),
    };
  }
  room.climate = {
    until: climate.until,
    ambientScale: climate.ambientScale,
    sunScale: climate.sunScale,
    fog: climate.fog ?? 0,
    density: climate.density ?? 1,
  };
  return room;
}

export function applyClimateToScene(room, climate) {
  if (!room?.scene || !climate) {
    return room;
  }
  const fog = Number(climate.fog) || 0;
  if (fog > 0.02) {
    room.scene.fog = new FogExp2(room.clearColor ?? 0x111111, 0.012 + fog * 0.04);
  } else {
    room.scene.fog = null;
  }
  setMoteDensity(room, room.atmosphere?.density ?? 1);
  return room;
}
