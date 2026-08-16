# grok

This folder is the home for the modernized Three.js portal rewrite.

## What lives where

| Path | Role |
| --- | --- |
| `grok/` | New work only. ES modules, current Three.js. |
| `Portals-master/` | 2016 University of Tartu reference (stencil + recursive portals). Do not edit. |
| `three.portals-master/` | zadvorsky `three.portals` reference (multi-scene, oblique clip, volume mesh). Do not edit. |
| `public/` | Leftover globe-viz assets and unfinished r119 portal experiments. Gitignored. |
| `app.js` / root `package.json` | Old Express `globe-viz` server. Gitignored. |

Vendor trees and `public/` stay on disk as read-only reference. They are not committed. New portal code starts here.

## Run

From this folder:

```
npm install
npm run dev
```

Then open http://127.0.0.1:5173. The welcome screen uses Metalheart chrome with Aero glass and purple bloom. Enter starts play. Portal stencil stays on WebGL; WebGPU is probed and shown on the card.

Add `?debug` to show room id, nearest portal, and last cross.
