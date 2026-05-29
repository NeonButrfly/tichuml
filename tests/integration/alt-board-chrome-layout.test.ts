import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tableSource = readFileSync(
  resolve("apps/web/src/alt-table-3d/AltTichuTable3D.tsx"),
  "utf8"
);
const stylesSource = readFileSync(
  resolve("apps/web/src/alt-table-3d/alt-table-3d.css"),
  "utf8"
);

describe("ALT board chrome layout", () => {
  it("mounts the status and preview chrome inside the authored board container", () => {
    expect(tableSource).toContain('data-alt-board-chrome="true"');
    expect(tableSource).toContain('<div className="alt-table-board__chrome" data-alt-board-chrome="true">');
    expect(tableSource).toContain("<aside className=\"alt-table-status\">");
    expect(tableSource).toContain("<div className=\"alt-table-footer\">");
  });

  it("positions board chrome in board-space instead of fixed viewport space", () => {
    expect(stylesSource).toContain(".alt-table-board__chrome");
    expect(stylesSource).toContain("position: absolute;");
    expect(stylesSource).toContain(".alt-table-status");
    expect(stylesSource).toContain(".alt-table-footer");
    expect(stylesSource).not.toContain(".alt-table-status {\n  position: fixed;");
    expect(stylesSource).not.toContain(".alt-table-footer {\n  position: fixed;");
  });
});
