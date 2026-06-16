import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TABLE_EDITOR_VITE_CONFIG_PATH = fileURLToPath(
  new URL("../../apps/table-editor/vite.config.ts", import.meta.url)
);
const EDITOR_PREVIEW_PATH = fileURLToPath(
  new URL("../../apps/table-editor/src/rendering/EditorPreview.tsx", import.meta.url)
);
const FRESH_ALT_AUTHORING_PREVIEW_PATH = fileURLToPath(
  new URL("../../apps/table-editor/src/rendering/FreshAltAuthoringPreview.tsx", import.meta.url)
);

describe("fresh alt table editor authoring contract", () => {
  it("keeps the editor dev server locked to strict port 5178", () => {
    const viteConfigSource = readFileSync(TABLE_EDITOR_VITE_CONFIG_PATH, "utf8");

    expect(viteConfigSource).toContain("port: 5178");
    expect(viteConfigSource).toContain("strictPort: true");
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
