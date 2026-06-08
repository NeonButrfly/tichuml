import { describe, expect, it } from "vitest";
import {
  getPlayerTableVariantFromSearch,
  updateSearchWithPlayerTableVariant
} from "../../apps/web/src/game-table-view-model";

describe("player table mode helpers", () => {
  it("reads the alternate table mode from the query string", () => {
    expect(getPlayerTableVariantFromSearch("?table=alt")).toBe("alternate");
    expect(getPlayerTableVariantFromSearch("?table=luxury")).toBe("alternate");
    expect(getPlayerTableVariantFromSearch("?table=normal")).toBe("normal");
    expect(getPlayerTableVariantFromSearch("?table=classic")).toBe("normal");
    expect(getPlayerTableVariantFromSearch("")).toBe("alternate");
  });

  it("writes a stable query string for the chosen table mode", () => {
    expect(updateSearchWithPlayerTableVariant("", "alternate")).toBe("");
    expect(updateSearchWithPlayerTableVariant("?table=alt&foo=1", "normal")).toBe(
      "?table=normal&foo=1"
    );
  });
});
