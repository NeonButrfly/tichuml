# Live Table Layout Hybrid Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the live South-player Tichu table into a safer, more spatially anchored, more readable surface with authored assets and a bounded graphics layer while preserving the existing gameplay/runtime contracts.

**Architecture:** Keep `apps/web/src/layout.json`, `table-layout.ts`, and the current React table runtime authoritative for geometry, hotkeys, gameplay flow, telemetry, and backend interaction. Add a bounded Pixi presentation layer for felt/rim/seat-depth visuals and authored assets, but derive every rendered position from the same canonical layout metrics and seat anchors that the current table/editor already use.

**Tech Stack:** React 19, TypeScript, Vite, canonical `layout.json` geometry, global CSS, SVG asset generation, PixiJS, `@pixi/react`, Vitest + jsdom integration tests.

---

## File Structure Map

### Existing files to modify

- `apps/web/package.json`
  - Add the bounded graphics-layer dependencies used by the live table only.
- `package-lock.json`
  - Record the workspace dependency change for the graphics layer.
- `apps/web/src/layout.json`
  - Keep the canonical runtime/editor geometry authoritative while moving hand, label, stage, and action-row anchors into safer positions.
- `apps/web/src/table-layout.ts`
  - Extend viewport metrics, safe insets, seat-anchor helpers, and reserved trick/wish/pass geometry without creating a second coordinate system.
- `apps/web/src/player-surface-view.tsx`
  - Mount the bounded graphics layer behind the current React seat/control composition and preserve the same layout container contract.
- `apps/web/src/game-table-views.tsx`
  - Use the updated canonical geometry for seats, labels, pass lanes, trick zone, wish zone, and seat-associated Tichu state.
- `apps/web/src/card-face.tsx`
  - Move the live card presentation from mostly styled placeholders toward authored fronts/backs and normal-vs-debug visibility rules.
- `apps/web/src/styles.css`
  - Tighten the South-hand safe zone, seat anchoring, badge consistency, active-turn cues, and fallback DOM styling around the hybrid graphics layer.
- `tests/integration/normal-viewport-layout.test.ts`
  - Lock the safe-table geometry at the required viewport sizes and card counts.
- `tests/integration/player-surface-view.test.ts`
  - Lock label consistency, South-hand clearance, and seat-associated state.
- `tests/integration/trick-ui-cleanup.test.ts`
  - Keep trick/pickup/pass rendering stable while reserving trick and wish regions.

### New files to create

- `apps/web/src/table-graphics-layer.tsx`
  - Bounded Pixi stage that renders felt, rim, seat glows, reserved trick region, wish region, and other non-authoritative visuals from canonical geometry.
- `apps/web/src/table-graphics-assets.ts`
  - Loads/exports generated table and card-skin assets used by the Pixi layer and DOM fallback components.
- `apps/web/src/assets/generated/table-felt.svg`
  - Authored felt texture/lighting asset.
- `apps/web/src/assets/generated/table-rim.svg`
  - Authored rail/rim asset.
- `apps/web/src/assets/generated/card-back.svg`
  - Authored shared card-back asset for non-local seats in normal mode.
- `apps/web/src/assets/generated/card-face-template.svg`
  - Authored front-card frame asset used by `CardFace`.
- `apps/web/src/assets/generated/special-dragon.svg`
  - Authored Dragon card motif.
- `apps/web/src/assets/generated/special-phoenix.svg`
  - Authored Phoenix card motif.
- `apps/web/src/assets/generated/special-dog.svg`
  - Authored Dog card motif.
- `apps/web/src/assets/generated/special-mahjong.svg`
  - Authored Mahjong card motif.
- `tests/integration/table-graphics-layer.test.ts`
  - jsdom coverage for the bounded Pixi host contract and graphics-layer/fallback wiring.

## Task 1: Add the Bounded Graphics-Layer Host

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Create: `apps/web/src/table-graphics-layer.tsx`
- Create: `apps/web/src/table-graphics-assets.ts`
- Test: `tests/integration/table-graphics-layer.test.ts`

