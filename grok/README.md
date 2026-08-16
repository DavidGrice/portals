# grok

This folder is the home for the modernized Three.js portal rewrite.

## What lives where

| Path | Role |
| --- | --- |
| `grok/` | New work only. ES modules, current Three.js. |
| `Portals-master/` | 2016 University of Tartu reference (stencil + recursive portals). Do not edit. |
| `three.portals-master/` | zadvorsky `three.portals` reference (multi-scene, oblique clip, volume mesh). Do not edit. |
| `public/` | Leftover globe-viz assets and unfinished r119 portal experiments. Not the product. |

Vendor trees stay on disk as read-only source material. New portal code starts here.

## Run

From this folder:

```
npm install
npm run dev
```

Then open http://127.0.0.1:5173. This step uses `PortalController` to register two rooms and link a portal pair. No stencil pass yet.
