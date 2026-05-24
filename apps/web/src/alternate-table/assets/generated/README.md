This folder documents the generated asset strategy for the alternate 3D table.

The photorealistic alternate table does not fetch runtime assets from the
network. Instead, it generates lightweight local textures procedurally inside
the alternate 3D renderer:

- dark walnut wood grain
- green felt surface with gold border/watermark
- premium green card backs
- card faces with local suit/special-card art
- score and seat plaques

These textures are produced from local Canvas drawing code in
`apps/web/src/alternate-table/three-surface.tsx` so the alternate table stays
self-contained, deterministic, and removable without affecting the normal
table.
