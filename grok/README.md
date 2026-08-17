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

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). The start menu is HTML only — the WebGL halls are created when you press **Play**, and destroyed on **Quit to menu**.

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
| **Play** or **Enter** | Create the WebGL session and enter the first hall |
| **Esc** / pause / **O** | Pause, Options, or Quit to menu |
| **WASD** | Move (rebindable) |
| **Arrows** | Look (rebindable) |
| **Mouse** / drag | Look |
| **Space** | Jump (rebindable) |
| Touch | Left stick move, right-side drag look, Jump button |
| Gamepad | Left stick move, right stick look, A jump, Start pause / Play |
| **Options** | Graphics, controls, interface, sound, keybinds |

The shipped world is four halls: **blue → red → green → violet**. Each hall has its own `origin` (250 units apart on X) so a door shows that destination’s color and architecture, not another hall’s props stacked on the same coordinates. Landmark cubes sit in the walk-up pocket beside each entry, not in the doorway view. The sky is a smooth dome well inside the camera far plane.

Query flags:

| Flag | Effect |
| --- | --- |
| `?debug` | Overlay: room, nearest portal local Z, drawn/skipped doors, dest camera, last cross |
| `?nohud` | Skip the welcome card (pointer lock still required to look) |

## Options / graphics

Welcome or pause → **Options**. Settings persist under `localStorage` key `portals-grok-graphics`. A first launch picks Performance / Balanced / Ultra from a device heuristic; after that your save wins.

Quality presets and anti-aliasing are independent, the same way they are in a desktop game. WebGL has no sample-count MSAA picker — `Hardware AA` is the browser's boolean `gl.antialias` (changing it reloads so the context can be rebuilt with `stencil: true`). Post-process modes are:

| Mode | What it does |
| --- | --- |
| Off | Portal pass draws to the screen. Hardware AA only, if enabled. |
| FXAA | Portal pass draws into a stencil render target, then a cheap edge shader. |
| SMAA | Same target, sharper morphological AA. |
| Supersample 2× | Same target at 2× resolution, then a linear blit (~4× pixel cost). |

The portal pass never goes through EffectComposer — stencil increment/decrement has to stay intact.

| Preset | Hardware AA | Recursion | Scale | Shadows | View distance |
| --- | --- | --- | --- | --- | --- |
| Performance | off | 1 | 0.75 | off | 75% |
| Balanced | on | 2 | 1 | on | 100% |
| Ultra | on | 4 | device (cap 2) | on + fill light | 115% |

After a preset you can still change FOV, recursion, scale, anisotropy, view distance, shadows, fill light, look sensitivity, invert Y, walk/jump, gamepad look, fullscreen, keybinds, HUD, theme, and stored volume sliders.

`prefers-reduced-motion` disables the welcome mote animation. On a phone or tablet the welcome card is scrollable, look does not require pointer lock, and a virtual stick + Jump + Pause sit over the world.

## Layout

```
grok/
  src/
    engine/          Player, colliders, graphics, post-AA, look, events, renderer factory
    portal/          Portal, PortalGeometry, PortalController, Room
    content/         JSON loader and prefabs
    ui/              Options panel, touch HUD
    main.js          Boot, pointer lock / touch, loop
    style.css        Welcome, options tabs, themes, mobile HUD
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

`data/worlds/*.json` lists rooms. Each room has `clearColor`, optional `origin`, `entities`, and `portals`. The loader adds `origin` to every entity and door.

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

1. Settings → General → **Pull Requests** → **Allow auto-merge**
2. Settings → General → **Pull Requests** → **Allow squash merging** (this is the squash switch; it is not a ruleset field)
3. Settings → Actions → General → **Allow GitHub Actions to create and approve pull requests**
4. Optional ruleset (Settings → Rules): require the **quality** status check on `portals-grok` / `main`

Without (1) and (2), the PR workflows will run but cannot open or merge PRs.

Typical flow: push work to `next` → Actions opens the PR → CI goes green → auto-merge squash-lands on `portals-grok`. Or add label `automerge` on any PR targeting `portals-grok` / `main`.

## License

See the repository root `LICENSE` if present. Engine code is ESM (Three.js r185).
