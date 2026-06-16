# Fresh ALT Table Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `apps/table-editor` into a standalone WYSIWYG authoring tool for the Fresh ALT luxury table, with editable `north/east/west` hands, locked `south`, per-lane and per-arrow editing, and manual JSON export for production handoff.

**Architecture:** Keep the editor as its own Vite app on port `5178`, but replace its approximate mesh preview with a detached authoring wrapper around the shared Fresh ALT rendering surface. Move authoring-safe layout mapping into shared runtime-safe helpers so the editor and production surface stay visually aligned without importing gameplay state.

**Tech Stack:** React 19, Vite, TypeScript, Vitest, existing `@tichuml/table-layout-schema`, shared Fresh ALT rendering helpers under `apps/web/src/altTableFresh`.

---

### Task 1: Lock The Contract With Failing Tests

**Files:**
- Create: `tests/integration/fresh-alt-table-editor-authoring.test.ts`
- Modify: `tests/unit/table-layout-schema/schema.test.ts`
- Reference: `apps/table-editor/vite.config.ts`
- Reference: `apps/table-editor/src/rendering/EditorPreview.tsx`
- Reference: `apps/web/src/altTableFresh/FreshAltTable.tsx`

- [ ] **Step 1: Write the failing integration contract test for the standalone editor preview**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const editorPreviewSource = readFileSync(
  resolve("apps/table-editor/src/rendering/EditorPreview.tsx"),
  "utf8"
);
const authoringPreviewSource = readFileSync(
  resolve("apps/table-editor/src/rendering/FreshAltAuthoringPreview.tsx"),
  "utf8"
);
const viteConfigSource = readFileSync(
  resolve("apps/table-editor/vite.config.ts"),
  "utf8"
);

describe("fresh alt table editor authoring contract", () => {
  it("keeps the editor on strict port 5178", () => {
    expect(viteConfigSource).toContain("port: 5178");
    expect(viteConfigSource).toContain("strictPort: true");
  });

  it("routes the editor preview through the fresh alt authoring wrapper", () => {
    expect(editorPreviewSource).toContain(
      'import { FreshAltAuthoringPreview } from "./FreshAltAuthoringPreview";'
    );
    expect(editorPreviewSource).toContain("<FreshAltAuthoringPreview");
    expect(editorPreviewSource).not.toContain("OrbitControls");
    expect(editorPreviewSource).not.toContain("Grid");
  });

  it("marks south as locked while exposing editable north east and west surfaces", () => {
    expect(authoringPreviewSource).toContain('const LOCKED_HANDS = new Set(["south"]);');
    expect(authoringPreviewSource).toContain("selection?.type === \"hand\"");
    expect(authoringPreviewSource).toContain("onSelectHand(\"north\")");
    expect(authoringPreviewSource).toContain("onSelectHand(\"east\")");
    expect(authoringPreviewSource).toContain("onSelectHand(\"west\")");
  });
});
```

- [ ] **Step 2: Run the new integration test and confirm it fails for the missing authoring wrapper**

Run: `npm test -- tests/integration/fresh-alt-table-editor-authoring.test.ts`

Expected: FAIL because `apps/table-editor/src/rendering/FreshAltAuthoringPreview.tsx` does not exist yet and `EditorPreview.tsx` still contains the old R3F preview.

- [ ] **Step 3: Extend the schema unit tests with south-lock and round-trip expectations**

```ts
it("preserves south in the schema while allowing editor-safe read-only treatment", () => {
  const layout = createDefaultAltTableLayout();
  expect(layout.hands.south.id).toBe("south");
  expect(layout.hands.north.id).toBe("north");
  expect(layout.hands.east.id).toBe("east");
  expect(layout.hands.west.id).toBe("west");
});

