# QA walk

Human acceptance for the 75-item plan. Tests are not a substitute.

## Hollow House

1. Play The Hollow House. Foyer is a chamber with a hearth, rug, chairs — not a tinted Four halls corridor.
2. Walk the upper hall. Side door is dining, forward is parlor. A figure may look at you.
3. Parlor: **E** on the portrait reads. **E** on the hearth stokes. Pad unseals the attic.
4. Dining is a long table, not the parlor footprint.
5. Cellar / crypt are stone vaults. Footsteps are stone. Fire crackles near hearths.
6. Attic is a loft with a window that is **not** a door. Wind bed. Door you came through is still the parlor link (authored, two-way).
7. Stand in the parlor ~45s. A haunt event (creak / whisper / shutter) should fire. Never on Circuit.
8. **T** flashlight works in the crypt.

## Circuit Grid

1. White core is a plus. You can point at four different openings: cyan, shaft, blue, ribbon.
2. Cyan is wide. Red is a tight throat with hazard paint. Blue is a loft. Shaft is a well with a launch that lands on a ledge.
3. Ribbon is a court you can see from the core, run, and return.
4. Gold stays locked until the core pad (key A) then the cyan pad.
5. Footsteps are metal / grate. Bed is cyber. No haunt events.

## The Ages

Screenshot order should read as time: slick court → dirt court + silhouette → L cave + fire → colonnade → tall nave → machine plus → glass office → white loft → dark hull rotunda.

Walk the two-way chain both directions. Primordial water is a plane, not a portal. Present screen is dest-camera / recipe, not a door.

## Drift

Start with a seed. Walk 40 rooms.

- Every room after arrival has ≥1 live unused door.
- ≥35% of rooms have 3+ exits.
- No two consecutive rooms share topology+kit.
- At least one setpiece (`set-*` or `mix-*`).
- Arrival door is a sealed slab. Other doors are live stencil.
- Continue restores seed / depth / kit / local pose.

## Input / options

Keyboard, pointer lock, touch Use, gamepad A, launch, unlock, flashlight **T**, pause, Options sliders (master / music / ambience / sfx). Performance profile drops motes, rain, extra point lights, dest-strip; flashlight still works short-range.

## Ship checks

- `npm test` green
- `npm run validate-data` green (worlds + audio)
- `grok/src/style.css` not in git
- no vendor zips
- README tells a player how to run Drift and Hollow House
