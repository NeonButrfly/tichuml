import { describe, expect, it } from "vitest";
import {
  createLightgbmDecisionDiagnostics,
  mergeLightgbmDecisionDiagnostics,
  recordLightgbmDecisionDiagnostics
} from "../../apps/sim-runner/src/self-play-batch";

describe("lightgbm self-play diagnostics", () => {
  it("tracks delegation reasons, rerank skips, and local fallbacks", () => {
    const diagnostics = createLightgbmDecisionDiagnostics();

    recordLightgbmDecisionDiagnostics(diagnostics, {
      requestedProvider: "lightgbm_model",
      providerUsed: "server_heuristic",
      providerMetadata: {
        lightgbm_small_branch_delegated: true,
        lightgbm_small_branch_legal_action_count: 3
      }
    });
    recordLightgbmDecisionDiagnostics(diagnostics, {
      requestedProvider: "lightgbm_model",
      providerUsed: "server_heuristic",
      providerMetadata: {
        lightgbm_tichu_call_delegated: true
      }
    });
    recordLightgbmDecisionDiagnostics(diagnostics, {
      requestedProvider: "lightgbm_model",
      providerUsed: "server_heuristic",
      providerMetadata: {
        lightgbm_confidence_delegated: true,
        lightgbm_rollout_rerank_skipped_reason: "actor_hand_size_above_threshold"
      }
    });
    recordLightgbmDecisionDiagnostics(diagnostics, {
      requestedProvider: "lightgbm_model",
      providerUsed: "lightgbm_model",
      providerMetadata: {
        lightgbm_rollout_rerank_skipped_reason: "score_margin_above_threshold"
      }
    });
    recordLightgbmDecisionDiagnostics(diagnostics, {
      requestedProvider: "lightgbm_model",
      providerUsed: "local_heuristic"
    });
    recordLightgbmDecisionDiagnostics(diagnostics, {
      requestedProvider: "server_heuristic",
      providerUsed: "server_heuristic",
      providerMetadata: {
        lightgbm_phase_delegated: true
      }
    });

    expect(diagnostics).toEqual({
      requestedDecisions: 5,
      completedByLightgbm: 1,
      delegatedToServerHeuristic: 3,
      localFallbackDecisions: 1,
      delegatedByReason: {
        small_branch_delegated: 1,
        tichu_call_delegated: 1,
        confidence_delegated: 1
      },
      rerankSkippedByReason: {
        actor_hand_size_above_threshold: 1,
        score_margin_above_threshold: 1
      },
      smallBranchLegalActionCount: {
        "3": 1
      }
    });
  });

  it("merges per-game diagnostics into a batch total", () => {
    const total = createLightgbmDecisionDiagnostics();
    const gameOne = createLightgbmDecisionDiagnostics();
    const gameTwo = createLightgbmDecisionDiagnostics();

    recordLightgbmDecisionDiagnostics(gameOne, {
      requestedProvider: "lightgbm_model",
      providerUsed: "server_heuristic",
      providerMetadata: {
        lightgbm_small_branch_delegated: true,
        lightgbm_small_branch_legal_action_count: 4
      }
    });
    recordLightgbmDecisionDiagnostics(gameOne, {
      requestedProvider: "lightgbm_model",
      providerUsed: "lightgbm_model"
    });

    recordLightgbmDecisionDiagnostics(gameTwo, {
      requestedProvider: "lightgbm_model",
      providerUsed: "server_heuristic",
      providerMetadata: {
        lightgbm_phase_delegated: true
      }
    });
    recordLightgbmDecisionDiagnostics(gameTwo, {
      requestedProvider: "lightgbm_model",
      providerUsed: "local_heuristic"
    });

    mergeLightgbmDecisionDiagnostics(total, gameOne);
    mergeLightgbmDecisionDiagnostics(total, gameTwo);

    expect(total).toEqual({
      requestedDecisions: 4,
      completedByLightgbm: 1,
      delegatedToServerHeuristic: 2,
      localFallbackDecisions: 1,
      delegatedByReason: {
        small_branch_delegated: 1,
        phase_delegated: 1
      },
      rerankSkippedByReason: {},
      smallBranchLegalActionCount: {
        "4": 1
      }
    });
  });
});
