# Gameplay Surface Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the live Tichu gameplay table as a player-first adaptive dual-surface experience with an over-hand table view, adaptive calm/decision/resolution states, a custom deck treatment, and a separate operator analysis surface.

**Architecture:** Keep the current React/Vite live-game architecture and game-state truth intact, but split the redesign into focused modules: one module for surface-state derivation, one for card/deck rendering, and one for the new player-surface composition. Preserve the existing `normal` and `debug` mode plumbing internally at first, but change the user-facing experience so `normal` becomes the new cinematic player table and `debug` becomes the dedicated operator surface.

**Tech Stack:** React 19, TypeScript, Vite, global CSS, existing SVG/DOM card rendering, Vitest + jsdom integration tests.

---

## File Structure Map

### Existing files to modify

- `apps/web/src/App.tsx`
  - Keep live gameplay state derivation and command handlers.
  - Add derived surface-presentation state and pass it into the view layer.
- `apps/web/src/game-table-views.tsx`
  - Stop owning every card/table/detail directly.
  - Delegate player-surface rendering and card art to smaller modules.
  - Keep shared helpers that are already heavily used by layout tests.
- `apps/web/src/game-table-view-model.ts`
  - Update user-facing menu/hotkey labels and mode copy for operator mode.
- `apps/web/src/styles.css`
  - Add scoped sections for the new player table, adaptive states, and operator surface refinements.
- `tests/integration/game-table-view-model.test.ts`
  - Lock user-facing menu and hotkey terminology.
- `tests/integration/trick-ui-cleanup.test.ts`
  - Keep trick staging and pass/pickup behavior safe while the table composition changes.
- `tests/integration/normal-viewport-layout.test.ts`
  - Update layout assertions so the new table framing still keeps the playable geometry safe.

### New files to create

- `apps/web/src/gameplay-surface-mode.ts`
  - Pure functions that derive `calm`, `decision`, and `resolution` surface states plus hand-presentation mode from existing game state.
- `apps/web/src/card-face.tsx`
  - Shared card rendering primitives, custom deck art, and special-card treatment extracted from `game-table-views.tsx`.
- `apps/web/src/player-surface-view.tsx`
  - The new player-first live table composition and action-band behavior.
- `tests/integration/gameplay-surface-mode.test.ts`
  - Unit-style integration coverage for the pure surface-state logic.
- `tests/integration/player-surface-view.test.ts`
  - jsdom rendering coverage for player-surface density, control visibility, and active-turn emphasis.

## Task 1: Add Pure Surface-State Derivation

**Files:**
- Create: `apps/web/src/gameplay-surface-mode.ts`
- Modify: `apps/web/src/App.tsx`
- Test: `tests/integration/gameplay-surface-mode.test.ts`

- [ ] **Step 1: Write the failing surface-state tests**

```ts
import { describe, expect, it } from "vitest";
import { createScenarioState } from "@tichuml/engine";
import {
  deriveSurfacePresentation,
  type SurfacePresentation
} from "../../apps/web/src/gameplay-surface-mode";

describe("gameplay surface mode", () => {
  it("uses calm mode when waiting on another seat", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-1"
    });

    expect(
      deriveSurfacePresentation({
        state,
        localSeat: "seat-0",
        localCanInteract: false,
        wishDialogOpen: false,
        trickIsResolving: false,
        hasResolutionAnimation: false
      })
    ).toMatchObject<Partial<SurfacePresentation>>({
      tableMode: "calm",
      handMode: "immersive",
      controlsVisible: false
    });
  });

  it("switches to decision mode when the local seat must act", () => {
    const state = createScenarioState({
      phase: "trick_play",
      activeSeat: "seat-0"
    });

    expect(
      deriveSurfacePresentation({
        state,
        localSeat: "seat-0",
        localCanInteract: true,
        wishDialogOpen: false,
        trickIsResolving: false,
        hasResolutionAnimation: false
      })
    ).toMatchObject<Partial<SurfacePresentation>>({
      tableMode: "decision",
      handMode: "simplified",
      controlsVisible: true
    });
  });

  it("switches to resolution mode during trick collection and other transient drama", () => {
    const state = createScenarioState({
      phase: "exchange_complete",
      activeSeat: "seat-0"
    });

    expect(
      deriveSurfacePresentation({
        state,
        localSeat: "seat-0",
        localCanInteract: false,
        wishDialogOpen: false,
        trickIsResolving: true,
        hasResolutionAnimation: true
      }).tableMode
    ).toBe("resolution");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/gameplay-surface-mode.test.ts`

