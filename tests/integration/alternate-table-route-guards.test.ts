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
const altTableSource = readFileSync(
  resolve("apps/web/src/altTable/AltTable3D.tsx"),
  "utf8"
);
const rackMathSource = readFileSync(
  resolve("apps/web/src/altTable/v18CardRackMath.ts"),
  "utf8"
);
const tableFitSource = readFileSync(
  resolve("apps/web/src/altTable/tableFit.ts"),
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

  it("routes the ALT board through the fixed 1536x1024 plane-plus-overlay R3F stack", () => {
    expect(tableSource).toContain('from "../altTable/AltTable3D";');
    expect(tableSource).toContain("<AltTable3D");
    expect(altTableSource).toContain("@react-three/fiber");
    expect(altTableSource).toContain("OrthographicCamera");
    expect(altTableSource).toContain("single_image_plane");
    expect(altTableSource).toContain("react-three-fiber");
    expect(altTableSource).toContain("1536 / 1024");
    expect(rackMathSource).toContain("north_rack_back_mostly_visible");
    expect(rackMathSource).toContain("side_rack_readable_fan");
    expect(rackMathSource).toContain("south_player_fan");
    expect(rackMathSource).toContain("scaleX: 0.72");
    expect(tableFitSource).toContain("DESIGN_W = 1536");
    expect(tableFitSource).toContain("DESIGN_H = 1024");
    expect(stylesSource).toContain("alt-table-board__canvas");
    expect(stylesSource).toContain("aspect-ratio: 1536 / 1024");
    expect(browserVerifySource).toContain("__tichuAltTableSnapshot");
    expect(browserVerifySource).toContain("apps/web/public/tv7/x/check.mjs");
  });
});
