import { describe, expect, it } from "vitest";
import {
  getTableCoverFit,
  getTableFit
} from "../../apps/web/src/altTableFresh/tableFit";

describe("fresh alt table viewport fit", () => {
  it("keeps contain-fit available for authored 1536x1024 overlays", () => {
    expect(getTableFit(873, 1017)).toEqual({
      scale: 873 / 1536,
      offsetX: 0,
      offsetY: (1017 - 1024 * (873 / 1536)) / 2,
      renderedW: 873,
      renderedH: 1024 * (873 / 1536)
    });
  });

  it("uses cover-fit for the live luxury table so portrait panes crop sideways instead of letterboxing", () => {
    const fit = getTableCoverFit(873, 1017);

    expect(fit.scale).toBeCloseTo(1017 / 1024, 6);
    expect(fit.offsetY).toBeCloseTo(0, 6);
    expect(fit.renderedH).toBeCloseTo(1017, 6);
    expect(fit.renderedW).toBeGreaterThan(873);
    expect(fit.offsetX).toBeLessThan(0);
  });
});
