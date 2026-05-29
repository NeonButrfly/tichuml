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
const sceneSource = readFileSync(
  resolve("apps/web/src/alt-table-3d/AltTableScene.tsx"),
  "utf8"
);
const cards3dSource = readFileSync(
  resolve("apps/web/src/alt-table-3d/AltTableCards3D.tsx"),
  "utf8"
);
const runtimeSource = readFileSync(
  resolve("apps/web/src/alt-table-3d/tv7-runtime.ts"),
  "utf8"
);
const stylesSource = readFileSync(
  resolve("apps/web/src/alt-table-3d/alt-table-3d.css"),
  "utf8"
);
const browserVerifySource = readFileSync(resolve("scripts/browser-verify.ts"), "utf8");

describe("alternate table route guards", () => {
  it("routes the ALT table through the dedicated route while keeping the normal table intact", () => {
    expect(appSource).toContain(
      'import { AltTable3DRoute } from "./alt-table-3d/AltTable3DRoute";'
    );
    expect(appSource).toContain("<AltTable3DRoute {...viewProps} />");
    expect(appSource).toContain("<NormalGameTableView {...viewProps} />");
    expect(appSource).not.toContain("AlternateGameTableView");
  });

  it("locks the production tv7 asset paths to the approved short public runtime root", () => {
    expect(runtimeSource).toContain('export const TV7_ASSET_ROOT = "/tv7";');
    expect(runtimeSource).toContain(
      'export const TV7_TABLE_PLATE_SRC = `${TV7_ASSET_ROOT}/t/plate.png`;'
    );
    expect(runtimeSource).toContain(
      'export const TV7_PASSING_OVERLAY_SRC = `${TV7_ASSET_ROOT}/p/o.png`;'
    );
    expect(runtimeSource).toContain(
      'export const TV7_PASSING_ANCHOR_JSON_SRC = `${TV7_ASSET_ROOT}/p/a.json`;'
    );
    expect(runtimeSource).toContain(
      'export const TV7_CARD_ANCHOR_JSON_SRC = `${TV7_ASSET_ROOT}/h/a.json`;'
    );
    expect(routeSource).not.toContain("/tv6");
    expect(tableSource).not.toContain("/tv6");
  });

  it("uses a dedicated R3F world-scene hidden-hand layer while preserving authored tv7 card anchors", () => {
    expect(tableSource).toContain('import { AltTableScene }');
    expect(tableSource).toContain("<AltTableScene");
    expect(tableSource).not.toContain("resolveSouthHandLayout");
    expect(sceneSource).toContain("@react-three/fiber");
    expect(sceneSource).toContain("Canvas");
    expect(sceneSource).toContain("camera.lookAt(0, 0, 0)");
    expect(sceneSource).toContain("RackShell");
    expect(sceneSource).toContain("TableBody");
    expect(sceneSource).toContain("FrameRail");
    expect(sceneSource).toContain("WOOD_GRAIN_SRC");
    expect(sceneSource).toContain("DRAGON_MOTIF_SRC");
    expect(sceneSource).toContain("ALT_HIDDEN_CARD_BACK_SRC");
    expect(sceneSource).toContain("supportsWebGlCanvas");
    expect(cards3dSource).toContain("CARD_WIDTH =");
    expect(cards3dSource).toContain("CARD_HEIGHT =");
    expect(cards3dSource).toContain("CARD_ASPECT = 2.5 / 3.5");
    expect(cards3dSource).toContain("CARD_THICKNESS =");
    expect(cards3dSource).toContain("<boxGeometry args={[size.width, size.height, CARD_THICKNESS]} />");
    expect(cards3dSource).toContain("getHiddenCardWorldSize");
    expect(cards3dSource).toContain("getHiddenCardAspectRatio");
    expect(cards3dSource).toContain("resolveHiddenHandPlacement");
    expect(stylesSource).toContain("alt-table-world-scene");
    expect(tableSource).not.toContain("HAND_LAYOUT");
    expect(tableSource).not.toContain("data-seat-hand");
    expect(tableSource).toContain('data-layout-source": "prototype_layer"');
    expect(sceneSource).toContain('data-render-mode="r3f-hidden-hand"');
    expect(runtimeSource).toContain("prototype_layer");
    expect(browserVerifySource).toContain("__tichuV7Snapshot");
    expect(browserVerifySource).toContain("apps/web/public/tv7/x/check.mjs");
  });
});
