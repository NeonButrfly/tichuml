import { describe, expect, it } from "vitest";
import type { LegalAction } from "@tichuml/engine";
import type { JsonObject } from "@tichuml/shared";
import {
  rerankLightgbmCandidatesWithRollouts,
  type LightgbmRankedCandidate,
} from "../../apps/server/src/providers/lightgbm-provider";

function createRankedCandidate(
  actionKey: string,
  score: number
): LightgbmRankedCandidate {
  const legalAction = {
    type: "pass",
    seat: "seat-0",
  } as unknown as LegalAction;

  return {
    legalAction,
    score,
    concreteAction: {
      type: "pass",
      seat: "seat-0",
      action_key: actionKey,
    } as JsonObject,
    actionKey,
    features: null,
  };
}

describe("rerankLightgbmCandidatesWithRollouts", () => {
  it("prefers the stronger rollout outcome over the top raw LightGBM score", async () => {
    const ranked = [
      createRankedCandidate("candidate-a", 0.9),
      createRankedCandidate("candidate-b", 0.6),
      createRankedCandidate("candidate-c", 0.1),
    ];

    const result = await rerankLightgbmCandidatesWithRollouts(
      {
        ranked,
        topK: 2,
        samplesPerCandidate: 1,
      },
      {
        simulateCandidate: async (candidate) => ({
          rolloutSamples: 1,
          rolloutFailures: 0,
          rolloutMeanActorTeamDelta:
            candidate.actionKey === "candidate-a" ? -180 : 120,
          rolloutFailureReason: null,
        }),
      }
    );

    expect(result).not.toBeNull();
    expect(result?.selected.actionKey).toBe("candidate-b");
    expect(result?.overrodeTopScore).toBe(true);
    expect(result?.candidateResults[0]?.actionKey).toBe("candidate-a");
    expect(result?.candidateResults[1]?.actionKey).toBe("candidate-b");
  });

  it("returns null when there are not enough candidates to rerank", async () => {
    const result = await rerankLightgbmCandidatesWithRollouts(
      {
        ranked: [createRankedCandidate("candidate-a", 0.9)],
        topK: 2,
        samplesPerCandidate: 1,
      },
      {
        simulateCandidate: async () => ({
          rolloutSamples: 1,
          rolloutFailures: 0,
          rolloutMeanActorTeamDelta: 10,
          rolloutFailureReason: null,
        }),
      }
    );

    expect(result).toBeNull();
  });
});