Expected: FAIL with `Cannot find module '../../apps/web/src/gameplay-surface-mode'`.

- [ ] **Step 3: Write the minimal surface-state module**

```ts
import type { GameState, SeatId } from "@tichuml/engine";

export type SurfaceTableMode = "calm" | "decision" | "resolution";
export type SurfaceHandMode = "immersive" | "simplified";

export type SurfacePresentation = {
  tableMode: SurfaceTableMode;
  handMode: SurfaceHandMode;
  controlsVisible: boolean;
  dramaticTurnCue: boolean;
};

export function deriveSurfacePresentation(input: {
  state: Pick<GameState, "phase" | "activeSeat" | "pendingDragonGift">;
  localSeat: SeatId;
  localCanInteract: boolean;
  wishDialogOpen: boolean;
  trickIsResolving: boolean;
  hasResolutionAnimation: boolean;
}): SurfacePresentation {
  const localTurn = input.state.activeSeat === input.localSeat;
  const decisionMode = input.localCanInteract || input.wishDialogOpen || localTurn;
  const resolutionMode =
    input.trickIsResolving ||
    input.hasResolutionAnimation ||
    input.state.pendingDragonGift !== null;

  if (resolutionMode) {
    return {
      tableMode: "resolution",
      handMode: "simplified",
      controlsVisible: input.localCanInteract || input.wishDialogOpen,
      dramaticTurnCue: true
    };
  }

  if (decisionMode) {
    return {
      tableMode: "decision",
      handMode: "simplified",
      controlsVisible: true,
      dramaticTurnCue: true
    };
  }

  return {
    tableMode: "calm",
    handMode: "immersive",
    controlsVisible: false,
    dramaticTurnCue: false
  };
}
```

- [ ] **Step 4: Thread the new presentation state through `App.tsx`**

```ts
import { deriveSurfacePresentation } from "./gameplay-surface-mode";

const surfacePresentation = deriveSurfacePresentation({
  state,
  localSeat: LOCAL_SEAT,
  localCanInteract,
  wishDialogOpen,
  trickIsResolving,
  hasResolutionAnimation:
    dogLeadAnimation !== null || state.pendingDragonGift !== null
});

const viewProps = {
  // existing props...
  surfacePresentation
};
```

- [ ] **Step 5: Run the surface-state test again**

Run: `npx vitest run tests/integration/gameplay-surface-mode.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/gameplay-surface-mode.ts apps/web/src/App.tsx tests/integration/gameplay-surface-mode.test.ts
git commit -m "feat: derive adaptive gameplay surface states"
```

## Task 2: Extract Card Rendering into a Shared Deck Module

**Files:**
- Create: `apps/web/src/card-face.tsx`
- Modify: `apps/web/src/game-table-views.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/integration/player-surface-view.test.ts`

- [ ] **Step 1: Write the failing card-face render test**

```ts
// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cardsFromIds } from "@tichuml/engine";
import { CardFace } from "../../apps/web/src/card-face";

function render(element: ReturnType<typeof createElement>) {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, unmount: () => act(() => root.unmount()) };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CardFace", () => {
  it("marks special cards with the premium special-card treatment", () => {
    const dragon = cardsFromIds(["dragon"])[0];
    const view = render(createElement(CardFace, { card: dragon, className: "probe" }));

    const card = view.container.querySelector(".playing-card");
    expect(card?.className).toContain("playing-card--dragon");
    expect(card?.className).toContain("playing-card--special");
    expect(view.container.textContent).toContain("Dragon");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/player-surface-view.test.ts`

