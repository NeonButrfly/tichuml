import { describe, expect, it, vi } from "vitest";
import {
  buildLightgbmFeatureInputs,
  lightgbmRequiresSharedTacticalFeatures
} from "../../apps/server/src/providers/lightgbm-provider";
import type { LightgbmFeatureRequirements } from "../../apps/server/src/ml/lightgbm-scorer";

const BASE_PAYLOAD = {
  actor_seat: "seat-0",
  legal_actions: [{ type: "pass_turn", owner: "seat-0" }]
} as never;

const BASE_STATE = {
  phase: "trick_play",
  activeSeat: "seat-0",
  currentTrick: null,
  currentWish: null,
  calls: {
    "seat-0": { smallTichu: false, grandTichu: false },
    "seat-1": { smallTichu: false, grandTichu: false },
    "seat-2": { smallTichu: false, grandTichu: false },
    "seat-3": { smallTichu: false, grandTichu: false }
  },
  hands: {
    "seat-0": [],
    "seat-1": [],
    "seat-2": [],
    "seat-3": []
  }
} as never;

describe("lightgbm feature path selection", () => {
  it("recognizes runtime_raw models as tactical-analyzer free", () => {
    const requirements: LightgbmFeatureRequirements = {
      featureNames: ["action_rank", "phase_trick_play"],
      featureProfile: "runtime_raw",
      modelPhase: "trick_play"
    };

    expect(lightgbmRequiresSharedTacticalFeatures(requirements)).toBe(false);
  });

  it("skips shared tactical feature building for runtime_raw models", () => {
    const analyzerFactory = vi.fn(() => {
      throw new Error("runtime_raw models should not create the analyzer");
    });

    const result = buildLightgbmFeatureInputs({
      payload: BASE_PAYLOAD,
      stateRaw: BASE_STATE,
      actorSeat: "seat-0",
      scoringLegalActions: [{ type: "pass_turn", owner: "seat-0" } as never],
      featureRequirements: {
        featureNames: ["action_rank", "phase_trick_play"],
        featureProfile: "runtime_raw",
        modelPhase: "trick_play"
      },
      analyzerFactory: analyzerFactory as never
    });

    expect(analyzerFactory).not.toHaveBeenCalled();
    expect(result.stateFeatures).toBeNull();
    expect(result.candidateFeatures).toEqual([null]);
    expect(result.metadata["shared_tactical_features_used"]).toBe(false);
    expect(result.metadata["model_feature_profile"]).toBe("runtime_raw");
  });

  it("uses the shared tactical analyzer when the model requires tactical features", () => {
    const fakeStateFeatures = { hand_quality_score: 42 } as never;
    const fakeCandidateFeatures = { future_hand_quality_delta: 7 } as never;
    const getStateFeatures = vi.fn(() => fakeStateFeatures);
    const getCandidateFeatures = vi.fn(() => fakeCandidateFeatures);
    const analyzerFactory = vi.fn(() => ({
      getStateFeatures,
      getCandidateFeatures
    }));

    const result = buildLightgbmFeatureInputs({
      payload: BASE_PAYLOAD,
      stateRaw: BASE_STATE,
      actorSeat: "seat-0",
      scoringLegalActions: [{ type: "pass_turn", owner: "seat-0" } as never],
      featureRequirements: {
        featureNames: ["hand_quality_score", "action_rank"],
        featureProfile: "full",
        modelPhase: "trick_play"
      },
      analyzerFactory: analyzerFactory as never
    });

    expect(analyzerFactory).toHaveBeenCalledTimes(1);
    expect(getStateFeatures).toHaveBeenCalledWith("seat-0");
    expect(getCandidateFeatures).toHaveBeenCalledTimes(1);
    expect(result.stateFeatures).toBe(fakeStateFeatures);
    expect(result.candidateFeatures).toEqual([fakeCandidateFeatures]);
    expect(result.metadata["shared_tactical_features_used"]).toBe(true);
    expect(result.metadata["model_feature_profile"]).toBe("full");
  });
});
