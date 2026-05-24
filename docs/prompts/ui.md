# UI Prompt Capture

Use this file to preserve UI and UX prompt intent and link it to GitHub work. GitHub issue state is authoritative; this file is not a parallel tracker.

## Entry Structure

- Date
- Prompt Signal
- Interpreted Requirement
- Affected Systems
- Linked GitHub Issue
- Milestone
- Status Source

## Entries

### 2026-05-23 - The photorealistic ALT table must keep the full scene inside the viewport

- Prompt Signal: After the 3D tray rebuild, the next visual feedback said
  "Thats good now get everything on the screen" and attached captures showing
  the south hand, south plaque, and side trays clipping against the viewport.
- Interpreted Requirement: Issue
  [#81](https://github.com/NeonButrfly/tichuml/issues/81) continues to track a
  hard framing contract for the ALT table: the south-player 3D scene must fit
  within common desktop viewports, keeping the front tray, side trays, south
  hand, and active controls visible at once instead of letting the camera or
  world scale crop the table edges.
- Affected Systems: `apps/web/src/alternate-table/three-surface.tsx`,
  ALT table camera/tray constants, screenshot validation artifacts, and Linux
  host visual follow-through.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-22 - Alternate table should tune toward the cinematic wooden-room reference

- Prompt Signal: The latest visual feedback called the immersive table
  "closer" but attached a more specific target: a cinematic wooden room, a
  large oval table with visible air around the rim, a flatter and larger south
  hand, smaller far hands on the back arc, and anchored left/bottom HUD panels
  that do not steal the table's center.
- Interpreted Requirement: Keep the normal table untouched and keep the
  alternate table on the same gameplay/state/action pipeline, but tune the
  south-perspective projection and overlay composition toward the closer
  reference image. The alternate renderer should reserve visible room around
  the ellipse, reduce the south-hand fan angle, add room/backdrop framing,
  place contextual state panels on the left, and move the core action cluster
  to the lower-right without bringing back the old text-heavy centered layout.
- Affected Systems: `apps/web/src/alternate-table/south-perspective-projection.ts`,
  `apps/web/src/alternate-game-table-view.tsx`,
  `apps/web/src/alternate-table/three-surface.tsx`,
  `apps/web/src/styles.css`,
  `apps/web/src/alternate-table/README.md`,
  `tests/integration/south-perspective-projection.test.ts`,
  `tests/integration/alternate-table-view.test.ts`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-22 - Fresh hosted sessions must not hang on long entropy startup

- Prompt Signal: During direct testing of the Linux-hosted alternate table, the
  page stayed on `Starting New Game` for far too long even after the route
  itself became reachable, which blocked layout verification from a fresh
  browser session.
- Interpreted Requirement: Issue
  [#83](https://github.com/NeonButrfly/tichuml/issues/83) tracks the hosted
  startup contract: new browser sessions must respect the configured entropy
  budget and fall back promptly instead of waiting on slow remote entropy
  sources long enough to make the game look hung.
- Affected Systems: `apps/server/src/entropy/collectEntropy.ts`,
  entropy startup tests, hosted gameplay bootstrap flow, and Linux-hosted
  gameplay smoke verification.
- Linked GitHub Issue: [#83](https://github.com/NeonButrfly/tichuml/issues/83)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-22 - Alternate luxury table must be LAN-reachable and visually table-first

- Prompt Signal: The immediate follow-up to the alternate-table rollout said
  the Linux-hosted alternate table could not be reached at
  `http://192.168.50.36:5174/?table=alt`, and the user explicitly rejected the
  current composition as "in no way correct" while asking for screenshots and a
  real fix.
- Interpreted Requirement: Issue
  [#81](https://github.com/NeonButrfly/tichuml/issues/81) tracks the
  acceptance-blocking follow-up: the luxury table preview must be reachable on
  the Linux host through a public frontend bind, and the alternate surface must
  feel like a coherent south-perspective table rather than a page of stacked
  panels. The felt, rails, racks, south hand, controls, and local summary
  should read as one integrated play surface, with compact support chrome that
  does not overpower the table.
- Affected Systems: `apps/web/src/alternate-game-table-view.tsx`,
  `apps/web/src/styles.css`, `apps/web/src/alternate-table/README.md`, Linux
  frontend launch workflow, and follow-up browser screenshot validation.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-22 - Add a luxury 2.5D alternate gameplay table without replacing the live table

- Prompt Signal: The latest gameplay-table prompt required a second polished
  Tichu surface, not a redesign-in-place. The user explicitly required a new
  South-player luxury table with a carved wood frame, green felt, gold accents,
  raised racks, player plaques, a clear trick area, real interaction, and the
  same live backend/state/action pipeline as the normal gameplay table.
- Interpreted Requirement: Issue
  [#80](https://github.com/NeonButrfly/tichuml/issues/80) tracks a sibling
  renderer requirement: the existing normal table must remain available and
  behaviorally unchanged, while a second alternate table becomes reachable
  through the live app and reuses the same backend-backed state, legal-action
  logic, hidden-information rules, wish/pass/Tichu/Grand Tichu flows, card
  selection logic, and action dispatch callbacks. The alternate renderer should
  present a South-perspective 2.5D luxury table rather than a flat top-down
  layout or static mockup.
- Affected Systems: `apps/web/src/App.tsx`,
  `apps/web/src/game-table-view-model.ts`,
  `apps/web/src/game-table-views.tsx`,
  `apps/web/src/alternate-game-table-view.tsx`,
  `apps/web/src/styles.css`,
  `apps/web/src/alternate-table/README.md`,
  `tests/integration/alternate-table-view.test.ts`,
  `tests/integration/player-table-mode.test.ts`.
- Linked GitHub Issue: [#80](https://github.com/NeonButrfly/tichuml/issues/80)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-20 - Live South-player Tichu table must become more spatially anchored without breaking gameplay

- Prompt Signal: The follow-up gameplay table request rejected both a generic
  flat table and a purely decorative redesign. The user explicitly required a
  cleaner South-player Tichu surface with more usable table space, stronger
  seat anchoring, safer South-hand and button separation, less edge-clipped
  East/West seating, reserved room for trick and pass/wish UI, better
  seat-associated Tichu state, and generated graphic assets where needed. The
  user also asked for a hybrid route that can use a graphics-oriented layer
  without replacing the authoritative gameplay runtime.
- Interpreted Requirement: Issue
  [#76](https://github.com/NeonButrfly/tichuml/issues/76) tracks a live table
  refinement requirement: the current gameplay table must keep the existing
  Tichu rules, controls, hotkeys, telemetry, backend contracts, and layout
  editor authoritative while tightening the safe-table geometry, improving seat
  labels and hand anchoring, protecting South from bottom UI overlap, pulling
  East and West inward from the viewport edges, reserving stable trick/wish/pass
  regions, and supporting richer generated table/card assets through a bounded
  hybrid rendering approach rather than a competing second coordinate system.
- Affected Systems: `apps/web/src/game-table-views.tsx`,
  `apps/web/src/player-surface-view.tsx`,
  `apps/web/src/table-layout.ts`,
  `apps/web/src/styles.css`,
  table/card asset generation paths, viewport/layout tests, and any bounded
  presentation-layer integration required for the hybrid graphics pass.
- Linked GitHub Issue: [#76](https://github.com/NeonButrfly/tichuml/issues/76)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-19 - Live gameplay table should become a player-first adaptive dual-surface over-hand view

- Prompt Signal: The gameplay redesign request converged on a very specific
  live-table direction after multiple rejected mockup passes. The user wanted
  the game to stop feeling like generic app chrome, preferred a south-player
  over-hand view inspired by a real physical card table, asked for a studio-
  clean table-only environment, and approved an adaptive dual-surface model
  where the player view stays immersive while operator tools move to a separate
  analysis surface.
- Interpreted Requirement: Issue
  [#74](https://github.com/NeonButrfly/tichuml/issues/74) tracks a full
  gameplay-surface redesign requirement: the main live table should become a
  player-first physical-table presentation with auto-simplifying calm,
  decision, and resolution states; the table should keep minimal opponent info,
  hidden-until-needed controls, bare felt, and strong active-turn emphasis; the
  deck should move to a custom Tichu-native authored language with elevated
  special cards; and operator mode should become a separate full analysis
  surface rather than layering diagnostics onto the player table.
- Affected Systems: `apps/web/src/App.tsx`,
  `apps/web/src/game-table-views.tsx`,
  `apps/web/src/game-table-view-model.ts`,
  `apps/web/src/styles.css`,
  table layout/view assets, gameplay deck/card assets, and operator-mode UI
  surfaces.
- Linked GitHub Issue: [#74](https://github.com/NeonButrfly/tichuml/issues/74)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-03 - Trick-play auto-advance must never enter the browser with a missing active seat

- Prompt Signal: Live gameplay was reaching `trick_play` with the runtime error
  `Cannot derive canonical active seat from state: phase=trick_play, activeSeat=null.`,
  which led to backend 500s, repeated `frontend_apply_failed` retries, and a
  stuck UI after exchange / Dragon-gift handoff.
- Interpreted Requirement: Issue
  [#58](https://github.com/NeonButrfly/tichuml/issues/58) also tracks a
  stricter live turn-flow invariant: when the engine enters or remains in
  `trick_play`, it must carry a real `activeSeat` for the acting seat,
  including Dragon-gift selection states; exchange completion must hand the
  lead to the Mahjong holder; and the browser decision-provider must refuse to
  send backend requests for malformed `trick_play` states with
  `activeSeat=null`, resolving locally instead of entering an infinite retry
  loop.
- Affected Systems: `packages/engine/src/engine.ts`,
  `apps/web/src/backend/decision-provider.ts`,
  `tests/integration/engine-core.test.ts`,
  `tests/integration/live-gameplay-executor.test.ts`.
- Linked GitHub Issue: [#58](https://github.com/NeonButrfly/tichuml/issues/58)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-03 - Browser decision-provider code must not depend on Node globals during trick play

- Prompt Signal: Live trick-play automation was failing in the browser with
  repeated `frontend_apply_failed` retries and the concrete runtime error
  `process is not defined`, which confirmed that the browser decision-provider
  path was still evaluating Node-oriented environment access.
- Interpreted Requirement: Issue
  [#58](https://github.com/NeonButrfly/tichuml/issues/58) also tracks a hard
  browser-runtime contract for live automation: frontend decision-provider,
  executor, and browser-imported heuristic/engine helpers must not rely on
  `process`, `process.env`, or `process.nextTick`; browser env reads must use
  Vite/browser-safe access, trick-play decision resolution must return a valid
  action without throwing, and successful backend trick-play responses must
  remain applyable by the frontend without entering an infinite retry loop.
- Affected Systems: `apps/web/src/backend/decision-provider.ts`,
  `packages/shared/src/runtime-env.ts`, `packages/ai-heuristics/src/index.ts`,
  `packages/ai-heuristics/src/aggression-config.ts`,
  `packages/engine/src/engine.ts`, `packages/telemetry/src/client.ts`,
  `tests/integration/live-gameplay-executor.test.ts`.
- Linked GitHub Issue: [#58](https://github.com/NeonButrfly/tichuml/issues/58)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-03 - Grand Tichu auto-advance must stay in sync with the real game state

- Prompt Signal: The live table could get stuck showing `grand_tichu_window`
  with `Auto-advancing` even though the next phase never arrived cleanly, so
  the request explicitly required a real state-transition and sync repair
  rather than a visual-only workaround.
- Interpreted Requirement: Issue
  [#58](https://github.com/NeonButrfly/tichuml/issues/58) now also tracks a
  hard invariant for live GT automation: auto-advance requests must apply
  exactly once, frontend phase and backend-decided action context must stay
  logged and aligned, `Auto-advancing` must clear on success or surface a real
  error on failure, and the `Next` control must work as a legal retry path when
  non-local GT automation fails.
- Affected Systems: `apps/web/src/App.tsx`,
  `apps/server/src/services/decision-service.ts`,
  `tests/integration/live-gameplay-executor.test.ts`,
  `tests/integration/web-table-model.test.ts`, and related server-heuristic /
  telemetry regression coverage.
- Linked GitHub Issue: [#58](https://github.com/NeonButrfly/tichuml/issues/58)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-03 - Fast-path decision requests must stay actor-scoped during GT auto-advance

- Prompt Signal: Live Grand Tichu automation surfaced the backend contract
  error `Fast-path decision requests require an actor-scoped legal action
  list`, which meant the UI was sending stale or map-shaped `legal_actions`
  into the fast-path decision route.
- Interpreted Requirement: Issue
  [#58](https://github.com/NeonButrfly/tichuml/issues/58) also tracks a
  stricter request-building invariant for live automation: before any backend
  decision request, legal actions must be re-scoped to the current actor,
  ownership must be validated, fast-path may only run when the actor/state
  request context is current and safe, and unsafe fast-path attempts must
  demote to the normal rich server heuristic path instead of stalling the
  table.
- Affected Systems: `apps/web/src/App.tsx`,
  `apps/server/src/providers/heuristic-provider.ts`,
  `tests/integration/live-gameplay-executor.test.ts`,
  `tests/integration/server-heuristic-contract.test.ts`.
- Linked GitHub Issue: [#58](https://github.com/NeonButrfly/tichuml/issues/58)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-03 - Grand Tichu window decisions must stay GT-only

- Prompt Signal: The deeper GT bug report clarified that the Grand Tichu window
  must not be treated like a generic phase-advance or play/pass decision. In
  that window, the actor should only choose between `call_grand_tichu` and
  `decline_grand_tichu`.
- Interpreted Requirement: Issue
  [#58](https://github.com/NeonButrfly/tichuml/issues/58) also tracks a GT
  decision contract for live UI flow: GT auto-advance requests must send only
  actor-scoped GT actions, the `Grand Tichu` button must submit
  `call_grand_tichu`, the `Next` button must submit `decline_grand_tichu`, and
  the phase must progress seat-by-seat through the GT queue before exiting to
  `pass_select`.
- Affected Systems: `apps/web/src/App.tsx`,
  `tests/integration/live-gameplay-executor.test.ts`, and live GT executor
  logging/validation.
- Linked GitHub Issue: [#58](https://github.com/NeonButrfly/tichuml/issues/58)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-03 - Grand Tichu fast-path requests must carry actor-scoped compact state

- Prompt Signal: The live GT window still failed after the actor-scoped action
  repair, now with `Cannot read properties of undefined (reading 'map')`,
  which pointed to the backend fast-path receiving an incomplete `state_norm`
  payload during non-local GT auto-advance.
- Interpreted Requirement: Issue
  [#58](https://github.com/NeonButrfly/tichuml/issues/58) also tracks a fast
  path payload invariant for live UI automation: when the frontend requests
  `server_heuristic` fast-path decisions, `state_norm` must be the compact
  actor-scoped fast state with `actorHand` and core turn data, not the public
  derived view. If a caller still sends incomplete fast-path state, the backend
  must demote to rich-path instead of crashing the live GT loop.
- Affected Systems: `apps/web/src/App.tsx`,
  `apps/server/src/providers/heuristic-provider.ts`,
  `tests/integration/live-gameplay-executor.test.ts`,
  `tests/integration/server-heuristic-contract.test.ts`.
- Linked GitHub Issue: [#58](https://github.com/NeonButrfly/tichuml/issues/58)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-03 - Exchange automation must prioritize required pass selections over optional Tichu

- Prompt Signal: Live exchange flow could stall after the local player
  submitted a pass selection, leaving the UI stuck on `Waiting for exchanges`
  because automation was not consistently selecting the seats that still owed a
  required `select_pass`.
- Interpreted Requirement: Issue
  [#58](https://github.com/NeonButrfly/tichuml/issues/58) also tracks a
  pass-select actor contract that mirrors the GT fix pattern: live automation
  must derive the exchange actor from seats that still lack
  `state.passSelections[seat]` and currently own a `select_pass` legal action,
  prefer those required exchange actors over optional `call_tichu` actions, and
  send actor-scoped `select_pass` fast-path requests until the engine naturally
  advances through `pass_reveal` and `exchange_complete`.
- Affected Systems: `apps/web/src/table-model.ts`,
  `apps/web/src/App.tsx`,
  `tests/integration/web-table-model.test.ts`,
  `tests/integration/live-gameplay-executor.test.ts`.
- Linked GitHub Issue: [#58](https://github.com/NeonButrfly/tichuml/issues/58)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - Passing lanes layout

- Prompt Signal: The forward stabilization request explicitly called out passing lanes layout.
- Interpreted Requirement: Left, partner, and right pass lanes must remain directionally clear, readable, and stable across all seats and narrower viewports.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, layout and viewport tests.
- Linked GitHub Issue: [#19](https://github.com/NeonButrfly/tichuml/issues/19)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - Trick fanning

- Prompt Signal: The forward stabilization request explicitly called out trick fanning.
- Interpreted Requirement: Seat-local trick displays should fan multi-card combinations clearly without crowding nearby overlays or obscuring card identity.
- Affected Systems: `apps/web/src/game-table-views.tsx`, `apps/web/src/table-layout.ts`, trick-display tests and screenshot verification.
- Linked GitHub Issue: [#20](https://github.com/NeonButrfly/tichuml/issues/20)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - UI clarity issues

- Prompt Signal: The forward stabilization request explicitly called out UI clarity issues.
- Interpreted Requirement: Rule-driven states such as active wishes should be visible and understandable from the live table UI without relying on code knowledge.
- Affected Systems: `apps/web/src/game-table-view-model.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/App.tsx`, view-model and component tests.
- Linked GitHub Issue: [#21](https://github.com/NeonButrfly/tichuml/issues/21)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - Canonical layout JSON

- Prompt Signal: The table layout system must keep `layout.json` as the canonical artifact and make the runtime/editor reflect the corrected play surface without drift.
- Interpreted Requirement: The shipped table layout must live in one canonical JSON file, and runtime defaults plus editor load/save/reset behavior must use that same schema and anchor set without stale XML or hard-coded default divergence.
- Affected Systems: `apps/web/src/layout.json`, `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/App.tsx`, layout integration tests.
- Linked GitHub Issue: [#27](https://github.com/NeonButrfly/tichuml/issues/27)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - Shared play-area anchoring and exchange origin clarity

- Prompt Signal: The normal table UI must feel perfectly centered and symmetric under one shared coordinate system, and exchange-complete received cards must remain visible in directional passing lanes until pickup.
- Interpreted Requirement: Runtime seat regions, overlays, center messaging, editor regions, and pass lanes must resolve `layout.json` through one board-space reference so south turn state, east/west centering, west safe inset, north spacing, and editor/runtime correspondence stay aligned; exchange-complete received cards must render in the receiver's left/partner/right lanes instead of collapsing into a generic pickup pile.
- Affected Systems: `apps/web/src/App.tsx`, `apps/web/src/game-table-views.tsx`, `apps/web/src/table-layout.ts`, `apps/web/src/styles.css`, table editor geometry, exchange/layout integration tests.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-10 - East and west side-seat anchoring

- Prompt Signal: The east and west side-seat area still showed detached labels and a broken west-hand composition even after manual `layout.json` edits.
- Interpreted Requirement: Runtime side-seat placement must stop treating east/west labels as global board-edge overlays; the side label must be attached inside the same seat container as the side hand, while side-label anchor math only applies edge-safe clamping after reading the layout data and both side seat regions continue centering on the same hand anchors so west does not pick up a stale left-shift.
- Affected Systems: `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, `apps/web/src/table-layout.ts`, side-seat layout integration tests, prompt-linked validation for the normal table runtime/editor layout.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-15 - Canonical table geometry rewrite

- Prompt Signal: The controlled UI layout rewrite requested a checkpoint commit/tag first, then a canonical rectangular table geometry with N/E/S/W seat anchors, hand-attached labels, directional exchange lanes, a clean center area, separated south action row, and runtime/editor alignment without changing gameplay, phase, button, Tichu, passing, pickup, wish, trick, score, bot, card-art, or rule logic.
- Interpreted Requirement: Runtime and editor layout must derive from one board-space play surface. Each visual seat must expose a canonical seat anchor (`northSeat`, `eastSeat`, `southSeat`, `westSeat`) whose hand bounds determine the seat label and exchange lanes; east and west labels must resolve directly from side hand bounds instead of screen-edge clamps or fallback layout anchors.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, `tests/integration/normal-viewport-layout.test.ts`, live normal-table/editor verification.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-15 - Post-rewrite structural correction

- Prompt Signal: The follow-up layout prompt identified remaining structural issues after the broader rewrite: west anchoring, north/south label polarity, action row spacing, pass-lane alignment, arc-style play areas, and detached `T` / `GT` / turn / out badges.
- Interpreted Requirement: Keep the existing canonical geometry system and correct only seat-derived positions: west must mirror east from the same side-seat model, north labels sit above the hand, south labels sit below the hand, action controls sit lower than the south identity zone, trick/pickup stage cards use straight rows or columns, and badges attach to each player's identity zone according to seat direction.
- Affected Systems: `apps/web/src/layout.json`, `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, layout/staging integration tests, normal-table browser verification.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-15 - Spacing and collision-avoidance polish

- Prompt Signal: The spacing polish prompt narrowed the remaining work to breathing room, overlap prevention, phase-stable separation, and directional pass-lane alignment without changing gameplay, buttons, phases, rules, bots, card art, colors, or the broader table design.
- Interpreted Requirement: Keep the existing anchor system and normalize shared spacing tokens so pass lanes, hands, labels, badges, stage cards, central metadata, and the action row keep clearance across supported resolutions. South lanes must render as a bottom-aligned `< ^ >` row above the south hand, north as a top-aligned `< v >` row below the north hand, east as a right-aligned `^ < v` column left of the east hand, and west as a left-aligned `^ > v` column right of the west hand.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `tests/integration/normal-viewport-layout.test.ts`, normal-table browser collision verification.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-15 - Final alignment and orientation correction

- Prompt Signal: The final correction prompt required score/label/hand stack enforcement, east/west play-area centering, compact pass-lane clusters, seat-relative stage anchoring, horizontal east/west hands, strict seat-facing card orientation, and collision prevention without gameplay or button changes.
- Interpreted Requirement: Keep the canonical layout system and make the rules explicit: score stays top-center, north label stacks below score before the north hand, east/west hands share the play-surface centerY and render as horizontal rows, pass lanes use compact table-centered clusters outside the current source hand, and hand/stage cards face up/down/left/right according to seat.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, `tests/integration/normal-viewport-layout.test.ts`, normal-table browser collision and orientation smoke checks.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-15 - Side-seat card orientation regression

- Prompt Signal: The east/west hand regression prompt identified CSS/render rotation as the root cause of broken side-seat layout boxes, spacing, clipping, and fan behavior.
- Interpreted Requirement: Normal-table cards must not use visual rotation transforms. Seat orientation must come from the canonical play-area coordinate contract, card ordering, fan axis, and edge alignment: north/south fan on X, east/west fan downward on Y with east visually reversed and right-aligned, west normal order and left-aligned.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, `tests/integration/normal-viewport-layout.test.ts`, `tests/integration/trick-ui-cleanup.test.ts`, normal-table browser orientation smoke checks.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Localized hand-and-slot orientation correction

- Prompt Signal: The follow-up prompt froze the current table geometry and requested only localized fixes for east/west hand card orientation, north hand card sizing, pass-slot rotation, played-card seat binding, and west status-cluster ordering.
- Interpreted Requirement: Keep the existing layout baseline untouched outside the named targets. Rotate only west/east card elements, scale only north hand card elements while slightly tightening the north fan, rotate only pass-slot elements in place by destination, move only trick-stage render anchors slightly toward their owning seats, and reorder only the west OUT badge to sit to the right of the west T/GT badge.
- Affected Systems: `apps/web/src/styles.css`, `apps/web/src/game-table-views.tsx`, `apps/web/src/table-layout.ts`, targeted layout validation and browser smoke checks.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Visible pass-slot rotation and side-edge/north alignment correction

- Prompt Signal: The latest correction prompt kept the current table baseline frozen and narrowed the remaining work to visible pass-slot rotation, south duplicate-slot cleanup, east/west edge inset, north vertical alignment, and north-lane follow.
- Interpreted Requirement: Keep lane groups, slot order, seat labels, score, center text, buttons, south hand, and global geometry fixed. Rotate the visible pass-slot surfaces instead of only the slot wrapper, remove the apparent extra south-left slot artifact without changing the valid south lane set, inset east/west hand-plus-status clusters slightly inward on X only, and move the north hand upward on Y with the north lane cluster maintaining the tighter relationship.
- Affected Systems: `apps/web/src/styles.css`, `apps/web/src/table-layout.ts`, `tests/integration/normal-viewport-layout.test.ts`, browser exchange-view verification.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Phase-aware pass-lane and trick-anchor nudges

- Prompt Signal: The phase-aware nudge prompt froze the broader table geometry and asked only for north/south across-lane nudges, a slightly deeper east/west side inset, and played-card anchors that reuse the same seat-local region as pass lanes instead of reserving cross-phase clearance.
- Interpreted Requirement: Keep score, center text, buttons, hands, labels, status mapping, and the global layout algorithm fixed. Apply only small seat-axis nudges: lift the north pass-across cluster slightly, drop the south pass-across cluster slightly only within its current row, move east/west side-seat clusters slightly inward on X, and let trick-stage anchors derive from the same middle pass-lane anchor region because pass lanes are hidden during play.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `tests/integration/normal-viewport-layout.test.ts`, `tests/integration/trick-ui-cleanup.test.ts`, normal-table exchange/trick browser verification.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Precision inset, north tightening, and trick-orientation correction

- Prompt Signal: The latest prompt froze the broader table layout and requested only a precision nudge pass: stronger east/west inset, a slightly higher north hand, element-level center pass-slot orientation, slightly relaxed trick anchors, and corrected east/west played-card orientation while keeping the vertical trick stacks intact.
- Interpreted Requirement: Keep score, center text, buttons, south hand, hand card sizing, hand fan spacing, and the broader layout algorithm fixed. Increase only the side-seat X inset, tighten only the north hand Y position beneath the existing score/label stack, keep pass-lane groups fixed while rotating the visible slot elements instead of the parent lane container, relax trick-stage render anchors slightly away from their seats for readability, and rotate only east/west trick card elements so west faces left and east faces right.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, `tests/integration/normal-viewport-layout.test.ts`, `tests/integration/trick-ui-cleanup.test.ts`, targeted exchange/trick validation.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Partner-lane anchor correction

- Prompt Signal: The latest prompt narrowed the work to the center or partner passing lane, requiring it to act as the true anchor reference for each seat’s lane cluster instead of merely being the middle lane by array order.
- Interpreted Requirement: Keep the existing lane system, hand sizing, card orientation, and general geometry intact. Compute the partner lane first from the canonical play-surface axis, enforce the seat-specific orientation there, then derive the outer lanes symmetrically from that anchor using post-rotation visual bounds and a small minimum gap so north and south clusters center on `playArea.centerX` and east and west clusters center on `playArea.centerY`.
- Affected Systems: `apps/web/src/table-layout.ts`, `tests/integration/normal-viewport-layout.test.ts`, targeted pass-lane validation.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Side-seat label midpoint and badge-row correction

- Prompt Signal: The latest UI prompt narrowed the work to east and west identity geometry, separating side labels from side badge rows and requiring midpoint rail labels plus hand-centered T/GT/out markers.
- Interpreted Requirement: Keep lane geometry, hand sizing, card orientation, and the broader layout fixed. Compute east and west labels at the horizontal midpoint between the live side-label border span and the corresponding hand bounds while keeping label `centerY` aligned to the hand, and render those side labels in board-overlay space instead of seat-local space. Center the side T/GT/out badge row above each hand with a fixed hand-to-badge gap instead of anchoring those markers to the vertical side label.
- Affected Systems: `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `tests/integration/normal-viewport-layout.test.ts`, targeted side-seat identity validation.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Passing-lane shared-edge alignment correction

- Prompt Signal: The latest passing-lane prompt tightened the cluster contract by requiring the partner lane to stay edge-aligned with both outer lanes: north shares the top edge, south shares the bottom edge, east shares the right edge, and west shares the left edge.
- Interpreted Requirement: Keep gameplay, hands, stage cards, and the broader table layout fixed. Compute the partner lane first from the seat-local anchor, keep its seat-specific orientation, then derive the outer lanes with symmetric post-rotation spacing while enforcing the shared edge line so each three-lane cluster reads as one anchored unit instead of three independently centered boxes.
- Affected Systems: `apps/web/src/table-layout.ts`, `tests/integration/normal-viewport-layout.test.ts`, targeted pass-lane validation.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-16 - Side-seat exchange lane spacing and schema correction

- Prompt Signal: The latest prompt narrowed the work to east and west exchange lanes, calling out cramped hand-to-lane spacing, misaligned side stacks, and the need to move those side-lane anchors into the canonical layout schema instead of render-time nudges.
- Interpreted Requirement: Keep gameplay, buttons, phases, hand sizing, and the rest of the table layout fixed. Add schema-backed side-lane spacing tokens to the canonical layout config, derive east and west pass-lane anchors from the side hand bounds using that larger hand-to-lane gap, keep the side stacks vertically centered and mirrored, and preserve the existing seat-relative side-lane orientation rules through the canonical lane geometry path.
- Affected Systems: `apps/web/src/layout.json`, `apps/web/src/table-layout.ts`, `apps/web/src/game-table-views.tsx`, `tests/integration/normal-viewport-layout.test.ts`, exchange-view validation.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-17 - Centered Mahjong wish modal selector

- Prompt Signal: The local Mahjong wish flow must stop using inline/manual entry UI and instead open a centered blocking modal with a vertical rolling selector and confirm-first submission.
- Interpreted Requirement: When the local human player must make a Mahjong wish, the table should open a centered modal dialog titled `Make a Wish`, present only the legal standard ranks (`2` through `A`) in a vertical selector, block table interaction behind a scrim, and submit the selected rank through the existing wish flow only after explicit confirmation.
- Affected Systems: `apps/web/src/App.tsx`, `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, `tests/integration/mahjong-wish-dialog.test.ts`.
- Linked GitHub Issue: [#29](https://github.com/NeonButrfly/tichuml/issues/29)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-17 - Mahjong wish selector no-wish default

- Prompt Signal: The Mahjong wish modal must expose an explicit `No Wish` choice as the first rolling-selector item, select it by default, and allow immediate confirmation without choosing a rank.
- Interpreted Requirement: Keep the centered modal interaction and rank choices intact, but treat `No Wish` as an explicit selectable value in the same vertical picker. The UI should submit `null` as the chosen wish, leave future trick play unconstrained by a wished rank, and preserve existing ranked-wish enforcement when a rank is selected.
- Affected Systems: `packages/engine/src/types.ts`, `packages/engine/src/engine.ts`, `apps/web/src/App.tsx`, `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, `tests/integration/mahjong-wish-dialog.test.ts`, `tests/integration/engine-core.test.ts`.
- Linked GitHub Issue: [#29](https://github.com/NeonButrfly/tichuml/issues/29)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-17 - East/west received-card pickup lane centering

- Prompt Signal: The exchange-complete pickup view still showed east and west received cards offset within their directional pass lanes instead of reading as clean centered side stacks.
- Interpreted Requirement: Keep the existing directional lane system and hand clearance, but during `exchange_complete` the east and west received-card lanes must use each lane container's own center as the card placement reference so the three side lanes form an even vertical stack and each card stays centered inside its lane frame until Pickup.
- Affected Systems: `apps/web/src/App.tsx`, `apps/web/src/game-table-views.tsx`, `apps/web/src/table-layout.ts`, `tests/integration/normal-viewport-layout.test.ts`, `tests/integration/trick-ui-cleanup.test.ts`.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-17 - East/west filled pickup-lane orientation correction

- Prompt Signal: The follow-up screenshot showed that east and west received cards were still using mixed filled-lane orientations during `exchange_complete`, even after the side stacks were centered.
- Interpreted Requirement: Keep the centered pickup stacks intact, but rotate filled `exchange_complete` pickup cards by the rendered lane arrow, once and only once. North/south rows use `left / upright / right`; west uses `up / right / down`; east uses `up / left / down`. Normal pass-lane states keep their existing route-based lane rotation behavior.
- Affected Systems: `apps/web/src/game-table-views.tsx`, `apps/web/src/styles.css`, `tests/integration/trick-ui-cleanup.test.ts`, `tests/integration/normal-viewport-layout.test.ts`.
- Linked GitHub Issue: [#28](https://github.com/NeonButrfly/tichuml/issues/28)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-04-18 - Master control panel observability dashboard

- Prompt Signal: The debug screen must be upgraded into a full master control panel that unifies live gameplay state, provider transparency, heuristic and shallow-lookahead reasoning, telemetry completeness, backend connectivity, ML model status, exchange visibility, and collection readiness.
- Interpreted Requirement: Keep gameplay functional, but make debug mode the primary system observability surface. The dashboard must expose a fast-read status strip, structured game-state and seat metrics, provider-requested versus provider-used transparency, top candidate reasoning, heuristic and lookahead metrics, telemetry completeness including exchange coverage, backend and ML status, visible pass/exchange staging, a hand-structure inspector, a recent-event timeline, runtime backend controls, and collapsible raw payload drawers with snapshot freezing.
- Affected Systems: `apps/web/src/App.tsx`, `apps/web/src/game-table-views.tsx`, `apps/web/src/master-control-model.ts`, `apps/web/src/styles.css`, `apps/web/src/backend/client.ts`, `apps/web/src/backend/decision-provider.ts`, `apps/web/src/backend/telemetry.ts`, `apps/server/src/providers/heuristic-provider.ts`, `apps/server/src/providers/lightgbm-provider.ts`, `packages/ai-heuristics/src/index.ts`, `tests/integration/master-control-model.test.ts`.
- Linked GitHub Issue: [#32](https://github.com/NeonButrfly/tichuml/issues/32)
- Milestone: [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status Source: GitHub issue state only.

### 2026-04-18 - Backend reachability versus payload-validity diagnostics

- Prompt Signal: Live backend integration showed that `/health`, `/api/decision/request`, and `/api/telemetry/event` were reachable even while some live decision and telemetry payloads were failing validation, so the master control panel must stop presenting those as backend-outage states.
- Interpreted Requirement: Backend status must be endpoint-reachability based, not success-only based. The dashboard must distinguish reachable endpoints from invalid live payloads, track `/health`, `/api/decision/request`, and `/api/telemetry/event` separately, surface last success and validation-failure reasons, keep server-mode decision requests on full live `state_raw`, ensure telemetry payloads include required fields like `ts`, and compute collection readiness only when backend reachability, valid live decision payloads, valid telemetry payloads, and exchange recording are all satisfied.
- Affected Systems: `apps/web/src/backend/client.ts`, `apps/web/src/backend/decision-provider.ts`, `apps/web/src/backend/telemetry.ts`, `apps/web/src/App.tsx`, `apps/web/src/game-table-views.tsx`, `apps/web/src/master-control-model.ts`, `tests/integration/backend-client.test.ts`, `tests/integration/master-control-model.test.ts`.
- Linked GitHub Issue: [#32](https://github.com/NeonButrfly/tichuml/issues/32)
- Milestone: [6.5 – Local ML Integration & Reproducible Backend](https://github.com/NeonButrfly/tichuml/milestone/24)
- Status Source: GitHub issue state only.

### 2026-05-22 - Alternate table Pixi conversion and canonical passing-lane direction reuse

- Prompt Signal: The alternate luxury table was still too flat, too text-heavy, and its passing lanes no longer matched the original table’s directional exchange geometry; the updated renderer must move to Pixi or Phaser rather than stay CSS-only.
- Interpreted Requirement: Keep the normal table untouched, keep the alternate table on the same backend/state/action pipeline, and rebuild the alternate visual surface so a Pixi-backed board owns the wood/felt/perspective treatment while the alternate pass routes reuse the canonical lane-direction mapping from the normal table. Reduce nonessential text, keep the south-player perspective dominant, and preserve hidden-information rules.
- Affected Systems: `apps/web/src/alternate-game-table-view.tsx`, `apps/web/src/alternate-table/layout.ts`, `apps/web/src/alternate-table/pixi-surface.tsx`, `apps/web/src/styles.css`, `apps/web/src/alternate-table/README.md`, `tests/integration/alternate-table-view.test.ts`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-22 - Alternate table pass-select preview and play-area maximization

- Prompt Signal: The follow-up prompt pushed the alternate table toward the mockup by demanding more usable table and less border, stronger 2.5D perspective, and explicit visual tuning against a real pass-select state instead of Grand Tichu screenshots.
- Interpreted Requirement: Keep the normal table and live backend path intact, but add an explicit dev-only `?table=alt&preview=pass-select` route that boots a real engine-driven exchange state for renderer tuning. Use that state to compress overlay text, push the north rail upward, lift the south shelf into view, widen the felt footprint, and keep pass-lane directionality tied to the canonical normal-table mapping.
- Affected Systems: `apps/web/src/App.tsx`, `apps/web/src/game-table-view-model.ts`, `apps/web/src/alternate-table/preview-session.ts`, `apps/web/src/alternate-table/layout.ts`, `apps/web/src/alternate-table/pixi-surface.tsx`, `apps/web/src/alternate-game-table-view.tsx`, `apps/web/src/styles.css`, `apps/web/src/alternate-table/README.md`, `tests/integration/alternate-table-preview-session.test.ts`, `tests/integration/game-table-view-model.test.ts`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-22 - Alternate table mockup-comparison rail integration pass

- Prompt Signal: After the mockup comparison, the next ask was to keep pushing until the alternate table felt “pro grade,” with the main gaps called out as object-read, tray integration, and camera perspective rather than gameplay wiring.
- Interpreted Requirement: Keep the same live alternate renderer path, but use the mockup comparison to strengthen the physical table read. Add more carved rail detail, integrate a front plaque and decorative wells into the Pixi surface, fix ornament-path rendering defects, and preserve a measurable “more table, less border” geometry through focused layout regression checks.
- Affected Systems: `apps/web/src/alternate-table/pixi-surface.tsx`, `apps/web/src/alternate-table/README.md`, `tests/integration/alternate-table-layout.test.ts`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-22 - Alternate table must inherit the normal table's exact seat and lane organization

- Prompt Signal: After reviewing the screenshot closely, the user rejected the
  alternate renderer as disorganized, called out the south hand and pass lanes
  as misaligned, and explicitly asked for one final attempt that reuses the
  original table's exact seat, hand, and lane organization instead of spending
  more time on freehand alternate-only layout tuning.
- Interpreted Requirement: Keep the normal table untouched and keep the
  alternate table on the same real gameplay pipeline, but stop inventing a
  separate alternate geometry model. The alternate luxury surface should derive
  seat racks, south-hand span, and pass-lane anchors from the normal table's
  canonical hand bounds and pass-lane geometry, then project those anchors into
  the Pixi perspective table so the south hand, west/east stacks, and exchange
  lanes stay organized.
- Affected Systems: `apps/web/src/alternate-table/layout.ts`,
  `apps/web/src/alternate-table/hand-layout.ts`,
  `apps/web/src/alternate-game-table-view.tsx`,
  `apps/web/src/alternate-table/README.md`,
  `tests/integration/alternate-table-layout.test.ts`,
  `tests/integration/alternate-hand-layout.test.ts`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-22 - Alternate table should become truly 3D with rotating perspectives

- Prompt Signal: After the anchor rebuild improved organization, the next ask
  explicitly pushed the alternate table beyond faux depth: “dial it in” and
  make it “truly 3d with rotating perspectives.”
- Interpreted Requirement: Keep the normal table untouched and keep the
  alternate table on the same live backend/state/action pipeline, but replace
  the alternate renderer body with a real 3D scene rather than relying only on
  faux-depth tricks. The alternate surface should gain a south-default 3D
  camera with bounded perspective controls while preserving the canonical
  gameplay anchors and hidden-information rules.
- Affected Systems: `apps/web/src/alternate-table/three-surface.tsx`,
  `apps/web/src/alternate-game-table-view.tsx`,
  `apps/web/package.json`,
  `apps/web/src/styles.css`,
  `apps/web/src/alternate-table/README.md`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-22 - Alternate table rail integration and pass-lane cleanup

- Prompt Signal: After reviewing the live 3D screenshots, the follow-up prompts
  rejected the chunky seat blocks, asked for opponent cards to sit on the
  rails, called the pass geometry wrong, and explicitly asked to remove the
  sort controls so that space could go back to the table.
- Interpreted Requirement: Keep the normal table untouched and keep the
  alternate table on the same live backend/state/action pipeline, but flatten
  the fake tray blocks into rail-integrated detail, move the opponent racks
  outward onto the wood rails, make the pass routes visibly framed and adjacent
  to their source seats, and trim the alternate control shelf down to the core
  play actions plus clear/continue utilities.
- Affected Systems: `apps/web/src/alternate-table/layout.ts`,
  `apps/web/src/alternate-table/three-surface.tsx`,
  `apps/web/src/alternate-game-table-view.tsx`,
  `apps/web/src/styles.css`,
  `tests/integration/alternate-table-layout.test.ts`,
  `tests/integration/alternate-table-view.test.ts`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-22 - Alternate table center cleanup and actual rotation control

- Prompt Signal: The next visual correction rejected the remaining center
  ornament and gold arc outright, called out the alternate table as still too
  2D, said it did not feel rotatable, and flagged the south hand plus edge
  spacing as still not aligned. A follow-up reference image emphasized that the
  cards should feel seated on one shared perspective plane instead of floating
  as independent widgets.
- Interpreted Requirement: Keep the normal table untouched and keep the
  alternate table on the same live backend/state/action pipeline, but remove
  the decorative center props, add real bounded camera yaw instead of only
  left/center/right preset switching, widen the table footprint, and tighten
  the south hand fan so the cards sit on a cleaner shared plane with less dead
  border space.
- Affected Systems: `apps/web/src/alternate-table/three-surface.tsx`,
  `apps/web/src/alternate-game-table-view.tsx`,
  `apps/web/src/alternate-table/hand-layout.ts`,
  `apps/web/src/alternate-table/layout.ts`,
  `apps/web/src/styles.css`,
  `apps/web/src/alternate-table/README.md`,
  `tests/integration/alternate-hand-layout.test.ts`,
  `tests/integration/alternate-table-view.test.ts`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-22 - Alternate table should pivot to a true south-perspective projection layer

- Prompt Signal: The immersive-table reset explicitly restated that the normal
  table must not regress, then asked for a low south-player camera angle like
  the attached wooden-table reference image: oval tabletop, large near south
  hand, smaller far hands, played cards projected into table space, soft
  shadows, and a 2.5D board-game feel with minimal wasted space.
- Interpreted Requirement: Keep the existing gameplay brain, routing, backend,
  telemetry, and rule enforcement untouched, but rebuild the alternate table’s
  geometry layer around a pure south-perspective projection module. Cards,
  remote hands, trick cards, and pass routes should all derive from the same
  fake-perspective transform instead of being laid out as separate overlay
  panels.
- Affected Systems: `apps/web/src/alternate-game-table-view.tsx`,
  `apps/web/src/alternate-table/south-perspective-projection.ts`,
  `apps/web/src/alternate-table/three-surface.tsx`,
  `apps/web/src/styles.css`,
  `apps/web/src/alternate-table/README.md`,
  `tests/integration/south-perspective-projection.test.ts`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-22 - Alternate table should move from projected DOM cards to a Phaser-owned scene

- Prompt Signal: After reviewing the closer wooden-table reference, the follow-up
  prompt explicitly approved a Phaser pivot and clarified that the real problem
  was the table body and cards not living on the same perspective plane.
- Interpreted Requirement: Keep the normal table untouched and keep the
  alternate table on the same live backend/state/action/telemetry path, but
  replace the alternate visual body with a Phaser scene that owns the room,
  table, remote hands, trick cards, pass lanes, and south hand rendering. React
  may remain only for minimal hit targets, action buttons, and phase dialogs.
- Affected Systems: `apps/web/src/alternate-game-table-view.tsx`,
  `apps/web/src/alternate-table/phaser-surface.tsx`,
  `apps/web/src/alternate-table/south-perspective-projection.ts`,
  `apps/web/package.json`,
  `apps/web/src/styles.css`,
  `apps/web/src/alternate-table/README.md`,
  `tests/integration/alternate-table-view.test.ts`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-23 - Immersive table must use a deterministic full-viewport south rig

- Prompt Signal: The latest correction rejected the immersive table for leaving
  a huge unused black region above the table and for not matching the attached
  south-camera wooden-table screenshot. The prompt explicitly required a
  deterministic normalized geometry rig, full viewport ownership, overlay HUD
  panels that do not push the scene down, and a temporary `layoutDebug=1`
  overlay for viewport, ellipse, anchor, and safe-zone inspection.
- Interpreted Requirement: Keep the normal table untouched and keep the
  immersive table on the same state/action/backend/telemetry path, but rebuild
  the alternate layout around one normalized viewport config. The scene must
  measure the actual live stage size, anchor the table ellipse around the
  requested viewport percentages, keep the south hand large and centered near
  the bottom, and move status/state/action chrome into absolute overlays so the
  table fills the frame instead of sitting below spare layout space.
- Affected Systems: `apps/web/src/alternate-table/south-perspective-projection.ts`,
  `apps/web/src/alternate-game-table-view.tsx`,
  `apps/web/src/alternate-table/phaser-surface.tsx`,
  `apps/web/src/styles.css`,
  `apps/web/src/alternate-table/README.md`,
  `tests/integration/south-perspective-projection.test.ts`,
  `tests/integration/alternate-table-view.test.ts`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-23 - Alternate immersive table should use the game-studio React 3D path

- Prompt Signal: After reviewing the still-wrong immersive screenshots, the
  follow-up explicitly invoked `[@game-studio]` and asked for a table that
  should be photo realistic and look like the wooden-table reference image,
  then approved continuing on that plugin path.
- Interpreted Requirement: Keep the normal gameplay table and all gameplay
  state/rules/backend paths intact, but pivot the alternate renderer away from
  a stylized 2D/Phaser presentation and onto the React-hosted 3D game path so
  the table, room, cards, pass slots, shadows, and camera live in one visual
  world.
- Affected Systems: `apps/web/src/alternate-game-table-view.tsx`,
  `apps/web/src/alternate-table/three-surface.tsx`,
  `apps/web/src/alternate-table/south-perspective-projection.ts`,
  `apps/web/src/alternate-table/README.md`,
  `tests/integration/alternate-table-view.test.ts`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-23 - ALT table must rebuild toward the photorealistic tray-table reference

- Prompt Signal: The latest prompt raised the fidelity bar again and supplied a
  premium tray-table reference image with dark walnut rails, green felt inset,
  raised trays on all four sides, physical card thickness, warm lighting, and
  the explicit instruction to treat that image as the target rather than as
  loose inspiration.
- Interpreted Requirement: Keep the normal gameplay table completely unchanged,
  but rebuild the alternate table as a real 3D scene that uses the same live
  gameplay state/action pipeline. The alternate scene should use locally
  generated materials, reference asset path
  `docs/reference/photorealistic-alt-tichu-table.png`, 3D cards/trays/pass
  anchors, and a restrained overlay that does not dominate the table.
- Affected Systems: `apps/web/src/alternate-game-table-view.tsx`,
  `apps/web/src/alternate-table/scene-model.ts`,
  `apps/web/src/alternate-table/three-surface.tsx`,
  `apps/web/src/alternate-table/assets/generated/README.md`,
  `apps/web/src/alternate-table/README.md`,
  `docs/reference/photorealistic-alt-tichu-table.png`,
  `apps/web/src/styles.css`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-24 - ALT table should remove duplicate overlay chrome and keep only the bottom action rail

- Prompt Signal: The latest ALT-table correction explicitly rejected the
  persistent top-left and bottom-left status panels, the duplicate top-right
  `Rules` and `Settings` buttons, and the extra `Clear` action. The prompt
  required those overlays to move into the hamburger/menu path instead, while
  keeping only phase-aware gameplay controls and pinning them to the very
  bottom edge of the viewport.
- Interpreted Requirement: Keep the normal table and all gameplay plumbing
  unchanged, but simplify the alternate 3D table HUD so the visible scene is
  not covered by duplicate status chrome. The ALT view should render only the
  semantic hitboxes plus the live action rail at the bottom of the screen,
  without a separate visible `Clear` button.
- Affected Systems: `apps/web/src/alternate-game-table-view.tsx`,
  `apps/web/src/styles.css`,
  `tests/integration/alternate-table-view.test.ts`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.

### 2026-05-24 - ALT action rail should stay on one bottom row at the screen edge

- Prompt Signal: The follow-up correction rejected the remaining ALT control
  layout because the action buttons were still stacking into multiple rows and
  were not seated at the lowest edge of the viewport.
- Interpreted Requirement: Keep the alternate table phase-aware actions, but
  render them as one horizontal bottom rail pinned flush to the screen edge.
  Do not reintroduce visible overlay panels or a `Clear` button.
- Affected Systems: `apps/web/src/styles.css`,
  `apps/web/src/alternate-game-table-view.tsx`.
- Linked GitHub Issue: [#81](https://github.com/NeonButrfly/tichuml/issues/81)
- Milestone: [6.4 – Gameplay & UX Stabilization](https://github.com/NeonButrfly/tichuml/milestone/23)
- Status Source: GitHub issue state only.
