import { engineFoundation } from "@tichuml/engine";

export const heuristicFoundation = {
  policyFamily: "team-aware-heuristics",
  dependsOn: engineFoundation.name,
  readyForHeadlessFlow: false
};