- [ ] **Step 1: Write the failing graphics-layer host test**

```ts
// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeNormalViewportLayoutMetrics,
  DEFAULT_NORMAL_TABLE_LAYOUT
} from "../../apps/web/src/table-layout";
import { TableGraphicsLayer } from "../../apps/web/src/table-graphics-layer";

function render(element: ReturnType<typeof createElement>) {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, unmount: () => act(() => root.unmount()) };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TableGraphicsLayer", () => {
  it("mounts a bounded graphics host from canonical layout metrics", () => {
    const metrics = computeNormalViewportLayoutMetrics({
      viewportWidth: 1600,
      viewportHeight: 900,
      topCount: 8,
      bottomCount: 14,
      leftCount: 8,
      rightCount: 8,
      hasVariantPicker: true,
      hasWishPicker: false
    });

    const view = render(
      createElement(TableGraphicsLayer, {
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        layoutMetrics: metrics,
        activeSeatPosition: "bottom",
        wishActive: false
      })
    );

    const host = view.container.querySelector("[data-table-graphics-layer='true']");
    expect(host).not.toBeNull();
    expect(host?.getAttribute("data-active-seat")).toBe("bottom");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/table-graphics-layer.test.ts`

Expected: FAIL with `Cannot find module '../../apps/web/src/table-graphics-layer'`.

- [ ] **Step 3: Add the graphics dependencies**

```json
{
  "dependencies": {
    "@pixi/react": "^8.0.3",
    "pixi.js": "^8.2.6"
  }
}
```

- [ ] **Step 4: Create the minimal bounded graphics host**

```tsx
import { Application, Container, Graphics, Sprite } from "@pixi/react";
import type {
  NormalTableLayout,
  NormalViewportLayoutMetrics,
  SeatVisualPosition
} from "./table-layout";
import { getBoardBounds, resolveNormalBoardAnchorPoint } from "./table-layout";
import { TABLE_GRAPHICS_ASSETS } from "./table-graphics-assets";

export function TableGraphicsLayer(props: {
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
  activeSeatPosition: SeatVisualPosition | null;
  wishActive: boolean;
}) {
  const board = getBoardBounds(props.layoutMetrics);
  const playSurface = resolveNormalBoardAnchorPoint(
    props.normalTableLayout.playSurface,
    props.layoutMetrics
  );

  return (
    <div
      className="table-graphics-layer"
      data-table-graphics-layer="true"
      data-active-seat={props.activeSeatPosition ?? "none"}
    >
      <Application width={board.width} height={board.height} backgroundAlpha={0}>
        <Container x={board.left} y={board.top}>
          <Sprite
            texture={TABLE_GRAPHICS_ASSETS.tableFelt}
            width={board.width}
            height={board.height}
          />
          <Graphics
            draw={(graphics) => {
              graphics.clear();
              graphics.circle(playSurface.x - board.left, playSurface.y - board.top, 132);
              graphics.stroke({ color: 0xa7d6c4, alpha: 0.08, width: 2 });
            }}
          />
        </Container>
      </Application>
    </div>
  );
}
```

- [ ] **Step 5: Add the minimal asset export shim**

```ts
import tableFeltUrl from "./assets/generated/table-felt.svg";
import tableRimUrl from "./assets/generated/table-rim.svg";
import cardBackUrl from "./assets/generated/card-back.svg";

export const TABLE_GRAPHICS_ASSETS = {
  tableFelt: tableFeltUrl,
  tableRim: tableRimUrl,
  cardBack: cardBackUrl
} as const;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/integration/table-graphics-layer.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/src/table-graphics-layer.tsx apps/web/src/table-graphics-assets.ts tests/integration/table-graphics-layer.test.ts
git commit -m "feat: add bounded table graphics host"
```

## Task 2: Tighten Canonical Safe Geometry in `layout.json` and `table-layout.ts`

**Files:**
- Modify: `apps/web/src/layout.json`
- Modify: `apps/web/src/table-layout.ts`
- Test: `tests/integration/normal-viewport-layout.test.ts`

