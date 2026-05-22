import { describe, expect, it } from "vitest";
import { parseJsonObjectAllowingNonFiniteLiterals } from "../../apps/server/src/ml/lightgbm-scorer";

describe("parseJsonObjectAllowingNonFiniteLiterals", () => {
  it("replaces bare NaN metadata values without touching normal JSON fields", () => {
    const payload = parseJsonObjectAllowingNonFiniteLiterals(
      '{"id":"score-1","scores":[1,2,3],"model_metadata":{"validation_metrics":{"spearman":NaN},"label":"ok"},"runtime_metadata":{"missing_feature_count":0}}'
    );

    expect(payload.id).toBe("score-1");
    expect(payload.scores).toEqual([1, 2, 3]);
    expect(payload.model_metadata).toEqual({
      validation_metrics: { spearman: null },
      label: "ok"
    });
  });

  it("also neutralizes signed infinity literals outside quoted strings", () => {
    const payload = parseJsonObjectAllowingNonFiniteLiterals(
      '{"id":"score-2","scores":[5],"runtime_metadata":{"best":Infinity,"worst":-Infinity,"note":"Infinity stays in strings"}}'
    );

    expect(payload.runtime_metadata).toEqual({
      best: null,
      worst: null,
      note: "Infinity stays in strings"
    });
  });
});
