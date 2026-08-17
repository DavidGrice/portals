# Portals

A first-person WebGL portal engine. Walk through a door and you are in another hall — the opening is a real stencil view of the destination, not a texture or a screenshot.

The playable app and engine live in [`grok/`](grok/).

## Play

```bash
cd grok
npm install
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). The start menu is HTML only. Click **Play** to create the WebGL halls; **Quit to menu** destroys them.

| Input | Action |
| --- | --- |
| **WASD** | Move (rebindable) |
| **Mouse** / drag | Look |
| **Arrows** | Look (rebindable) |
| **Space** | Jump (rebindable) |
| **Esc** / **O** / Pause | Options and resume |
| Touch | Left stick move, drag to look, Jump, Pause |

The shipped world is four halls: **blue → red → green → violet**. Each hall sits in its own space 250 units apart so a door shows only that destination’s color and architecture, not another hall’s props stacked on the same origin.

Query flags: `?debug` for a live overlay, `?nohud` to skip the welcome card.

## Requirements

- Node.js 22 or newer
- npm
- A current Chromium or Firefox build (WebGL with a stencil buffer)

## Scripts

Run these from `grok/`.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on `127.0.0.1:5173` |
| `npm run build` | Production bundle in `grok/dist/` |
| `npm run preview` | Serve the production bundle |
| `npm test` | Node unit tests (no GPU) |
| `npm run validate-data` | Check world JSON ids, kinds, and portal links |

## How a door works

Each hall is its own Three.js scene. A portal is a one-sided opening that:

1. Increments the stencil where the door is on screen
2. Draws the destination hall from a paired camera (normal projection plus a world clip plane so dest does not leak behind the metal)
3. Decrements the stencil and depth-writes the opening so the current hall cannot paint over dest
4. Teleports the player when the eye crosses the door plane

The portal pass **requires WebGL with a stencil buffer**. WebGPU is detected on the welcome card and reserved for later; it is not used to draw portals.

`+Z` on a portal is the walk-up side. Frames include a collar (dest sits inside the metal) and a back occluder (standing behind the door shows a slab, not dest bleed). Dest is not drawn unless the camera is on the walk-up side, past the jamb, and the portal is in front of the camera.

Halls do not share an origin. Each room JSON may set `origin: [x, y, z]`; the loader shifts every entity and door by that vector. Landmark cubes sit beside the walk-up pocket of each hall so they are not sitting in the doorway view. The sky is a large interior dome well inside the camera far plane — it is not a clip-plane box.

## Options

Welcome or pause → **Options**. The panel stays one size on every tab. Settings persist under `localStorage` key `portals-grok-graphics`. A first launch picks Performance / Balanced / Ultra from a device heuristic; after that your save wins.

Quality presets and anti-aliasing are independent. WebGL has no sample-count MSAA picker — **Hardware AA** is the browser’s boolean `gl.antialias` (changing it reloads so the context can be rebuilt with `stencil: true`). Post-process modes:

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

You can also change FOV, recursion, anisotropy, view distance, fill light, look sensitivity, invert Y, walk/jump, keybinds, HUD, theme, and stored volume sliders. Toggles are Off / On dropdowns.

On a phone or tablet the welcome card is scrollable, look does not require pointer lock, and a virtual stick + Jump + Pause sit over the world. `prefers-reduced-motion` disables the welcome mote animation.

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
} from './grok/src/engine/index.js';
```

Package `exports` in `grok/package.json` maps `"."` to that file.

## Authoring a world

`grok/data/catalog.json` maps a **kind** (`env.sky`, `env.floor`, `env.light`, `prop.box`, `arch.frame`) to a prefab.

`grok/data/worlds/*.json` lists rooms. Each room has `clearColor`, optional `origin`, `entities`, and `portals`.

| Portal field | Meaning |
| --- | --- |
| `id` | Stable id (`door-ab`). Never `Object3D.id`. |
| `destinationId` | Other portal’s id |
| `position`, `yaw`, `size` | Pose and opening (local to the room; `origin` is added at load) |
| `enabled` | `false` = no stencil, no cross, opening is solid |
| `oneWay` | Cross only from the walk-up side (`+Z`) |

Schema: `grok/data/schema/world.schema.json`. Validate with `npm run validate-data`.

## Continuous integration

Workflows live in [`.github/workflows/`](.github/workflows/).

| File | Role |
| --- | --- |
| `ci.yml` | On push/PR to `portals-grok` or `main`: `npm ci`, `test`, `validate-data`, `build` in `grok/` |
| `auto-pr.yml` | On push to `next`, or **Actions → Auto PR → Run workflow**: open a PR `next` → `portals-grok` and enable auto-merge |
| `auto-merge.yml` | If a PR has label `automerge` and **quality** passed: squash-merge and delete the branch |

**One-time GitHub settings** (YAML cannot do these):

1. Settings → General → **Pull Requests** → **Allow auto-merge**
2. Settings → General → **Pull Requests** → **Allow squash merging**
3. Settings → Actions → General → **Allow GitHub Actions to create and approve pull requests**
4. Optional ruleset (Settings → Rules): require the **quality** status check on `portals-grok` / `main`

Typical flow: push work to `next` → Actions opens the PR → CI goes green → auto-merge squash-lands on `portals-grok`. Or add label `automerge` on any PR targeting `portals-grok` / `main`.

## License

See `LICENSE` if present. Engine code is ESM (Three.js r185).