- [ ] **Step 1: Add the failing safe-geometry tests**

```ts
it.each([
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 }
])(
  "keeps south hand clear of the action row and side hands inside the safe viewport at %sx%s",
  ({ width, height }) => {
    const metrics = computeNormalViewportLayoutMetrics({
      viewportWidth: width,
      viewportHeight: height,
      topCount: 14,
      bottomCount: 14,
      leftCount: 14,
      rightCount: 14,
      hasVariantPicker: true,
      hasWishPicker: true
    });
    const southAnchor = resolveNormalSeatAnchorGeometry({
      position: "bottom",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 14
    });
    const eastAnchor = resolveNormalSeatAnchorGeometry({
      position: "right",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 14
    });
    const westAnchor = resolveNormalSeatAnchorGeometry({
      position: "left",
      normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
      layoutMetrics: metrics,
      handCardCount: 14
    });
    const actionRect = styleRect(
      resolveNormalActionRowRegionStyle({
        normalTableLayout: DEFAULT_NORMAL_TABLE_LAYOUT,
        layoutMetrics: metrics
      })
    );

    expect(actionRect.top - southAnchor.handBounds.bottom).toBeGreaterThanOrEqual(18);
    expect(eastAnchor.handBounds.right).toBeLessThanOrEqual(width - NORMAL_BOARD_INSET.right);
    expect(westAnchor.handBounds.left).toBeGreaterThanOrEqual(NORMAL_BOARD_INSET.left);
  }
);
```

- [ ] **Step 2: Run the layout test to verify it fails**

Run: `npx vitest run tests/integration/normal-viewport-layout.test.ts`

Expected: FAIL on the new south/action-row clearance and side-safe-bound assertions.

- [ ] **Step 3: Update the canonical layout anchors in `layout.json`**

```json
{
  "elements": {
    "playSurface": { "x": 0.5, "y": 0.45, "rotation": 0 },
    "northHand": { "x": 0.5, "y": 0.17, "rotation": 0 },
    "eastHand": { "x": 0.87, "y": 0.515, "rotation": 0 },
    "southHand": { "x": 0.5, "y": 0.755, "rotation": 0 },
    "westHand": { "x": 0.13, "y": 0.515, "rotation": 0 },
    "northLabel": { "x": 0.5, "y": 0.12, "rotation": 0 },
    "eastLabel": { "x": 0.82, "y": 0.515, "rotation": 0 },
    "southLabel": { "x": 0.5, "y": 0.89, "rotation": 0 },
    "westLabel": { "x": 0.18, "y": 0.515, "rotation": 0 },
    "actionRow": { "x": 0.5, "y": 0.94, "rotation": 0 }
  }
}
```

- [ ] **Step 4: Extend viewport metrics for explicit safe zones**

```ts
export type NormalViewportLayoutMetrics = {
  // existing fields...
  topSafeInset: number;
  bottomSafeInset: number;
  sideSafeInset: number;
  trickSafeWidth: number;
  trickSafeHeight: number;
  wishInsetX: number;
  wishInsetY: number;
};

export function computeNormalViewportLayoutMetrics(config: {
  viewportWidth: number;
  viewportHeight: number;
  topCount: number;
  bottomCount: number;
  leftCount: number;
  rightCount: number;
  hasVariantPicker: boolean;
  hasWishPicker: boolean;
}): NormalViewportLayoutMetrics {
  const sideSafeInset = clamp(Math.round(config.viewportWidth * 0.032), 28, 64);
  const topSafeInset = clamp(Math.round(config.viewportHeight * 0.062), 42, 84);
  const bottomSafeInset = clamp(Math.round(config.viewportHeight * 0.18), 128, 220);

  return {
    // existing fields...
    topSafeInset,
    bottomSafeInset,
    sideSafeInset,
    trickSafeWidth: clamp(Math.round(config.viewportWidth * 0.24), 220, 420),
    trickSafeHeight: clamp(Math.round(config.viewportHeight * 0.16), 120, 220),
    wishInsetX: 18,
    wishInsetY: 16
  };
}
```