it("round-trips valid alt layout json without dropping side hands or lanes", () => {
  const layout = createDefaultAltTableLayout();
  const parsed = safeParseLayout(JSON.stringify(layout));
  expect(parsed.errors).toEqual([]);
  expect(parsed.layout?.hands.south.id).toBe("south");
  expect(parsed.layout?.passingLanes["east-across"].id).toBe("east-across");
});
```

- [ ] **Step 4: Run the schema unit file and confirm the new coverage is green before implementation continues**

Run: `npm test -- tests/unit/table-layout-schema/schema.test.ts`

Expected: PASS. These tests document the existing structural contract and give us a stable baseline before editor-specific helpers are added.

- [ ] **Step 5: Commit the red/green test harness**

```bash
git add tests/integration/fresh-alt-table-editor-authoring.test.ts tests/unit/table-layout-schema/schema.test.ts
git commit -m "test: lock fresh alt table editor authoring contract"
```

### Task 2: Add Shared Fresh ALT Authoring Helpers

**Files:**
- Create: `apps/web/src/altTableFresh/authoringLayout.ts`
- Modify: `apps/web/src/altTableFresh/freshTableMath.ts`
- Modify: `apps/table-editor/vite.config.ts`
- Modify: `apps/table-editor/tsconfig.json`
- Test: `tests/integration/fresh-alt-table-editor-authoring.test.ts`

- [ ] **Step 1: Write the failing helper test expectations into the integration contract**

```ts
const authoringLayoutSource = readFileSync(
  resolve("apps/web/src/altTableFresh/authoringLayout.ts"),
  "utf8"
);

it("keeps authoring math in shared fresh alt helpers instead of gameplay code", () => {
  expect(authoringLayoutSource).toContain("export function createFreshAltAuthoringScene");
  expect(authoringLayoutSource).toContain("export function getEditableHandIds");
  expect(authoringLayoutSource).toContain("export function isHandLocked");
  expect(authoringLayoutSource).toContain("export function createLaneSelectionModel");
});
```

- [ ] **Step 2: Run the integration test and confirm the helper module is still missing**

Run: `npm test -- tests/integration/fresh-alt-table-editor-authoring.test.ts`

Expected: FAIL because `authoringLayout.ts` does not exist yet.

- [ ] **Step 3: Create the shared authoring helper module**

```ts
import type {
  AltTableLayout,
  PassingLaneId,
  SideHandId
} from "@tichuml/table-layout-schema";
import {
  makeNorthHandAnchors,
  makePassingAnchors,
  makeSideHandAnchors,
  makeSouthHandAnchors
} from "./freshTableMath";

export const LOCKED_HAND_IDS = new Set<SideHandId>(["south"]);
export const EDITABLE_HAND_IDS: SideHandId[] = ["north", "east", "west"];

export function getEditableHandIds(): SideHandId[] {
  return [...EDITABLE_HAND_IDS];
}

export function isHandLocked(handId: SideHandId): boolean {
  return LOCKED_HAND_IDS.has(handId);
}

export function createFreshAltAuthoringScene(layout: AltTableLayout) {
  return {
    layout,
    hands: {
      north: { anchors: makeNorthHandAnchors(), layout: layout.hands.north, locked: false },
      east: { anchors: makeSideHandAnchors("east"), layout: layout.hands.east, locked: false },
      west: { anchors: makeSideHandAnchors("west"), layout: layout.hands.west, locked: false },
      south: { anchors: makeSouthHandAnchors(), layout: layout.hands.south, locked: true }
    },
    lanes: makePassingAnchors()
  };
}

