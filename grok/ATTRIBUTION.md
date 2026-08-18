# Attribution

JulioVII publishes Blender/Substance PBR packs on [itch.io](https://juliovii.itch.io/) under **CC-BY** (albedo, roughness, normal, height). We used that stack as the look target: Principled-style response, not a flat albedo.

Those zips need an itch account to download, so this repo does **not** ship JulioVII files. Instead `src/content/tiles-pbr.js` rebuilds the same maps in the browser (height → normal + roughness) and `buildMaterial` uses `MeshPhysicalMaterial` the way a Blender export would.

If you drop CC-BY or CC0 maps into `public/assets/textures/`, point `materials.json` `map` / `roughnessMap` / `normalMap` at them and credit the author here.

Haunt albedo JPGs under `public/assets/textures/haunt/` were authored for this project.