- [ ] **Step 5: Honor the new safe zones in the seat-anchor helpers**

```ts
const handCenterX = clamp(
  board.left + element.x * board.width,
  board.left + metrics.sideSafeInset + handWidth / 2,
  board.right - metrics.sideSafeInset - handWidth / 2
);

const handCenterY =
  position === "bottom"
    ? Math.min(
        board.bottom - metrics.bottomSafeInset,
        board.top + element.y * board.height
      )
    : position === "top"
      ? Math.max(
          board.top + metrics.topSafeInset,
          board.top + element.y * board.height
        )
      : board.top + element.y * board.height;
```

- [ ] **Step 6: Run the layout test again**

Run: `npx vitest run tests/integration/normal-viewport-layout.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/layout.json apps/web/src/table-layout.ts tests/integration/normal-viewport-layout.test.ts
git commit -m "feat: tighten canonical live table safe geometry"
```

## Task 3: Re-anchor Seat Chrome, South Safe Zone, and Seat-Associated State

**Files:**
- Modify: `apps/web/src/player-surface-view.tsx`
- Modify: `apps/web/src/game-table-views.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/integration/player-surface-view.test.ts`

- [ ] **Step 1: Add failing seat-chrome tests**

```ts
it("renders consistent seat labels and keeps the south action band clear of the local hand", () => {
  const view = render(createElement(NormalGameTableView, createDecisionProps()));

  const north = view.container.querySelector(".normal-seat-overlay__identity--top");
  const east = view.container.querySelector(".normal-seat-overlay__identity--right");
  const south = view.container.querySelector(".normal-seat-overlay__identity--bottom");
  const west = view.container.querySelector(".normal-seat-overlay__identity--left");
  const actionBand = view.container.querySelector(".player-surface__action-band");
  const localHand = view.container.querySelector("[data-layout-container='south-hand']");

  expect(north?.textContent).toContain("NORTH");
  expect(north?.textContent).toContain("Partner");
  expect(east?.textContent).toContain("EAST");
  expect(east?.textContent).toContain("Opponent");
  expect(south?.textContent).toContain("SOUTH");
  expect(south?.textContent).toContain("You");
  expect(west?.textContent).toContain("WEST");
  expect(west?.textContent).toContain("Opponent");
  expect(actionBand).not.toBeNull();
  expect(localHand).not.toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/player-surface-view.test.ts`

Expected: FAIL because the consistent identity badge selectors do not exist yet.

- [ ] **Step 3: Replace seat label output with a consistent identity badge**

```tsx
function SeatIdentityBadge(props: {
  position: SeatVisualPosition;
  title: string;
  relation: string;
}) {
  return (
    <div
      className={[
        "normal-seat-overlay__identity",
        `normal-seat-overlay__identity--${props.position}`
      ].join(" ")}
    >
      <strong>{props.title}</strong>
      <span>{props.relation}</span>
    </div>
  );
}
```

- [ ] **Step 4: Add explicit seat-associated call and turn markers**

```tsx
<div className="normal-seat-overlay__status-row" style={seatLayout.statusRow}>
  {tichuMarkerLabel ? (
    <span className="normal-seat-overlay__call-marker">{tichuMarkerLabel}</span>
  ) : null}
  {seatView.isPrimarySeat ? (
    <span className="normal-seat-overlay__turn-marker">TURN</span>
  ) : null}
</div>
```

- [ ] **Step 5: Protect the South hand from the action band in CSS**

```css
.player-surface__seat-ring {
  --player-surface-bottom-safe-zone: clamp(168px, 21vh, 232px);
}

.player-surface__action-band {
  bottom: calc(var(--player-surface-bottom-safe-zone) - 72px);
}

[data-layout-container="south-hand"] {
  margin-bottom: calc(var(--player-surface-bottom-safe-zone) + 18px);
}

.normal-seat-overlay__identity {
  display: grid;
  gap: 2px;
  text-align: center;
}
```

- [ ] **Step 6: Run the player-surface test again**

