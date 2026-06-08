import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve("apps/web/src/App.tsx"), "utf8");
const routeSource = readFileSync(
  resolve("apps/web/src/alt-table-3d/AltTable3DRoute.tsx"),
  "utf8"
);
const freshTableSource = readFileSync(
  resolve("apps/web/src/altTableFresh/FreshAltTable.tsx"),
  "utf8"
);
const freshMathSource = readFileSync(
  resolve("apps/web/src/altTableFresh/freshTableMath.ts"),
  "utf8"
);
const tableFitSource = readFileSync(
  resolve("apps/web/src/altTableFresh/tableFit.ts"),
  "utf8"
);
const checksSource = readFileSync(
  resolve("apps/web/src/altTableFresh/freshAltTableChecks.ts"),
  "utf8"
);

describe("alternate table route guards", () => {
  it("routes the luxury table through the fresh alternate renderer while keeping the default table intact", () => {
    expect(appSource).toContain(
      'import { AltTable3DRoute } from "./alt-table-3d/AltTable3DRoute";'
    );
    expect(appSource).toContain("<AltTable3DRoute {...viewProps} />");
    expect(appSource).toContain("<NormalGameTableView {...viewProps} />");
    expect(routeSource).toContain('import { FreshAltTable } from "../altTableFresh/FreshAltTable";');
    expect(routeSource).toContain("<FreshAltTable");
  });

  it("locks the fresh alt table to /table/table.png and tv_ed card art", () => {
    expect(checksSource).toContain('export const FRESH_ALT_TABLE_SRC = "/table/table.png";');
    expect(checksSource).toContain('export const FRESH_ALT_CARD_BACK_SRC = "/tv_ed/c/back/green.png";');
    expect(checksSource).not.toContain("/tv14");
    expect(checksSource).not.toContain("/tv15");
    expect(checksSource).not.toContain("/tv16");
    expect(checksSource).not.toContain("/tv17");
    expect(checksSource).not.toContain("/tv18");
    expect(checksSource).not.toContain("plate.png");
  });

  it("keeps the fresh alt table in the fixed 1536x1024 contain-fit coordinate system", () => {
    expect(tableFitSource).toContain("export const DESIGN_W = 1536;");
    expect(tableFitSource).toContain("export const DESIGN_H = 1024;");
    expect(tableFitSource).toContain("Math.min(viewW / DESIGN_W, viewH / DESIGN_H)");
    expect(freshTableSource).toContain('data-testid="fresh-alt-table"');
    expect(freshTableSource).toContain('data-alt-table-root="fresh"');
    expect(freshTableSource).toContain("__freshAltTableSnapshot");
  });

  it("uses the fresh readable rack math instead of the retired projected side-card variants", () => {
    expect(freshMathSource).toContain("north_rack_back_mostly_visible");
    expect(freshMathSource).toContain("side_rack_readable_fan");
    expect(freshMathSource).toContain("south_player_fan");
    expect(freshMathSource).toContain("scaleX: 0.72");
    expect(freshMathSource).not.toContain("polygon_px");
    expect(freshMathSource).not.toContain("projected_quad");
    expect(freshMathSource).not.toContain("quad_projected");
    expect(freshMathSource).not.toContain("side_rack_readable_fan_v2");
  });
});
