import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve("apps/web/src/App.tsx"), "utf8");
const routeSource = readFileSync(
  resolve("apps/web/src/alt-table-3d/AltTable3DRoute.tsx"),
  "utf8"
);
const cardMeshSource = readFileSync(
  resolve("apps/web/src/alt-table-3d/AltTable3DCardMesh.tsx"),
  "utf8"
);

describe("alternate table route guards", () => {
  it("routes the ALT table through the isolated React 3D route and leaves the default table path intact", () => {
    expect(appSource).toContain('import { AltTable3DRoute } from "./alt-table-3d/AltTable3DRoute";');
    expect(appSource).toContain("<AltTable3DRoute {...viewProps} />");
    expect(appSource).toContain("<NormalGameTableView {...viewProps} />");
    expect(appSource).not.toContain("AlternateGameTableView");
  });

  it("does not reference the old ALT fallback renderers or class stack", () => {
    expect(routeSource).not.toContain("alternate-game-table-view");
    expect(routeSource).not.toContain("three-surface");
    expect(routeSource).not.toContain("alternate-three-surface");
    expect(routeSource).not.toContain("alternate-hitbox-card");
    expect(routeSource).not.toContain("alternate-hitbox-route");
  });

  it("keeps south card rendering mesh-backed instead of DOM-only card placeholders", () => {
    expect(cardMeshSource).toContain("meshRole: \"card-face\"");
    expect(cardMeshSource).toContain("meshRole: \"card-back\"");
    expect(cardMeshSource).toContain("<planeGeometry");
    expect(cardMeshSource).not.toContain("button");
    expect(cardMeshSource).not.toContain("div");
  });
});
