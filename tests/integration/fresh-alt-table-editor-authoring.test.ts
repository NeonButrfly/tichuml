import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

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

describe("fresh alt table editor authoring contract", () => {
  it("keeps the editor dev server locked to strict port 5178 and wires the shared fresh alt authoring alias", () => {
    const viteConfigSource = readFileSync(TABLE_EDITOR_VITE_CONFIG_PATH, "utf8");
    const tsconfigSource = readFileSync(TABLE_EDITOR_TSCONFIG_PATH, "utf8");

    expect(viteConfigSource).toContain("port: 5178");
    expect(viteConfigSource).toContain("strictPort: true");
    expect(viteConfigSource).toContain('"@tichuml/fresh-alt-authoring"');
    expect(viteConfigSource).toContain("../../apps/web/src/altTableFresh/authoringLayout.ts");
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
    expect(scene.design).toEqual({ w: 1536, h: 1024 });
    expect(scene.hands.north).toHaveLength(14);
    expect(scene.hands.east).toHaveLength(14);
    expect(scene.hands.west).toHaveLength(14);
    expect(scene.hands.south).toHaveLength(14);
    expect(scene.passing).toHaveLength(12);
    expect(scene.tricks).toHaveLength(4);

    const layout = {
      passingLanes: {
        "north-left": { id: "north-left", visible: true },
        "south-right": { id: "south-right", visible: false }
      }
    };

    const laneSelection = authoringHelpers.createLaneSelectionModel(layout);
    expect(laneSelection.laneIds).toEqual(["north-left", "south-right"]);
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
    expect(authoringPreviewSource).not.toMatch(
      /onSelectHand[\s\S]{0,200}["']south["']|["']south["'][\s\S]{0,200}onSelectHand/
    );
  });
});
