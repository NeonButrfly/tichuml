import { heuristicFoundation } from "@tichuml/ai-heuristics";
import { telemetryFoundation } from "@tichuml/telemetry";

export function createSimulationManifest() {
  return {
    runner: "sim-runner",
    policyFamily: heuristicFoundation.policyFamily,
    telemetrySchemaVersion: telemetryFoundation.schemaVersion
  };
}

