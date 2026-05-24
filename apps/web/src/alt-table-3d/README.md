# ALT Table 3D

This folder is the isolated React Three Fiber implementation for the alternate
table route.

## Boundaries

- `apps/web/src/App.tsx` routes `?table=alt` directly to
  `AltTable3DRoute.tsx`.
- The normal table remains on `NormalGameTableView`.
- No file in this folder imports the deleted legacy ALT renderer stack.

## Assets

- Generated source images live under `assets/generated/`.
- Runtime textures live under `assets/runtime/`.
- Exact prompts and provenance live in `assets/asset-manifest.json`.
- `assets/scripts/build_assets.py` composes the generated card sources into the
  final card atlas used by the mesh cards.

## Scene

- `AltTable3DRoute.tsx` owns the DOM wrapper, menu, and bottom action rail.
- `AltTable3DScene.tsx` owns the R3F canvas and lights.
- `AltTable3DTableRoot.tsx` owns the single world-space table scene graph.
- `AltTable3DCardMesh.tsx` renders mesh-backed cards with texture materials.
