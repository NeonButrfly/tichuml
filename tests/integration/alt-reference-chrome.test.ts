import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tableSource = readFileSync(
  resolve("apps/web/src/alt-table-3d/AltTichuTable3D.tsx"),
  "utf8"
);

describe("ALT reference chrome", () => {
  it("matches the reference right-panel section headings", () => {
    expect(tableSource).toContain("Passing Lanes (12)");
    expect(tableSource).toContain("Passing Directions");
    expect(tableSource).toContain("Anchor Rules");
    expect(tableSource).toContain("Layer Order (Bottom");
  });

  it("matches the reference bottom preview titles", () => {
    expect(tableSource).toContain("Hand Anchor Preview");
    expect(tableSource).toContain("Passing Anchor Preview");
    expect(tableSource).toContain("Trick Anchor Preview (Virtual)");
  });
});
