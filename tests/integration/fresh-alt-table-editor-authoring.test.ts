import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { PASSING_LANE_IDS } from "@tichuml/table-layout-schema";

const TABLE_EDITOR_VITE_CONFIG_PATH = fileURLToPath(
  new URL("../../apps/table-editor/vite.config.ts", import.meta.url)
);
const TABLE_EDITOR_TSCONFIG_PATH = fileURLToPath(
  new URL("../../apps/table-editor/tsconfig.json", import.meta.url)
);
const EDITOR_PREVIEW_PATH = fileURLToPath(
  new URL("../../apps/table-editor/src/rendering/EditorPreview.tsx", import.meta.url)
);
const FRESH_ALT_AUTHORING_PREVIEW_PATH = fileURLToPath(
  new URL("../../apps/table-editor/src/rendering/FreshAltAuthoringPreview.tsx", import.meta.url)
);
const FRESH_ALT_AUTHORING_LAYOUT_PATH = fileURLToPath(
  new URL("../../apps/web/src/altTableFresh/authoringLayout.ts", import.meta.url)
);
const PROPERTIES_PANEL_PATH = fileURLToPath(
  new URL("../../apps/table-editor/src/components/PropertiesPanel.tsx", import.meta.url)
);
const TOOLBAR_PATH = fileURLToPath(
  new URL("../../apps/table-editor/src/components/Toolbar.tsx", import.meta.url)
);
const JSON_MODAL_PATH = fileURLToPath(
  new URL("../../apps/table-editor/src/components/JsonModal.tsx", import.meta.url)
);