export function createLaneSelectionModel(layout: AltTableLayout, laneId: PassingLaneId) {
  return {
    lane: layout.passingLanes[laneId],
    laneId
  };
}
```

- [ ] **Step 4: Add the editor alias for the shared Fresh ALT authoring helper**

```ts
resolve: {
  alias: {
    "@tichuml/table-layout-schema": resolve(__dirname, "../../packages/table-layout-schema/src/index.ts"),
    "@tichuml/fresh-alt-authoring": resolve(
      __dirname,
      "../web/src/altTableFresh/authoringLayout.ts"
    )
  }
}
```

```json
{
  "compilerOptions": {
    "paths": {
      "@tichuml/table-layout-schema": ["../../packages/table-layout-schema/src/index.ts"],
      "@tichuml/fresh-alt-authoring": ["../web/src/altTableFresh/authoringLayout.ts"]
    }
  }
}
```

- [ ] **Step 5: Run the integration contract test and confirm the shared helper seam passes**

Run: `npm test -- tests/integration/fresh-alt-table-editor-authoring.test.ts`

Expected: FAIL only on the preview-routing expectations. The new helper-module
assertions should now pass, proving the shared authoring seam exists before the
editor is rewired.

- [ ] **Step 6: Commit the shared helper seam**

```bash
git add apps/web/src/altTableFresh/authoringLayout.ts apps/table-editor/vite.config.ts apps/table-editor/tsconfig.json tests/integration/fresh-alt-table-editor-authoring.test.ts
git commit -m "feat: add shared fresh alt authoring layout helpers"
```

### Task 3: Replace The Generic Preview With The Fresh ALT Authoring Surface

**Files:**
- Create: `apps/table-editor/src/rendering/FreshAltAuthoringPreview.tsx`
- Modify: `apps/table-editor/src/rendering/EditorPreview.tsx`
- Modify: `apps/table-editor/src/editor.css`
- Modify: `apps/table-editor/src/components/HierarchyPanel.tsx`
- Test: `tests/integration/fresh-alt-table-editor-authoring.test.ts`

- [ ] **Step 1: Expand the integration test to enforce the locked south label and new preview structure**

```ts
const hierarchySource = readFileSync(
  resolve("apps/table-editor/src/components/HierarchyPanel.tsx"),
  "utf8"
);

it("labels south as locked in the hierarchy", () => {
  expect(hierarchySource).toContain("South Hand (Locked)");
  expect(hierarchySource).toContain("isLockedHand");
});
```

- [ ] **Step 2: Run the integration test and confirm it fails because the hierarchy and preview are not updated**

Run: `npm test -- tests/integration/fresh-alt-table-editor-authoring.test.ts`

Expected: FAIL on the missing `South Hand (Locked)` label and missing authoring preview wrapper.

- [ ] **Step 3: Create the detached authoring preview wrapper**

```tsx
import type { AltTableLayout, PassingLaneId, SideHandId } from "@tichuml/table-layout-schema";
import { createFreshAltAuthoringScene, isHandLocked } from "@tichuml/fresh-alt-authoring";
import type { EditorSelection } from "../state/editorState";

const LOCKED_HANDS = new Set(["south"]);

export function FreshAltAuthoringPreview(props: {
  layout: AltTableLayout;
  selection: EditorSelection | null;
  onSelectHand: (side: SideHandId) => void;
  onSelectLane: (laneId: PassingLaneId) => void;
  onSelectArrow: (laneId: PassingLaneId) => void;
  onClearSelection: () => void;
}) {
  const scene = createFreshAltAuthoringScene(props.layout);

  return (
    <div className="editor-fresh-preview" data-testid="editor-fresh-alt-preview">
      <FreshAltAuthoringBoard
        scene={scene}
        selection={props.selection}
        onSelectHand={props.onSelectHand}
        onSelectLane={props.onSelectLane}
        onSelectArrow={props.onSelectArrow}
        onClearSelection={props.onClearSelection}
        southLocked={isHandLocked("south")}
      />
    </div>
  );
}

function FreshAltAuthoringBoard(props: {
  scene: ReturnType<typeof createFreshAltAuthoringScene>;
  selection: EditorSelection | null;
  onSelectHand: (side: SideHandId) => void;
  onSelectLane: (laneId: PassingLaneId) => void;
  onSelectArrow: (laneId: PassingLaneId) => void;
  onClearSelection: () => void;
  southLocked: boolean;
}) {
  return (
    <div
      className="editor-fresh-preview__board"
      data-locked-south={String(props.southLocked)}
      onClick={props.onClearSelection}
    />
  );
}
```

- [ ] **Step 4: Replace the old R3F preview entrypoint with the authoring wrapper**

```tsx
import type { AltTableLayout, SideHandId, PassingLaneId } from "@tichuml/table-layout-schema";
import type { EditorSelection } from "../state/editorState";
import { FreshAltAuthoringPreview } from "./FreshAltAuthoringPreview";

