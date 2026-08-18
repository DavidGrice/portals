# Attribution

JulioVII publishes Blender/Substance PBR packs on [itch.io](https://juliovii.itch.io/) under **CC-BY** (albedo, roughness, normal, height). We used that stack as the look target: Principled-style response, not a flat albedo.

Those zips need an itch account to download, so this repo does **not** ship JulioVII files. Instead `src/content/tiles-pbr.js` rebuilds the same maps in the browser (height → normal + roughness) and `buildMaterial` uses `MeshPhysicalMaterial` the way a Blender export would.

If you drop CC-BY or CC0 maps into `public/assets/textures/`, point `materials.json` `map` / `roughnessMap` / `normalMap` at them and credit the author here.

Haunt albedo JPGs under `public/assets/textures/haunt/` and Circuit Grid tiles under `public/assets/textures/cyber/` were authored for this project. Audio under `public/assets/audio/` is baked from our own synth (`npm run bake-audio`); there are no licensed tracks.

[don1138/blender-materials](https://github.com/don1138/blender-materials) Chaos Metals (from [Christopher Nichols, Understanding Metalness](https://www.chaos.com/blog/understanding-metalness)) supplies the measured metal F0 colors in `metal.gold`, `metal.copper`, `metal.iron`, `metal.silver`, `metal.aluminum`, `metal.chrome`. We did not copy `.blend` files.

[Blender 3D: Noob to Pro / Materials and Textures](https://en.wikibooks.org/wiki/Blender_3D:_Noob_to_Pro/Materials_and_Textures) is the rule set: a material is how light behaves (diffuse vs metal, IOR, transmission); a texture only breaks that up. Cloud overlays (`overlay: "cloud"`) are the wikibook “dirty-up” trick.
