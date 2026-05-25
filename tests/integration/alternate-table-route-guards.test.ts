import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve("apps/web/src/App.tsx"), "utf8");
const routeSource = readFileSync(
  resolve("apps/web/src/alt-table-3d/AltTable3DRoute.tsx"),
  "utf8"
);
const tableSource = readFileSync(
  resolve("apps/web/src/alt-table-3d/AltTichuTable3D.tsx"),
  "utf8"
);

describe("alternate table route guards", () => {
  it("routes the ALT table through the isolated empty 3D shell and keeps the default table intact", () => {
    expect(appSource).toContain('import { AltTable3DRoute } from "./alt-table-3d/AltTable3DRoute";');
    expect(appSource).toContain("<AltTable3DRoute {...viewProps} />");
    expect(appSource).toContain("<NormalGameTableView {...viewProps} />");
    expect(appSource).not.toContain("AlternateGameTableView");
  });

  it("keeps the ALT route isolated from the old gameplay renderers and DOM fallback stack", () => {
    expect(routeSource).toContain('import { AltTichuTable3D } from "./AltTichuTable3D";');
    expect(routeSource).not.toContain("AltTable3DScene");
    expect(routeSource).not.toContain("alternate-game-table-view");
    expect(routeSource).not.toContain("three-surface");
    expect(routeSource).not.toContain("alternate-three-surface");
    expect(routeSource).not.toContain("alternate-hitbox-card");
    expect(routeSource).not.toContain("alternate-hitbox-route");
  });

  it("marks the empty scene shell and does not expose card or action-rail placeholders", () => {
    expect(tableSource).toContain('data-alt-table-3d-scene="true"');
    expect(tableSource).toContain('data-scene-node="seat-rail"');
    expect(tableSource).toContain('data-scene-node="seat-label"');
    expect(tableSource).not.toContain("data-scene-card");
    expect(tableSource).not.toContain("action-rail");
  });
});