export function EditorPreview(props: {
  layout: AltTableLayout;
  selection: EditorSelection | null;
  onLayoutChange: (layout: AltTableLayout, description?: string) => void;
  onSelectHand: (side: SideHandId) => void;
  onSelectLane: (laneId: PassingLaneId) => void;
  onSelectArrow: (laneId: PassingLaneId) => void;
  onClearSelection: () => void;
}) {
  return <FreshAltAuthoringPreview {...props} />;
}
```

- [ ] **Step 5: Mark south as locked in the hierarchy UI**

```tsx
const isLockedHand = (side: SideHandId) => side === "south";

<span>
  {side === "south"
    ? "South Hand (Locked)"
    : `${side.charAt(0).toUpperCase() + side.slice(1)} Hand`}
</span>
```

- [ ] **Step 6: Run the integration contract test and confirm the preview seam now passes**

Run: `npm test -- tests/integration/fresh-alt-table-editor-authoring.test.ts`

Expected: PASS for preview routing, strict port, shared helper wiring, and locked south hierarchy labeling.

- [ ] **Step 7: Commit the preview replacement**

```bash
git add apps/table-editor/src/rendering/FreshAltAuthoringPreview.tsx apps/table-editor/src/rendering/EditorPreview.tsx apps/table-editor/src/components/HierarchyPanel.tsx apps/table-editor/src/editor.css tests/integration/fresh-alt-table-editor-authoring.test.ts
git commit -m "feat: route table editor through fresh alt authoring preview"
```

### Task 4: Enforce Locked South And Add Manual Export Helpers

**Files:**
- Modify: `apps/table-editor/src/components/PropertiesPanel.tsx`
- Modify: `apps/table-editor/src/state/editorState.ts`
- Modify: `apps/table-editor/src/components/Toolbar.tsx`
- Modify: `apps/table-editor/src/components/JsonModal.tsx`
- Modify: `apps/table-editor/src/App.tsx`
- Test: `tests/integration/fresh-alt-table-editor-authoring.test.ts`

- [ ] **Step 1: Add failing test expectations for locked south and partial export affordances**

```ts
const propertiesSource = readFileSync(
  resolve("apps/table-editor/src/components/PropertiesPanel.tsx"),
  "utf8"
);
const toolbarSource = readFileSync(
  resolve("apps/table-editor/src/components/Toolbar.tsx"),
  "utf8"
);
const jsonModalSource = readFileSync(
  resolve("apps/table-editor/src/components/JsonModal.tsx"),
  "utf8"
);

it("prevents editing south from the property panel", () => {
  expect(propertiesSource).toContain('if (side === "south")');
  expect(propertiesSource).toContain("Reference only");
});

it("adds partial export helpers for manual production handoff", () => {
  expect(toolbarSource).toContain("Copy Section");
  expect(jsonModalSource).toContain("alt-table-layout.json");
  expect(jsonModalSource).toContain("navigator.clipboard.writeText");
});
```

- [ ] **Step 2: Run the integration test and confirm the editor still lacks south-lock behavior and section-copy affordances**

Run: `npm test -- tests/integration/fresh-alt-table-editor-authoring.test.ts`

Expected: FAIL on the new lock and copy expectations.

- [ ] **Step 3: Guard the editor mutation path against south-hand edits**

```ts
export function isEditableHandId(side: SideHandId): boolean {
  return side !== "south";
}

