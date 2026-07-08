import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getPlayerTableVariantFromSearch,
  updateSearchWithPlayerTableVariant
} from "../../apps/web/src/game-table-view-model";

const appSource = readFileSync(resolve("apps/web/src/App.tsx"), "utf8");
const menuSource = readFileSync(resolve("apps/web/src/game-table-views.tsx"), "utf8");
const packageJsonSource = readFileSync(resolve("package.json"), "utf8");

describe("luxury table removal", () => {
  it("normalizes legacy luxury-table URLs back to the standard table", () => {
    expect(getPlayerTableVariantFromSearch("?table=alt")).toBe("normal");
    expect(getPlayerTableVariantFromSearch("?table=luxury")).toBe("normal");
    expect(getPlayerTableVariantFromSearch("?table=alternate")).toBe("normal");
    expect(updateSearchWithPlayerTableVariant("?table=alt&preview=pass-select", "normal")).toBe("");
  });

  it("renders only the normal gameplay table and removes luxury runtime hooks", () => {
    expect(appSource).toContain("<NormalGameTableView {...viewProps} />");
    expect(appSource).not.toContain("AltTable3DRoute");
    expect(appSource).not.toContain("createAlternatePassSelectPreviewSession");
  });

  it("removes the luxury-table menu toggle and archived scripts from active package commands", () => {
    expect(menuSource).not.toContain("Luxury Table");
    expect(menuSource).not.toContain("Classic table on luxury table enabled");
    expect(packageJsonSource).not.toContain("verify:browser:alt");
    expect(packageJsonSource).not.toContain("editor:table");
  });
});