Expected: FAIL with `Cannot find module '../../apps/web/src/card-face'`.

- [ ] **Step 3: Create `card-face.tsx` and move the card art primitives**

```tsx
import type { Card, SpecialCardName, StandardSuit } from "@tichuml/engine";
import type { ReactNode } from "react";

export function getCardToneClass(card: Card) {
  if (card.kind === "special") {
    return `playing-card--special playing-card--${card.special}`;
  }
  return `playing-card--${card.suit}`;
}

export function CardFace(props: {
  card: Card;
  className?: string;
  tone?: "legal" | "muted" | "default";
  selected?: boolean;
  interactive?: boolean;
  isDragging?: boolean;
}) {
  const classes = [
    "playing-card",
    getCardToneClass(props.card),
    props.className ?? "",
    props.tone === "legal" ? "playing-card--legal" : "",
    props.tone === "muted" ? "playing-card--muted" : "",
    props.selected ? "playing-card--selected" : "",
    props.isDragging ? "playing-card--dragging" : "",
    props.interactive === false ? "playing-card--static" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return <article className={classes}>{/* moved face markup here */}</article>;
}
```

- [ ] **Step 4: Replace internal `CardFace` usage in `game-table-views.tsx`**

```tsx
import { CardFace } from "./card-face";

// delete the in-file CardFace, SuitGlyph, SpecialGlyph helpers after moving them
// keep call sites unchanged so the table behavior does not drift
```

- [ ] **Step 5: Add the first new deck-skin CSS hooks**

```css
.playing-card {
  background:
    radial-gradient(circle at 50% 18%, rgba(255, 244, 220, 0.95), rgba(250, 236, 210, 0.9) 48%, rgba(232, 214, 186, 0.92) 100%);
}

.playing-card--special .playing-card__seal--special {
  box-shadow:
    0 0 0 1px rgba(227, 186, 118, 0.32),
    0 8px 18px rgba(58, 24, 18, 0.16);
}
```

- [ ] **Step 6: Run the card-face test again**

Run: `npx vitest run tests/integration/player-surface-view.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/card-face.tsx apps/web/src/game-table-views.tsx apps/web/src/styles.css tests/integration/player-surface-view.test.ts
git commit -m "refactor: extract shared card-face deck rendering"
```

## Task 3: Build the New Player Surface Composition

