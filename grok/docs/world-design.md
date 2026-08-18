# World design

Worlds stay **data**. A hall is JSON plus catalog kinds. Generated Drift rooms pick a **topology** (volume + sockets) then a **kit** (materials, dressing, bed tags). Code loads, draws, and collides — it does not invent a theme function.

Topologies live in `data/topologies/` (`I`, `L`, `T`, `plus`, `U`, `court`, `loft`, `shaft`, `rotunda`, `alcove`). Kits list a `topologies` pool. The compiler refuses to reuse the same topology+kit pair in the last four live rooms.

Volume kinds: `arch.corridor` (Four halls), `arch.chamber`, `arch.wing`, `arch.court`, `arch.loft`, `arch.shaft`, `arch.rotunda`. Sockets punch holes in those volumes. Portals sit in the holes.

## Principles

1. **JSON is the source of truth.** Rooms, doors, props, materials, audio beds, and picker metadata live under `data/`. If a designer cannot express a change without editing `src/`, the pipeline is incomplete.
2. **Catalog, not one-off meshes.** New furniture is a `kind` in `data/catalog.json` mapped to a prefab. Worlds only reference kinds.
3. **Materials are a second catalog.** `data/materials.json` names looks (`cyber.grid.cyan`, `ages.dirt`). Entities set `props.material`. Prefabs never hard-code a theme.
4. **Origins stay far apart.** Each room shifts by `origin` (250 on X by default) so a door never shows another hall’s props stacked on the same point.
5. **Layers are declared, not implied.** Sky, shell, dressing, lights, VFX, and audio are tagged so we can add or strip a layer without rewriting the room.
6. **Original assets only.** No licensed film/game textures. Grids and tiles are generated here (procedural recipes, or files we authored). Video and HDR slots exist; they stay empty until we have our own clips.
7. **Draft vs playable.** `data/worlds/index.json` may list a world with `"status": "draft"`. The picker only shows playable entries. Validation still runs on drafts so stubs cannot rot.

## Folders

```
grok/
  data/
    catalog.json           kinds → prefabs
    materials.json         material ids → recipe / maps
    worlds/
      index.json           picker + status
      *.json               one file per world
    schema/
      world.schema.json
      material.schema.json
  public/assets/
    textures/cyber/        neon / circuit tiles (optional PNG; recipe is fallback)
    textures/ages/         era ground and stone
    textures/shared/       generic metal, plaster
    video/                 future in-world loops (not portal views)
    audio/                 future sampled beds (procedural is default)
    models/                future GLTF
    hdr/                   future environment maps
  docs/world-design.md     this plan
```

Runtime files under `public/` are served as `/assets/...`. World picker shots stay in `public/worlds/` (they are UI, not room materials).

## JSON shape

World extras (all optional, all data):

| Field | Where | Meaning |
| --- | --- | --- |
| `theme` | world | `halls` \| `haunt` \| `cyber` \| `ages` — default bed + dress |
| `status` | index entry | omit or `playable`; `draft` hides from the picker |
| `layers` | world or room | named layer list (see below) |
| `bed` | world or room | overrides `theme` for audio |
| `palette` | room | named colors the room may reuse (`accent`, `fog`) |
| `props.material` | entity | id in `materials.json` |
| `tags` | room / entity | `cyber`, `ages`, `prehistoric`, `future`, `haunt`, … |

### Layers

A room is authored as stacked layers. They are tags on entities today; later a loader can show/hide by name.

| Layer | Typical kinds | Notes |
| --- | --- | --- |
| `sky` | `env.sky` | Interior dome, never a far-plane box |
| `light` | `env.light`, emissive boxes | One ambient + sun, plus local strips / fire |
| `shell` | `arch.corridor`, `arch.wall`, `env.floor` | Collision and the walkable volume |
| `openings` | `arch.frame` + `portals[]` | Frames cover a `coversPortalId` |
| `dressing` | `prop.*` | Furniture, landmarks, glass, screens |
| `vfx` | motes, fire, future video planes | Driven from tags / atmosphere |
| `audio` | room tags + `bed` | Procedural beds; samples later in `/assets/audio` |

Do **not** put a live portal view on a video plane. Screens are in-room camera-to-texture. Video files are decoration or cutscenes only.

### Materials

```json
"cyber.grid.cyan": {
  "recipe": "circuit",
  "color": "#041018",
  "line": "#2ee6ff",
  "cells": 10,
  "repeat": [8, 8],
  "roughness": 0.28,
  "metalness": 0.72,
  "emissive": "#062028",
  "emissiveIntensity": 0.35,
  "map": "/assets/textures/cyber/grid-cyan.png"
}
```

