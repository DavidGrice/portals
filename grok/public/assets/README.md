# Assets

Original files only. Worlds reference these paths from JSON (`materials.json` `map`, later `props.video`).

| Folder | Holds |
| --- | --- |
| `textures/cyber/` | Neon / circuit tiles. Runtime fallback is the `circuit` recipe. |
| `textures/ages/` | Era ground and hull. Fallback: `speckle` / `stripe`. |
| `textures/shared/` | Generic plaster, metal. |
| `video/` | In-world loops. Never a portal substitute. |
| `audio/` | Baked original WAV beds and oneshots (`data/audio.json`). Live synth is the missing-file fallback. |
| `models/` | Original low-poly GLTF (`chair`, `trunk`, `column`). Missing file keeps the JSON box collider. |
| `hdr/` | Future environment maps. |

Keep binaries small. Prefer a material `recipe` until a file is actually needed.