Run: `npx vitest run tests/integration/player-surface-view.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/player-surface-view.tsx apps/web/src/game-table-views.tsx apps/web/src/styles.css tests/integration/player-surface-view.test.ts
git commit -m "feat: re-anchor live table seat chrome and south safe zone"
```

## Task 4: Reserve Trick, Wish, and Pass Regions Without Layout Jumping

**Files:**
- Modify: `apps/web/src/table-layout.ts`
- Modify: `apps/web/src/game-table-views.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/integration/trick-ui-cleanup.test.ts`

- [ ] **Step 1: Add the failing trick/wish/pass-region tests**

```ts
it("keeps a visible current trick zone and a dormant wish anchor during the grand tichu window", () => {
  const view = render(
    createElement(TableSurface, {
      ...createGrandTichuWindowProps(),
      surfacePresentation: {
        tableMode: "calm",
        handMode: "immersive",
        controlsVisible: false,
        dramaticTurnCue: false
      }
    })
  );

  expect(view.container.querySelector(".normal-play-surface__trick-zone")).not.toBeNull();
  expect(view.container.querySelector(".normal-play-surface__wish-anchor")).not.toBeNull();
});

it("keeps pass lanes within their reserved seat-local regions during pass flow", () => {
  const view = render(createElement(TableSurface, createPassFlowProps()));
  const lanes = [...view.container.querySelectorAll("[data-pass-lane]")];

  expect(lanes.length).toBeGreaterThan(0);
  lanes.forEach((lane) => {
    expect(lane.getAttribute("data-pass-layout-id")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/trick-ui-cleanup.test.ts`

Expected: FAIL because the explicit trick-zone and wish-anchor hooks do not exist yet.

- [ ] **Step 3: Add explicit region hooks in the play surface**

```tsx
<section className="normal-play-surface__trick-zone" data-trick-zone="current">
  {renderCurrentTrickOrEmptyState()}
</section>

<div
  className={state.currentWish === null ? "normal-play-surface__wish-anchor is-hidden" : "normal-play-surface__wish-anchor"}
  data-wish-anchor="true"
>
  {state.currentWish === null ? null : <span>{formatRank(state.currentWish)}</span>}
</div>
```

- [ ] **Step 4: Derive a canonical wish-anchor style from the trick region**

```ts
export function resolveNormalWishAnchorStyle(config: {
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
}): CSSProperties {
  const playSurface = resolveNormalPlaySurfaceRegionStyle(config);
  const rect = styleRect(playSurface);

  return {
    left: `${rect.left + config.layoutMetrics.wishInsetX}px`,
    top: `${rect.top + config.layoutMetrics.wishInsetY}px`
  };
}
```

- [ ] **Step 5: Add the reserved-region CSS**

```css
.normal-play-surface__trick-zone {
  position: absolute;
  inset: 18% 18% 22% 18%;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.normal-play-surface__wish-anchor {
  position: absolute;
  min-width: 44px;
  min-height: 32px;
  display: grid;
  place-items: center;
}

.normal-play-surface__wish-anchor.is-hidden {
  opacity: 0;
}
```

- [ ] **Step 6: Run the trick cleanup test again**

Run: `npx vitest run tests/integration/trick-ui-cleanup.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/table-layout.ts apps/web/src/game-table-views.tsx apps/web/src/styles.css tests/integration/trick-ui-cleanup.test.ts
git commit -m "feat: reserve trick wish and pass regions on the live table"
```

## Task 5: Add Authored Assets and Normal-vs-Debug Card Visibility Rules

**Files:**
- Modify: `apps/web/src/card-face.tsx`
- Modify: `apps/web/src/game-table-views.tsx`
- Modify: `apps/web/src/table-graphics-assets.ts`
- Create: `apps/web/src/assets/generated/table-felt.svg`
- Create: `apps/web/src/assets/generated/table-rim.svg`
- Create: `apps/web/src/assets/generated/card-back.svg`
- Create: `apps/web/src/assets/generated/card-face-template.svg`
- Create: `apps/web/src/assets/generated/special-dragon.svg`
- Create: `apps/web/src/assets/generated/special-phoenix.svg`
- Create: `apps/web/src/assets/generated/special-dog.svg`
- Create: `apps/web/src/assets/generated/special-mahjong.svg`
- Modify: `apps/web/src/styles.css`
- Test: `tests/integration/player-surface-view.test.ts`