`recipe` always works (canvas, no network). `map` is an optional authored PNG; when we add an async preload, the file wins and the recipe is the fallback (tests, missing file, Node).

Recipes: `tile` (checker + grout), `circuit` (dark field, glowing grid), `stripe`, `speckle`.

## Planned worlds

### Circuit Grid (`cyber`) — playable seed

Neon lanes you run. Not a licensed film look: black field, thin light lines, one accent per hall.

| Room | Accent | Role |
| --- | --- | --- |
| White core | `#e8eef8` | Start. Two doors. |
| Cyan lane | `#2ee6ff` | First run. |
| Red lane | `#ff3b4a` | Hot corridor. |
| Blue lane | `#3b7cff` | Cold end hall. |

Later (todo): a locked gold lane, moving light strips, jump pads, a vertical shaft, a “race” loop that returns to white.

Audio: thin high buzz + low 40 Hz bed (`cyber`). Footsteps stay the shared SFX bus.

### The Ages (`ages`) — draft seed

One chain through human (and pre-human) time. Each era is a room with its own origin, palette, material set, and bed. Portals are the time cuts.

| Era id | Time | Look | Later content |
| --- | --- | --- | --- |
| `primordial` | Pre-life | Dark water, slick stone | Tide audio, fog |
| `mesozoic` | Dinosaurs | Dirt, fern, amber light | Large silhouettes as boxes first, GLTF later |
| `stone` | Early humans | Ochre, cave, fire | Existing hearth prefab |
| `ancient` | Early cities | Sandstone, sun | Columns as boxes |
| `medieval` | Castles | Dark timber, iron | Narrower corridor props |
| `industrial` | Steam / coal | Brick, soot, warm lamps | Pipes as boxes |
| `present` | Now | Concrete, glass | Reuse `prop.glass` / `prop.screen` |
| `near-future` | Decades out | White composite, soft LEDs | Circuit materials, cooler bed |
| `orbital` | Far future | Vacuum black, hull metal | Lowest bed, big sky color |

Draft seed ships two rooms (`mesozoic` ↔ `orbital`) so the file validates and the material ids exist. The rest are listed here until we author them.

Hub option (later): a “gallery of doors” room whose portals are the eras, so the player can skip the linear walk.

## Integration checklist (every new world)

1. Add kinds only if a prefab is missing. Prefer existing `arch.corridor`, `prop.box`, `env.light`.
2. Add materials to `data/materials.json` (recipe required, PNG optional).
3. Author `data/worlds/<id>.json` with unique portal ids, 250-apart origins, `theme` / room `tags`.
4. Add the file to `data/worlds/index.json`. Use `"status": "draft"` until it is fun to play.
5. Import the JSON in `src/ui/worlds.js` (`WORLD_DATA`).
6. Drop a 16:9 shot in `public/worlds/<id>.jpg` before flipping to playable.
7. Map audio in `bedForRoom` via **tags**, not a hard-coded room id, unless the room needs a one-off bed.
8. `npm run validate-data` and `npm test`.
9. Walk every door, stand on every cube, listen for the bed change.

## Features this unlocks (backlog)

- **Texture layers** — albedo recipe + optional roughness/emissive maps in the material catalog.
- **Video layers** — `prop.screen` can take `props.video: "/assets/video/...."`. Still not a portal.
- **GLTF dressing** — `prop.model` kind, files in `/assets/models`. Colliders stay JSON (`aabb` / `bounds`) so art cannot break walking.
- **HDR skies** — `/assets/hdr` for later env maps; sky sphere remains the cheap default.
- **Era kits** — a JSON “kit” is a list of material ids + default corridor color so an ages room is a kit name plus a few landmarks.
- **Cyber motion** — data-driven strip paths (`props.scroll: [u, v]`) once we have a tick on materials.
- **Dinosaurs / NPCs** — GLTF + a later `npc` kind. Out of scope until the ages chain plays as empty halls.

## What we will not do

- Ship someone else’s film or game textures.
- Replace stencil doors with video or cubemaps.
- Put two eras in the same Three.js scene to “save” an origin.
- Grow `prefabs.js` with theme-specific functions (`cyberFloor`). Theme is data.

## Milestones

| # | Deliverable | Status |
| --- | --- | --- |
| 0 | Material catalog, asset folders, this plan, draft index | now |
| 1 | Circuit Grid, four lanes, cyber bed, playable | now (seed) |
| 2 | Ages draft: mesozoic + orbital, hidden from picker | now (seed) |
| 3 | Circuit extras: gold lane, strips that read as runways | todo |
| 4 | Ages: fill the era table, fire in stone, glass in present | todo |
| 5 | Optional PNG/HDR/video files behind the same material ids | todo |
| 6 | GLTF dressing + collider JSON | todo (parked with NPCs) |
