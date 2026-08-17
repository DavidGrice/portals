# Assets

Original files only. Worlds reference these paths from JSON (`materials.json` `map`, later `props.video`).

| Folder | Holds |
| --- | --- |
| `textures/cyber/` | Neon / circuit tiles. Runtime fallback is the `circuit` recipe. |
| `textures/ages/` | Era ground and hull. Fallback: `speckle` / `stripe`. |
| `textures/shared/` | Generic plaster, metal. |
| `video/` | In-world loops. Never a portal substitute. |
| `audio/` | Optional sampled beds. Procedural audio is the default. |
| `models/` | Future GLTF dressing. Colliders stay in world JSON. |
| `hdr/` | Future environment maps. |

Keep binaries small. Prefer a material `recipe` until a file is actually needed.