- [ ] **Step 1: Add the failing visibility and asset tests**

```ts
it("keeps only the south hand face-up in normal mode while preserving debug reveal support", () => {
  const normalView = render(createElement(NormalGameTableView, createDecisionProps()));
  const debugView = render(
    createElement(NormalGameTableView, {
      ...createDecisionProps(),
      uiMode: "debug"
    })
  );

  expect(
    normalView.container.querySelectorAll(".playing-card--back").length
  ).toBeGreaterThan(0);
  expect(
    normalView.container.querySelector("[data-seat='seat-0'] .playing-card--back")
  ).toBeNull();
  expect(
    debugView.container.querySelectorAll(".playing-card--back").length
  ).toBeLessThan(
    normalView.container.querySelectorAll(".playing-card--back").length
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/player-surface-view.test.ts`

Expected: FAIL because opponent backs are not consistently emitted as asset-backed cards yet.

- [ ] **Step 3: Add generated asset files and export them**

```ts
import tableFeltUrl from "./assets/generated/table-felt.svg";
import tableRimUrl from "./assets/generated/table-rim.svg";
import cardBackUrl from "./assets/generated/card-back.svg";
import specialDragonUrl from "./assets/generated/special-dragon.svg";
import specialPhoenixUrl from "./assets/generated/special-phoenix.svg";
import specialDogUrl from "./assets/generated/special-dog.svg";
import specialMahjongUrl from "./assets/generated/special-mahjong.svg";

export const TABLE_GRAPHICS_ASSETS = {
  tableFelt: tableFeltUrl,
  tableRim: tableRimUrl,
  cardBack: cardBackUrl,
  specialDragon: specialDragonUrl,
  specialPhoenix: specialPhoenixUrl,
  specialDog: specialDogUrl,
  specialMahjong: specialMahjongUrl
} as const;
```

- [ ] **Step 4: Teach `CardFace` to render backs and authored fronts**

```tsx
export function CardFace(props: {
  card: Card;
  className?: string;
  reveal?: boolean;
  // existing props...
}) {
  if (props.reveal === false) {
    return (
      <article className={["playing-card", "playing-card--back", props.className ?? ""].join(" ")}>
        <img src={TABLE_GRAPHICS_ASSETS.cardBack} alt="" className="playing-card__asset" />
      </article>
    );
  }

  return (
    <article className={classes}>
      <img src={cardFaceTemplateUrl} alt="" className="playing-card__asset playing-card__asset--frame" />
      {/* existing face markup with authored special motifs */}
    </article>
  );
}
```

- [ ] **Step 5: Route reveal rules from the existing UI mode**

```tsx
const revealSeatCards =
  props.uiMode === "debug" || props.uiMode === "control" || seatView.isLocalSeat;

<CardFace
  card={card}
  reveal={revealSeatCards}
  className={seatView.isLocalSeat ? "normal-card normal-card--local" : "normal-card normal-card--opponent"}
/>
```

- [ ] **Step 6: Add the asset-backed card CSS**

```css
.playing-card--back {
  background: rgba(8, 22, 26, 0.92);
}

.playing-card__asset {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
```

- [ ] **Step 7: Run the player-surface test again**

Run: `npx vitest run tests/integration/player-surface-view.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/card-face.tsx apps/web/src/game-table-views.tsx apps/web/src/table-graphics-assets.ts apps/web/src/assets/generated apps/web/src/styles.css tests/integration/player-surface-view.test.ts
git commit -m "feat: add authored live table and card assets"
```

## Task 6: Mount the Graphics Layer in the Live Table and Finish Validation