describe("fresh alt table editor authoring contract", () => {
  it("keeps the editor dev server locked to strict port 5178 and wires the shared fresh alt authoring alias", async () => {
    const tsconfigSource = readFileSync(TABLE_EDITOR_TSCONFIG_PATH, "utf8");
    const viteConfigModule = await import(
      pathToFileURL(TABLE_EDITOR_VITE_CONFIG_PATH).href
    );
    const viteConfig = viteConfigModule.default;
    const aliasEntry = viteConfig.resolve.alias[
      "@tichuml/fresh-alt-authoring"
    ];

    expect(viteConfig.server.port).toBe(5178);
    expect(viteConfig.server.strictPort).toBe(true);
    expect(aliasEntry).toBe(FRESH_ALT_AUTHORING_LAYOUT_PATH);
    expect(existsSync(aliasEntry)).toBe(true);
    expect(tsconfigSource).toContain('"@tichuml/fresh-alt-authoring"');
    expect(tsconfigSource).toContain("../../apps/web/src/altTableFresh/authoringLayout.ts");
  });

  it("exposes a shared fresh alt authoring helper seam for runtime-safe editor consumers", async () => {
    expect(existsSync(FRESH_ALT_AUTHORING_LAYOUT_PATH)).toBe(true);

    const authoringHelpers = await import(
      pathToFileURL(FRESH_ALT_AUTHORING_LAYOUT_PATH).href
    );

    expect(typeof authoringHelpers.createFreshAltAuthoringScene).toBe("function");
    expect(typeof authoringHelpers.getEditableHandIds).toBe("function");
    expect(typeof authoringHelpers.isHandLocked).toBe("function");
    expect(typeof authoringHelpers.createLaneSelectionModel).toBe("function");

    expect(authoringHelpers.getEditableHandIds()).toEqual([
      "north",
      "east",
      "west"
    ]);
    expect(authoringHelpers.isHandLocked("south")).toBe(true);
    expect(authoringHelpers.isHandLocked("north")).toBe(false);
    expect(authoringHelpers.isHandLocked("east")).toBe(false);
    expect(authoringHelpers.isHandLocked("west")).toBe(false);

    const scene = authoringHelpers.createFreshAltAuthoringScene();
    expect(scene.design.w).toBeGreaterThan(0);
    expect(scene.design.h).toBeGreaterThan(0);
    expect(Object.keys(scene.hands)).toEqual(["north", "east", "south", "west"]);
    expect(scene.hands.north.length).toBeGreaterThan(0);
    expect(scene.hands.east.length).toBeGreaterThan(0);
    expect(scene.hands.west.length).toBeGreaterThan(0);
    expect(scene.hands.south.length).toBeGreaterThan(0);
    expect(scene.passing.map((lane) => lane.id)).toEqual([
      "north_pass_left",
      "north_pass_across",
      "north_pass_right",
      "south_pass_left",
      "south_pass_across",
      "south_pass_right",
      "west_pass_north",
      "west_pass_across",
      "west_pass_south",
      "east_pass_north",
      "east_pass_across",
      "east_pass_south"
    ]);
    expect(scene.tricks.map((trick) => trick.seat)).toEqual([
      "north",
      "west",
      "east",
      "south"
    ]);

    const passingLanes = Object.assign(
      Object.create({
        "east-across": { id: "east-across", visible: true }
      }),
      {
        "south-right": { id: "south-right", visible: false },
        "north-left": { id: "north-left", visible: true }
      }
    );
    const layout = { passingLanes };

    const laneSelection = authoringHelpers.createLaneSelectionModel(layout);
    expect(laneSelection.laneIds).toEqual(
      PASSING_LANE_IDS.filter((laneId) =>
        Object.hasOwn(passingLanes, laneId)
      )
    );
    expect(laneSelection.hasLane("north-left")).toBe(true);
    expect(laneSelection.hasLane("east-across")).toBe(false);
    expect(laneSelection.getLane("south-right")).toEqual(
      layout.passingLanes["south-right"]
    );
    expect(laneSelection.getLane("east-across")).toBeNull();
  });

  it("routes EditorPreview through the FreshAltAuthoringPreview surface without debug scene helpers", () => {
    const editorPreviewSource = readFileSync(EDITOR_PREVIEW_PATH, "utf8");

    expect(editorPreviewSource).toContain("FreshAltAuthoringPreview");
    expect(editorPreviewSource).toMatch(
      /import\s+\{\s*FreshAltAuthoringPreview\s*\}\s+from\s+["'][^"']*FreshAltAuthoringPreview["']/
    );
    expect(editorPreviewSource).toMatch(/<FreshAltAuthoringPreview\b/);
    expect(editorPreviewSource).not.toContain("OrbitControls");
    expect(editorPreviewSource).not.toContain("Grid");
  });

  it("locks the south hand while still exposing north east and west hand selection affordances", () => {
    expect(existsSync(FRESH_ALT_AUTHORING_PREVIEW_PATH)).toBe(true);

    const authoringPreviewSource = readFileSync(
      FRESH_ALT_AUTHORING_PREVIEW_PATH,
      "utf8"
    );

    expect(authoringPreviewSource).toContain("FRESH_ALT_TABLE_SRC");
    expect(authoringPreviewSource).not.toContain('"_pass_"');
    expect(authoringPreviewSource).toMatch(
      /south[\s\S]{0,200}(locked|readOnly|disabled)|(?:locked|readOnly|disabled)[\s\S]{0,200}south/
    );
    expect(authoringPreviewSource).toMatch(
      /onSelectHand[\s\S]{0,200}["']north["']|["']north["'][\s\S]{0,200}onSelectHand/
    );
    expect(authoringPreviewSource).toMatch(
      /onSelectHand[\s\S]{0,200}["']east["']|["']east["'][\s\S]{0,200}onSelectHand/
    );
    expect(authoringPreviewSource).toMatch(
      /onSelectHand[\s\S]{0,200}["']west["']|["']west["'][\s\S]{0,200}onSelectHand/
    );
    expect(authoringPreviewSource).not.toContain('onSelectHand("south")');
    expect(authoringPreviewSource).not.toContain("onSelectHand('south')");
  });

  it("prevents editing south from the property panel and adds partial export helpers", () => {
    const propertiesSource = readFileSync(PROPERTIES_PANEL_PATH, "utf8");
    const toolbarSource = readFileSync(TOOLBAR_PATH, "utf8");
    const jsonModalSource = readFileSync(JSON_MODAL_PATH, "utf8");

    expect(propertiesSource).toContain('if (!isEditableHandId(side))');
    expect(propertiesSource).toContain("Reference only");
    expect(toolbarSource).toContain("Copy Section");
    expect(jsonModalSource).toContain("alt-table-layout.json");
    expect(jsonModalSource).toContain("navigator.clipboard.writeText");
  });

  it("exposes master card-local 3D rotation and pivot controls for editable hands", () => {
    const propertiesSource = readFileSync(PROPERTIES_PANEL_PATH, "utf8");
    const authoringLayoutSource = readFileSync(
      FRESH_ALT_AUTHORING_LAYOUT_PATH,
      "utf8"
    );

    expect(propertiesSource).toContain("Card Local Rotation (degrees)");
    expect(propertiesSource).toContain("Card Local Pivot");
    expect(propertiesSource).toContain("cardLocalRotation");
    expect(propertiesSource).toContain("cardLocalPivot");
    expect(authoringLayoutSource).toContain("cardLocalRotation");
    expect(authoringLayoutSource).toContain("cardLocalPivot");
  });

  it("projects card-local rotation and pivot onto every card in a hand", async () => {
    const authoringHelpers = await import(
      pathToFileURL(FRESH_ALT_AUTHORING_LAYOUT_PATH).href
    );
    const schema = await import("@tichuml/table-layout-schema");
    const layout = schema.createDefaultAltTableLayout();
    layout.hands.east.fan.cardLocalRotation = {
      x: Math.PI / 8,
      y: Math.PI / 6,
      z: Math.PI / 12
    };
    layout.hands.east.fan.cardLocalPivot = { x: -0.5, y: -0.5, z: 0 };

    const scene = authoringHelpers.createFreshAltAuthoringScene(layout);

    expect(scene.hands.east.length).toBeGreaterThan(1);
    for (const card of scene.hands.east) {
      expect(card.localRotationDeg).toEqual({
        x: 22.5,
        y: 30,
        z: 15
      });
      expect(card.transformOrigin).toBe("0% 0%");
    }
  });
});
