import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getPlayerTableVariantFromSearch,
  updateSearchWithPlayerTableVariant
} from "../../apps/web/src/game-table-view-model";

const appSource = readFileSync(resolve("apps/web/src/App.tsx"), "utf8");
const menuSource = readFileSync(
  resolve("apps/web/src/game-table-views.tsx"),
  "utf8"
);
const packageJsonSource = readFileSync(resolve("package.json"), "utf8");

describe("luxury table recovery routing", () => {
  it("recognizes luxury aliases and preserves unrelated query parameters", () => {
    expect(getPlayerTableVariantFromSearch("?table=alt")).toBe("luxury");
    expect(getPlayerTableVariantFromSearch("?table=luxury")).toBe("luxury");
    expect(getPlayerTableVariantFromSearch("?table=alternate")).toBe("luxury");
    expect(getPlayerTableVariantFromSearch("?table=unknown")).toBe("normal");
    expect(updateSearchWithPlayerTableVariant("?foo=1", "luxury")).toBe(
      "?foo=1&table=luxury"
    );
    expect(
      updateSearchWithPlayerTableVariant(
        "?table=alt&preview=pass-select",
        "normal"
      )
    ).toBe("");
  });

  it("preserves the standard view without restoring the duplicate archived 3D route", () => {
    expect(appSource).toContain("<NormalGameTableView {...viewProps} />");
    expect(appSource).not.toContain("AltTable3DRoute");
    expect(appSource).not.toContain("createAlternatePassSelectPreviewSession");
  });

  it("exposes the luxury menu while keeping obsolete editor scripts archived", () => {
    expect(menuSource).toContain("Luxury Table");
    expect(menuSource).not.toContain("Classic table on luxury table enabled");
    expect(packageJsonSource).not.toContain("verify:browser:alt");
    expect(packageJsonSource).not.toContain("editor:table");
  });
});