**Files:**
- Modify: `apps/web/src/player-surface-view.tsx`
- Modify: `apps/web/src/game-table-views.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `docs/prompts/ui.md` (only if implementation wording needs prompt clarification)
- Test: `tests/integration/table-graphics-layer.test.ts`
- Test: `tests/integration/normal-viewport-layout.test.ts`
- Test: `tests/integration/player-surface-view.test.ts`
- Test: `tests/integration/trick-ui-cleanup.test.ts`

- [ ] **Step 1: Add the failing integration hook test for the mounted graphics layer**

```ts
it("mounts the graphics layer behind the live seat ring without replacing the existing action and seat DOM", () => {
  const view = render(createElement(NormalGameTableView, createDecisionProps()));

  expect(
    view.container.querySelector("[data-table-graphics-layer='true']")
  ).not.toBeNull();
  expect(
    view.container.querySelector(".player-surface__action-band")
  ).not.toBeNull();
  expect(
    view.container.querySelector(".normal-seat-overlay__identity--bottom")
  ).not.toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/table-graphics-layer.test.ts tests/integration/player-surface-view.test.ts`

Expected: FAIL because the live surface has not mounted the graphics layer yet.

- [ ] **Step 3: Mount the bounded graphics layer in `player-surface-view.tsx`**

```tsx
<div className="normal-table-shell player-surface__table-shell">
  <TableGraphicsLayer
    normalTableLayout={props.normalTableLayout}
    layoutMetrics={props.layoutMetrics}
    activeSeatPosition={props.activeSeatPosition}
    wishActive={props.wishActive}
  />
  <div className={tableClassName}>
    <div className="player-surface__perspective">
      {/* existing seat ring and React-owned interaction surface */}
    </div>
  </div>
</div>
```

- [ ] **Step 4: Keep the graphics layer visually subordinate to interaction**

```css
.table-graphics-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.player-surface__table,
.player-surface__perspective,
.normal-seat-overlays,
.normal-pass-staging,
.normal-trick-staging {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 5: Run the focused tests**

Run: `npx vitest run tests/integration/table-graphics-layer.test.ts tests/integration/normal-viewport-layout.test.ts tests/integration/player-surface-view.test.ts tests/integration/trick-ui-cleanup.test.ts`

Expected: PASS

- [ ] **Step 6: Run the build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 7: Manual verification**

Run the live app and verify:

```bash
npm run dev:web
npm run dev:server
```

Then confirm at `1366x768`, `1440x900`, `1600x900`, and `1920x1080`:

- South hand fully visible
- South label fully visible
- bottom buttons do not cover cards
- East and West hands are not clipped
- East and West labels do not overlap cards
- North hand and label remain centered and readable
- current trick zone remains visible
- wish anchor appears only with an active wish
- Grand Tichu window with 8 cards lays out cleanly
- full 14-card hands remain inside safe bounds
- only South is face-up in normal mode
- debug reveal remains available

- [ ] **Step 8: Update tracking and close out the issue when verified**

```bash
gh issue comment 76 --body "Implemented the live table hybrid rendering/layout refinement and validated the required viewport, hand-count, and seat-state checks."
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/player-surface-view.tsx apps/web/src/game-table-views.tsx apps/web/src/styles.css docs/prompts/ui.md
git commit -m "feat: refine live south-player table with hybrid rendering"
```

## Self-Review

- Spec coverage:
  - hybrid boundary covered in Tasks 1 and 6
  - canonical `layout.json` authority covered in Task 2
  - South safe zone and seat labels covered in Task 3
  - trick/wish/pass reserved regions covered in Task 4
  - authored assets and face-up/back rules covered in Task 5
  - viewport/build/manual validation covered in Task 6
- Placeholder scan:
  - no `TODO`, `TBD`, or “similar to above” placeholders remain
  - every code-changing step contains concrete file paths, code, and commands
- Type consistency:
  - `TableGraphicsLayer`, `TABLE_GRAPHICS_ASSETS`, and the new safe-metric fields are defined before later tasks rely on them
  - the plan keeps `layout.json` and `table-layout.ts` as the sole geometry truth throughout