**Files:**
- Create: `apps/web/src/player-surface-view.tsx`
- Modify: `apps/web/src/game-table-views.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `tests/integration/player-surface-view.test.ts`

- [ ] **Step 1: Add a failing render test for the sparse player table**

```ts
it("hides the action band while the local player is waiting", () => {
  const state = createScenarioState({
    phase: "trick_play",
    activeSeat: "seat-1"
  });

  const view = render(
    createElement(PlayerSurfaceView, {
      state,
      derived: createDerived(state),
      surfacePresentation: {
        tableMode: "calm",
        handMode: "immersive",
        controlsVisible: false,
        dramaticTurnCue: false
      },
      normalActionRail: [],
      seatViews: buildSeatViews(state),
      displayedTrick: state.currentTrick,
      seatRelativePlays: [],
      sortedLocalHand: state.hands["seat-0"],
      selectedCardIds: [],
      localLegalCardIds: [],
      cardLookup: buildCardLookup(state.shuffledDeck)
    })
  );

  expect(view.container.querySelector(".player-surface__action-band")).toBeNull();
  expect(view.container.querySelector(".player-surface__table")).not.toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/player-surface-view.test.ts`

Expected: FAIL with `PlayerSurfaceView is not defined`.

- [ ] **Step 3: Create the new table composition component**

```tsx
export function PlayerSurfaceView(props: PlayerSurfaceViewProps) {
  return (
    <main className={`tabletop-app tabletop-app--normal player-surface player-surface--${props.surfacePresentation.tableMode}`}>
      <section className="player-surface__viewport">
        <div className="player-surface__table-shell">
          <div className="player-surface__table">
            <div className="player-surface__felt" />
            <PlayerSurfaceSeatRing seatViews={props.seatViews} />
            <PlayerSurfaceCenter
              displayedTrick={props.displayedTrick}
              seatRelativePlays={props.seatRelativePlays}
              cardLookup={props.cardLookup}
            />
            <PlayerSurfaceLocalHand
              handMode={props.surfacePresentation.handMode}
              sortedLocalHand={props.sortedLocalHand}
              selectedCardIds={props.selectedCardIds}
              localLegalCardIds={props.localLegalCardIds}
              onLocalCardClick={props.onLocalCardClick}
            />
            {props.surfacePresentation.controlsVisible ? (
              <PlayerSurfaceActionBand
                normalActionRail={props.normalActionRail}
                onNormalAction={props.onNormalAction}
              />
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Delegate `NormalGameTableView` to `PlayerSurfaceView`**

```tsx
import { PlayerSurfaceView } from "./player-surface-view";

export function NormalGameTableView(props: GameTableViewProps) {
  return (
    <PlayerSurfaceView
      state={props.state}
      derived={props.derived}
      surfacePresentation={props.surfacePresentation}
      seatViews={props.seatViews}
      seatRelativePlays={props.seatRelativePlays}
      displayedTrick={props.displayedTrick}
      sortedLocalHand={props.sortedLocalHand}
      selectedCardIds={props.selectedCardIds}
      localLegalCardIds={props.localLegalCardIds}
      normalActionRail={props.normalActionRail}
      cardLookup={props.cardLookup}
      onLocalCardClick={props.onLocalCardClick}
      onNormalAction={props.onNormalAction}
    />
  );
}
```

- [ ] **Step 5: Add the new table-shell CSS**

```css
.player-surface__viewport {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
}

.player-surface__table-shell {
  width: min(1500px, 96vw);
  perspective: 1500px;
}

.player-surface__table {
  position: relative;
  width: 100%;
  aspect-ratio: 1.62 / 1;
  transform: rotateX(14deg);
  border-radius: 38px;
  background: linear-gradient(180deg, #5a3525 0%, #352015 100%);
}
```

- [ ] **Step 6: Run the player-surface render test again**

Run: `npx vitest run tests/integration/player-surface-view.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/player-surface-view.tsx apps/web/src/game-table-views.tsx apps/web/src/styles.css tests/integration/player-surface-view.test.ts
git commit -m "feat: add player-first gameplay surface composition"
```

## Task 4: Add Adaptive Calm, Decision, and Resolution Presentation

**Files:**
- Modify: `apps/web/src/player-surface-view.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/integration/player-surface-view.test.ts`
- Test: `tests/integration/trick-ui-cleanup.test.ts`

- [ ] **Step 1: Extend the render test to prove mode changes alter density**

```ts
it("simplifies the hand and reveals controls during decision mode", () => {
  const waiting = renderPlayerSurface({ tableMode: "calm", handMode: "immersive", controlsVisible: false, dramaticTurnCue: false });
  const acting = renderPlayerSurface({ tableMode: "decision", handMode: "simplified", controlsVisible: true, dramaticTurnCue: true });

  expect(waiting.container.querySelector(".player-surface__hand--immersive")).not.toBeNull();
  expect(waiting.container.querySelector(".player-surface__action-band")).toBeNull();

  expect(acting.container.querySelector(".player-surface__hand--simplified")).not.toBeNull();
  expect(acting.container.querySelector(".player-surface__action-band")).not.toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/player-surface-view.test.ts`

Expected: FAIL because the new state classes are not rendered yet.

- [ ] **Step 3: Add mode-aware class names and turn emphasis**

```tsx
const actingSeat = props.derived.activeSeat;

<div
  className={[
    "player-surface__table",
    `player-surface__table--${props.surfacePresentation.tableMode}`,
    props.surfacePresentation.dramaticTurnCue ? "player-surface__table--dramatic-turn" : ""
  ]
    .filter(Boolean)
    .join(" ")}
  data-acting-seat={actingSeat ?? ""}
>
```

- [ ] **Step 4: Add calm/decision/resolution CSS treatments**

```css
.player-surface__table--calm .player-surface__local-hand {
  filter: saturate(1.02);
}

.player-surface__table--decision .player-surface__local-hand {
  transform: translateY(8px);
}

.player-surface__table--decision .player-surface__seat:not(.is-acting) {
  opacity: 0.82;
}

.player-surface__table--resolution::after {
  content: "";
  position: absolute;
  inset: 12% 20%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 224, 159, 0.18), transparent 70%);
}
```

- [ ] **Step 5: Run both adaptive-state and trick cleanup tests**

Run:
- `npx vitest run tests/integration/player-surface-view.test.ts`
- `npx vitest run tests/integration/trick-ui-cleanup.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/player-surface-view.tsx apps/web/src/styles.css tests/integration/player-surface-view.test.ts
git commit -m "feat: add adaptive gameplay surface presentation states"
```

## Task 5: Convert the Existing Debug Surface into Operator Mode

**Files:**
- Modify: `apps/web/src/game-table-view-model.ts`
- Modify: `apps/web/src/game-table-views.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/integration/game-table-view-model.test.ts`

- [ ] **Step 1: Write the failing menu-label test**

```ts
it("keeps the documented menu contract fixed", () => {
  expect(GAME_MENU_ITEMS.map((item) => item.label)).toEqual([
    "New Game",
    "Table Editor",
    "Operator View",
    "Backend Settings",
    "Hot Keys",
    "Random Sources",
    "How To Play Tichu"
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/game-table-view-model.test.ts`

Expected: FAIL because the menu still says `Debug Mode`.

- [ ] **Step 3: Update user-facing mode copy while preserving internal command IDs**

```ts
{
  id: "debug_mode",
  label: "Operator View",
  description: "Toggle the operator analysis surface on or off.",
  commandId: "toggle_debug_mode"
}
```

```tsx
<p className="topbar__eyebrow">Operator Surface</p>
<h1>Gameplay Analysis View</h1>
<p className="topbar__summary">
  Seat state, decision routing, telemetry, backend health, and ML readiness.
  Press Ctrl+D to return to the player table.
</p>
```

- [ ] **Step 4: Add operator-surface polish CSS without disturbing the player table**

```css
.tabletop-app--control {
  background:
    radial-gradient(circle at top, rgba(41, 62, 83, 0.18), transparent 28%),
    linear-gradient(180deg, #0a1219 0%, #071017 100%);
}
```

- [ ] **Step 5: Run the mode-model test**

Run: `npx vitest run tests/integration/game-table-view-model.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/game-table-view-model.ts apps/web/src/game-table-views.tsx apps/web/src/styles.css tests/integration/game-table-view-model.test.ts
git commit -m "feat: present debug mode as operator analysis surface"
```

## Task 6: Tighten Layout Safety and Asset Readability

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `tests/integration/normal-viewport-layout.test.ts`
- Modify: `tests/integration/trick-ui-cleanup.test.ts`
- Modify: `tests/integration/player-surface-view.test.ts`

- [ ] **Step 1: Add a failing viewport assertion for the new over-hand composition**

```ts
it.each([
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1366, height: 768 }
])("keeps the action band out of the south hand region at %sx%s", ({ width, height }) => {
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

  expect(metrics.bottomSeatHeight).toBeGreaterThan(metrics.actionRowHeight);
});
```

- [ ] **Step 2: Run the layout and trick tests to verify the new safety check**

Run:
- `npx vitest run tests/integration/normal-viewport-layout.test.ts`
- `npx vitest run tests/integration/trick-ui-cleanup.test.ts`

Expected: FAIL if the new player-surface spacing has not been tuned well enough.

- [ ] **Step 3: Tune the CSS layout constants for hand/trick/control separation**

```css
.player-surface__center {
  inset: 18% 18% 28%;
}

.player-surface__local-hand {
  bottom: 8%;
}

.player-surface__action-band {
  bottom: 3%;
}
```

- [ ] **Step 4: Re-run the layout, trick, and player-surface suites**

Run:
- `npx vitest run tests/integration/normal-viewport-layout.test.ts`
- `npx vitest run tests/integration/trick-ui-cleanup.test.ts`
- `npx vitest run tests/integration/player-surface-view.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/styles.css tests/integration/normal-viewport-layout.test.ts tests/integration/trick-ui-cleanup.test.ts tests/integration/player-surface-view.test.ts
git commit -m "test: lock gameplay surface layout safety"
```

## Task 7: Final Validation, Tracking, and Docs Sync

**Files:**
- Modify: `docs/prompts/ui.md` (only if implementation details materially refine the approved prompt)
- Modify: `docs/validation/` artifacts if the implementation adds a new validation summary
- Modify: GitHub issue `#74`

- [ ] **Step 1: Run the focused browser and test validation set**

Run:
- `npx vitest run tests/integration/gameplay-surface-mode.test.ts`
- `npx vitest run tests/integration/player-surface-view.test.ts`
- `npx vitest run tests/integration/game-table-view-model.test.ts`
- `npx vitest run tests/integration/normal-viewport-layout.test.ts`
- `npx vitest run tests/integration/trick-ui-cleanup.test.ts`
- `npm run build`

Expected:
- all tests PASS
- web build PASS

- [ ] **Step 2: Run the live browser smoke**

Run:
- `npm run dev:web`
- open the live table in the in-app browser
- verify:
  - the player surface opens in the over-hand composition
  - calm mode hides the controls
  - decision mode reveals the action band
  - resolution mode visibly escalates then clears
  - operator toggle swaps to the separate analysis surface

Expected: no console crash, no broken action flow, no overlap that blocks card play.

- [ ] **Step 3: Update issue `#74` with implementation evidence**

```md
Implemented the adaptive dual-surface gameplay redesign.

Validation:
- `npx vitest run tests/integration/gameplay-surface-mode.test.ts`
- `npx vitest run tests/integration/player-surface-view.test.ts`
- `npx vitest run tests/integration/game-table-view-model.test.ts`
- `npx vitest run tests/integration/normal-viewport-layout.test.ts`
- `npx vitest run tests/integration/trick-ui-cleanup.test.ts`
- `npm run build`
- browser smoke validation for player and operator surfaces
```

- [ ] **Step 4: Final commit and push**

```bash
git status --short
git branch --show-current
git remote -v
git log --oneline -5
git add apps/web/src docs tests/integration
git commit -m "feat: redesign live gameplay surface"
git push origin HEAD:main
git fetch --prune origin "+refs/heads/main:refs/remotes/origin/main"
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

- [ ] **Step 5: Confirm docs and GitHub still agree**

Checklist:
- `#74` remains the canonical implementation issue
- prompt capture in `docs/prompts/ui.md` still matches shipped behavior
- no duplicate gameplay-surface issue was created during the rollout
- operator-mode naming is consistent between the UI, docs, and issue updates

## Self-Review

### Spec Coverage

- Player-first over-hand live surface: covered by Tasks 3 and 6.
- Calm / decision / resolution states: covered by Tasks 1 and 4.
- Sparse opponent information and hidden-until-needed controls: covered by Tasks 1 and 3.
- Dramatic active-turn emphasis: covered by Task 4.
- Custom Tichu-native deck and elevated special cards: covered by Task 2.
- Separate operator analysis surface: covered by Task 5.
- Validation and GitHub/docs sync: covered by Task 7.

### Placeholder Scan

- No deferred placeholders remain.
- Each code-changing task includes concrete files, commands, and code snippets.

### Type Consistency

- `SurfacePresentation`, `tableMode`, and `handMode` names are used consistently across Tasks 1, 3, and 4.
- Internal `toggle_debug_mode` identifiers stay stable while user-facing copy changes in Task 5.