export function updateHandMaster(
  layout: AltTableLayout,
  side: SideHandId,
  updater: (master: HandMasterTransform) => HandMasterTransform
): AltTableLayout {
  if (!isEditableHandId(side)) {
    return layout;
  }

  return {
    ...layout,
    hands: {
      ...layout.hands,
      [side]: {
        ...layout.hands[side],
        master: updater(layout.hands[side].master)
      }
    }
  };
}
```

- [ ] **Step 4: Make the property panel render south as reference-only**

```tsx
if (side === "south") {
  return (
    <div className="editor-properties">
      <div className="editor-properties__title">South Hand (Locked)</div>
      <div className="editor-properties__subtitle">
        Reference only. South stays visible in the preview but is not editable here.
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add a manual copy-section affordance for selected hand or lane data**

```tsx
<button
  className="editor-btn"
  onClick={props.onCopySection}
  title="Copy selected hand or lane JSON for manual production patching"
>
  Copy Section
</button>
```

```ts
const handleCopySection = useCallback(() => {
  if (!selection) {
    return;
  }

  const payload =
    selection.type === "hand"
      ? { [selection.id]: layout.hands[selection.id as SideHandId] }
      : { [selection.id]: layout.passingLanes[selection.id as PassingLaneId] };

  void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
}, [layout, selection]);
```

- [ ] **Step 6: Run the integration contract test and verify south lock plus partial export behavior**

Run: `npm test -- tests/integration/fresh-alt-table-editor-authoring.test.ts`

Expected: PASS for the new south-lock and copy-section assertions.

- [ ] **Step 7: Commit the editor UX safeguards**

```bash
git add apps/table-editor/src/components/PropertiesPanel.tsx apps/table-editor/src/state/editorState.ts apps/table-editor/src/components/Toolbar.tsx apps/table-editor/src/components/JsonModal.tsx apps/table-editor/src/App.tsx tests/integration/fresh-alt-table-editor-authoring.test.ts
git commit -m "feat: lock south hand and add manual export helpers"
```

### Task 5: Validate Round-Trips, Builds, And Production Handoff Readiness

**Files:**
- Modify: `tests/integration/fresh-alt-table-editor-authoring.test.ts`
- Modify: `tests/unit/table-layout-schema/schema.test.ts`
- Verify: `apps/table-editor/package.json`
- Verify: `package.json`

- [ ] **Step 1: Add a round-trip regression test for exported layout stability**

```ts
it("round-trips exported alt layout json without drift", () => {
  const layout = createDefaultAltTableLayout();
  const json = JSON.stringify(layout, null, 2);
  const parsed = safeParseLayout(json);

  expect(parsed.errors).toEqual([]);
  expect(JSON.stringify(parsed.layout, null, 2)).toBe(json);
});
```

- [ ] **Step 2: Run the schema unit file and confirm the round-trip stays green**

Run: `npm test -- tests/unit/table-layout-schema/schema.test.ts`

Expected: PASS with zero schema drift.

- [ ] **Step 3: Run the focused integration contract for the editor authoring seam**

Run: `npm test -- tests/integration/fresh-alt-table-editor-authoring.test.ts`

Expected: PASS.

- [ ] **Step 4: Build the shared schema package**

Run: `npm run build:table-layout-schema`

Expected: exit `0`.

- [ ] **Step 5: Build the standalone editor**

Run: `npm run editor:table:build`

Expected: exit `0` and emitted editor build under `apps/table-editor/dist`.

- [ ] **Step 6: Smoke-start the editor on the required port**

Run: `npm run editor:table`

Expected: dev server binds to `http://localhost:5178` and fails clearly if that port is occupied.

- [ ] **Step 7: Verify the final repo state before completion**

Run:

```bash
git status --short
git branch --show-current
git remote -v
git log --oneline -5
```

Expected:

- only intended editor, shared-helper, test, and docs changes are present
- branch remains the intended working branch
- remote is `origin`
- recent history includes the snapshot commit plus implementation commits

- [ ] **Step 8: Commit the validated implementation**

```bash
git add apps/table-editor apps/web/src/altTableFresh packages/table-layout-schema tests package.json
git commit -m "feat: build standalone fresh alt table editor"
```

- [ ] **Step 9: Push to remote main and verify the push landed**

Run:

```bash
git push origin HEAD:main
git fetch --prune origin "+refs/heads/main:refs/remotes/origin/main"
LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_MAIN="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
echo "LOCAL_HEAD=$LOCAL_HEAD"
echo "REMOTE_MAIN=$REMOTE_MAIN"
```

Expected:

- push exits `0`
- `LOCAL_HEAD` equals `REMOTE_MAIN`

- [ ] **Step 10: Update issue #100 with verification evidence**

Use the GitHub issue tracker to append:

```md
## Verification Evidence
- `npm test -- tests/unit/table-layout-schema/schema.test.ts`
- `npm test -- tests/integration/fresh-alt-table-editor-authoring.test.ts`
- `npm run build:table-layout-schema`
- `npm run editor:table:build`
- manual smoke on `http://localhost:5178`
- manual export copied into production Fresh ALT defaults
```
