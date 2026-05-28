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
const hiddenHandsSource = readFileSync(
  resolve("apps/web/src/alt-table-3d/AltHiddenHands3D.tsx"),
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

  it("uses a dedicated masked R3F hidden-hand layer while preserving authored tv7 card anchors", () => {
    expect(tableSource).toContain('import { AltHiddenHands3D');
    expect(tableSource).toContain("<AltHiddenHands3D");
    expect(hiddenHandsSource).toContain("@react-three/fiber");
    expect(hiddenHandsSource).toContain("Canvas");
    expect(hiddenHandsSource).toContain("mesh");
    expect(hiddenHandsSource).toContain("rotateX");
    expect(hiddenHandsSource).toContain("rotateY");
    expect(hiddenHandsSource).toContain("supportsWebGlCanvas");
    expect(stylesSource).toContain("alt-table-hidden-hands");
    expect(stylesSource).toContain("cardmask.png");
    expect(tableSource).not.toContain("HAND_LAYOUT");
    expect(tableSource).not.toContain("data-seat-hand");
    expect(tableSource).toContain('data-layout-source": "prototype_layer"');
    expect(hiddenHandsSource).toContain('data-render-mode="r3f-hidden-hand"');
    expect(runtimeSource).toContain("prototype_layer");
    expect(browserVerifySource).toContain("__tichuV7Snapshot");
    expect(browserVerifySource).toContain("apps/web/public/tv7/x/check.mjs");
  });
});
