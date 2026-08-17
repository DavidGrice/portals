# Portals

A first-person WebGL portal engine: recursive stencil openings, JSON-authored rooms, a Metalheart / Aero Glass welcome screen, and a small playable demo of four halls.

The product lives entirely in this `grok/` folder.

## What it is

Each room is its own Three.js scene. A portal is a one-sided quad that:

1. Increments the stencil where the opening is on screen
2. Renders the destination room from a paired camera (normal projection + a world clip plane)
3. Decrements the stencil and depth-writes the opening so the current room cannot paint over dest
4. Teleports the player when the eye crosses the door plane

The portal pass **requires WebGL with a stencil buffer**. WebGPU is detected on the welcome card and reserved for later; it is not used to draw portals.

## Requirements

- Node.js 22 or newer
- npm
- A current Chromium or Firefox build (stencil WebGL)
- Optional: a GitHub repo with Actions enabled for CI

## Install and run

```bash
cd grok
npm install
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/).

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server (`127.0.0.1:5173`) |
| `npm run build` | Production bundle in `grok/dist/` |
| `npm run preview` | Serve the production bundle |
| `npm test` | Node unit tests (no GPU) |
| `npm run validate-data` | Check world JSON ids, kinds, and portal links |

## Play

| Input | Action |
| --- | --- |
| **Enter** or click **Enter** | Hide welcome, lock the pointer |
| **Esc** | Unlock pointer, show welcome |
| **WASD** / arrows | Move |
| **Mouse** | Look |
| **Space** | Jump |
| **Options** | Graphics profiles (from the welcome card) |

The shipped world is four halls: **blue → red → green → violet**. Each door is a two-way pair except where `enabled` / `oneWay` say otherwise.

Query flags:

| Flag | Effect |
| --- | --- |
| `?debug` | Overlay: room, nearest portal local Z, drawn/skipped doors, dest camera, last cross |
| `?nohud` | Skip the welcome card (pointer lock still required to look) |

## Options / graphics

Welcome → **Options**. Settings persist under `localStorage` key `portals-grok-graphics`.

| Profile | AA | Recursion | Scale | Shadows | FOV |
| --- | --- | --- | --- | --- | --- |
| Low | off | 1 | 0.75 | off | 60 |
| Medium | off | 2 | 1 | off | 60 |
| High | on | 3 | device (cap 2) | on | 60 |
| Ultra | on | 4 | device (cap 2) | on | 70 |

You can override FOV, recursion, scale, AA, and shadows after picking a profile. **Anti-aliasing** is a WebGL context flag; changing it reloads the page so the renderer can be rebuilt with `stencil: true`.

`prefers-reduced-motion` disables the welcome mote animation.

## Layout

```
grok/
  src/
    engine/          Player, colliders, graphics, events, renderer factory
    portal/          Portal, PortalGeometry, PortalController, Room
    content/         JSON loader and prefabs
    ui/              Options panel
    main.js          Boot, pointer lock, loop
    style.css        Welcome + options (Metalheart plaque, Aero glass card)
  data/
    catalog.json     Kinds → prefabs
    worlds/          Playable worlds
    schema/          World JSON shape
  test/              Node tests
  scripts/           validate-world.js
```

Import the engine from one barrel:

```js
import {
  PortalController,
  Portal,
  Room,
  Player,
  GraphicsSettings,
  Emitter,
  createPortalRenderer,
  probeCapabilities,
} from './src/engine/index.js';
```

Package `exports` maps `"."` to that file.

## Authoring a world

`data/catalog.json` maps a **kind** (`env.sky`, `env.floor`, `env.light`, `prop.box`, `arch.frame`) to a prefab.

`data/worlds/*.json` lists rooms. Each room has `clearColor`, `entities`, and `portals`.

Portal fields:

| Field | Meaning |
| --- | --- |
| `id` | Stable id (`door-ab`). Never `Object3D.id`. |
| `destinationId` | Other portal’s id |
| `position`, `yaw`, `size` | Pose and opening |
| `enabled` | `false` = no stencil, no cross, opening is solid |
| `oneWay` | Cross only from the walk-up side (`+Z`) |

`+Z` on a portal is the walk-up side. Frames include a collar (dest sits inside the metal) and a back occluder (standing behind the door shows a slab, not dest bleed).

Schema: `data/schema/world.schema.json`. Validate with `npm run validate-data`.

## How a frame is drawn (important for bleed)

The stencil quad is slightly **smaller** than the visible frame opening. Dest color is written only inside that quad. A jamb lines the opening; an occluder closes the hole from dest `−Z`. Dest is not drawn unless the camera is on the walk-up side, past the jamb, and the portal is in front of the camera.

## Continuous integration

Workflows live in `../.github/workflows/` (repo root).

| File | Role |
| --- | --- |
| `ci.yml` | On push/PR to `portals-grok` or `main`: `npm ci`, `test`, `validate-data`, `build` in `grok/` |
| `auto-pr.yml` | On push to `next`, or **Actions → Auto PR → Run workflow**: open a PR `next` → `portals-grok` and enable auto-merge |
| `auto-merge.yml` | If a PR has label `automerge` and **quality** passed: squash-merge and delete the branch |

**One-time GitHub settings** (YAML cannot do these):

1. Settings → General → **Allow auto-merge**
2. Settings → Actions → **Allow GitHub Actions to create and approve pull requests**
3. Branch protection (recommended): require the `quality` check; allow squash

Without (1) and (2), the PR workflows will run but cannot open or merge PRs.

Typical flow: push work to `next` → Actions opens the PR → CI goes green → auto-merge squash-lands on `portals-grok`. Or add label `automerge` on any PR targeting `portals-grok` / `main`.

## License

See the repository root `LICENSE` if present. Engine code is ESM (Three.js r185).
