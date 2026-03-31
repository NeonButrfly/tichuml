import { describe, expect, it } from "vitest";
import { heuristicFoundation } from "@tichuml/ai-heuristics";
import { engineFoundation } from "@tichuml/engine";
import { telemetryFoundation } from "@tichuml/telemetry";
import { FOUNDATION_MILESTONE, workspaceManifests } from "@tichuml/shared";

describe("milestone 0 workspace scaffold", () => {
  it("keeps foundational packages aligned to the same milestone", () => {
    expect(FOUNDATION_MILESTONE).toBe("milestone-0");
    expect(engineFoundation.milestone).toBe("milestone-1");
    expect(engineFoundation.deterministicCoreReady).toBe(true);
    expect(telemetryFoundation.milestone).toBe("milestone-2");
    expect(telemetryFoundation.eventTelemetryReady).toBe(true);
  });

  it("declares the expected workspace manifests", () => {
    expect(workspaceManifests).toHaveLength(5);
    expect(heuristicFoundation.dependsOn).toBe("authoritative-engine");
    expect(heuristicFoundation.readyForHeadlessFlow).toBe(true);
  });
});
