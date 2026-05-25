# Empty Photorealistic ALT Table

This folder contains the isolated alternate-table shell for the React 3D route.

Scope of this implementation:

- empty table only
- local canvas-generated wood, felt, gold-overlay, and label textures
- fixed South-player camera
- no cards, deck, score panels, or gameplay HUD
- regular table route remains unchanged

Game Studio path used for this route:

- `game-studio:react-three-fiber-game`
  - React-hosted 3D scene composition with a dedicated scene root, isolated
    camera rig, isolated lighting rig, and DOM kept outside the WebGL world.
- `game-studio:game-ui-frontend`
  - playfield-first UI budget with no always-on HUD chrome for this empty shell
    and only a restrained vignette overlay outside the canvas.

Reference-build intent for the empty shell:

- match the empty walnut-and-felt reference direction first
- keep the center of the playfield clear
- keep all four rails and plaques readable in one viewport
- add fidelity through 3D materials, lighting, and composition before any
  gameplay chrome returns
