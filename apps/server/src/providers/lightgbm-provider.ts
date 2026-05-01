import { createHeuristicFeatureAnalyzer } from "@tichuml/ai-heuristics";
import type { GameState, LegalAction } from "@tichuml/engine";
import type { DecisionRequestPayload, JsonObject } from "@tichuml/shared";
import type { LightgbmScorer } from "../ml/lightgbm-scorer.js";
import {
  buildChosenDecision,
  createTelemetryPayload,
  extractActorLegalActions,
  isUsableState,
  toActionSortKey,
  toConcreteActionForLegalAction,
  validateDecisionRequestActorContract,
  type RoutedDecision
} from "./provider-utils.js";
import { routeHeuristicDecision } from "./heuristic-provider.js";

function toLegalActionKey(
  stateRaw: GameState,
  action: LegalAction
): string {
  return toActionSortKey(toConcreteActionForLegalAction(stateRaw, action));
}

function summarizeScoreDistribution(scores: number[]): JsonObject {
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const variance =
    scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    scores.length;
  return {
    count: scores.length,
    min,
    max,
    mean,
    stddev: Math.sqrt(variance)
  };
}

export async function routeLightgbmDecision(
  payload: DecisionRequestPayload,
  scorer: LightgbmScorer,
  options: { traceDecisionRequests?: boolean } = {}
): Promise<RoutedDecision> {
  const stateRaw = payload.state_raw;
  if (!isUsableState(stateRaw)) {
    throw new Error(
      "Decision requests for the LightGBM provider require a full state_raw payload."
    );
  }

  const canonicalActor = validateDecisionRequestActorContract(payload);
  const actorLegalActions = extractActorLegalActions(payload);
  if (actorLegalActions.length === 0) {
    throw new Error(
      `LightGBM provider received no legal actions for actor ${payload.actor_seat}.`
    );
  }

  try {
    const analyzer = createHeuristicFeatureAnalyzer({
      state: stateRaw,
      legalActions: payload.legal_actions as never
    });
    const actorSeat = canonicalActor;
    const stateFeatures = analyzer.getStateFeatures(actorSeat);
    const candidateFeatures = actorLegalActions.map((legalAction) =>
      analyzer.getCandidateFeatures(
        actorSeat,
        toConcreteActionForLegalAction(stateRaw, legalAction),
        legalAction
      )
    );
    const scoringStartedAt = Date.now();
    const scored = await scorer.score({
      stateRaw,
      actorSeat: canonicalActor,
      phase: payload.phase,
      legalActions: actorLegalActions,
      stateFeatures,
      candidateFeatures
    });
    const scoringLatencyMs = Date.now() - scoringStartedAt;

    if (scored.scores.length !== actorLegalActions.length) {
      throw new Error(
        `LightGBM returned ${scored.scores.length} scores for ${actorLegalActions.length} legal actions.`
      );
    }
    if (scored.scores.some((score) => !Number.isFinite(score))) {
      throw new Error("LightGBM returned non-finite candidate scores.");
    }

    const ranked = actorLegalActions.map((legalAction, index) => ({
      legalAction,
      score: scored.scores[index] ?? 0,
      concreteAction: toConcreteActionForLegalAction(stateRaw, legalAction),
      actionKey: toLegalActionKey(stateRaw, legalAction),
      features: candidateFeatures[index] ?? null
    }));

    ranked.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.actionKey.localeCompare(right.actionKey);
    });

    const selected = ranked[0];
    if (!selected) {
      throw new Error("LightGBM provider did not produce a ranked legal action.");
    }

    const concreteAction = selected.concreteAction;
    const topKCandidateScores = ranked.slice(0, 3).map((entry) => ({
      action_key: entry.actionKey,
      score: entry.score,
      action: entry.concreteAction
    }));
    const scoreDistribution = summarizeScoreDistribution(scored.scores);
    const modelMetadata = scored.modelMetadata;
    const runtimeMetadata = {
      ...scored.runtimeMetadata,
      scoring_latency_ms: scoringLatencyMs
    } as JsonObject;
    const providerReason = "Resolved by the LightGBM action model on the backend.";
    const explanation = {
      policy: "lightgbm-action-model",
      actor: canonicalActor,
      stateFeatures,
      candidateScores: ranked.map((entry) => ({
        action: entry.concreteAction,
        score: entry.score,
        features: entry.features,
        reasons: ["LightGBM model score"],
        tags: []
      })),
      selectedReasonSummary: [
        "ranked legal actions with the shared LightGBM feature builder",
        "selected the highest-scoring deterministic candidate"
      ],
      selectedTags: ["TEMPO_WIN"]
    };

    return {
      providerUsed: "lightgbm_model",
      providerReason,
      chosen: buildChosenDecision(
        canonicalActor,
        concreteAction,
        "lightgbm-action-model",
        [
          "ranked legal actions with the shared LightGBM feature builder",
          "selected the highest-scoring deterministic candidate"
        ],
        ["TEMPO_WIN"]
      ),
      telemetryPayload: createTelemetryPayload({
        payload,
        providerUsed: "lightgbm_model",
        providerReason,
        policyName: "lightgbm-action-model",
        chosenAction: concreteAction,
        metadata: {
          requested_provider: payload.requested_provider,
          model_metadata: modelMetadata,
          runtime_metadata: runtimeMetadata,
          explanation,
          state_features: stateFeatures,
          candidate_features: ranked.map((entry) => ({
            action_key: entry.actionKey,
            action: entry.concreteAction,
            features: entry.features
          })),
          scores: ranked.map((entry) => ({
            action_key: entry.actionKey,
            score: entry.score
          })),
          model_id:
            typeof modelMetadata.model_id === "string"
              ? modelMetadata.model_id
              : null,
          model_version:
            typeof modelMetadata.model_version === "string"
              ? modelMetadata.model_version
              : null,
          objective:
            typeof modelMetadata.objective === "string"
              ? modelMetadata.objective
              : null,
          label_mode:
            typeof modelMetadata.label_mode === "string"
              ? modelMetadata.label_mode
              : null,
          target_column:
            typeof modelMetadata.target_column === "string"
              ? modelMetadata.target_column
              : null,
          feature_schema_version:
            typeof modelMetadata.feature_schema_version === "number"
              ? modelMetadata.feature_schema_version
              : null,
          selected_candidate_score: selected.score,
          candidate_score_distribution: scoreDistribution,
          top_k_candidate_scores: topKCandidateScores,
          provider_used: "lightgbm_model",
          fallback_used: false,
          canonical_actor_seat: canonicalActor,
          legal_action_count: actorLegalActions.length,
          runtime_feature_count:
            typeof runtimeMetadata.runtime_feature_count === "number"
              ? runtimeMetadata.runtime_feature_count
              : null,
          missing_feature_count:
            typeof runtimeMetadata.missing_feature_count === "number"
              ? runtimeMetadata.missing_feature_count
              : null,
          model_feature_count:
            typeof runtimeMetadata.model_feature_count === "number"
              ? runtimeMetadata.model_feature_count
              : null,
          request_validated: true,
          provider_path: "lightgbm_model"
        } as JsonObject
      }),
      responseMetadata: {
        scores: ranked.map((entry) => ({
          action_key: entry.actionKey,
          score: entry.score,
          action: entry.concreteAction
        })),
        model_metadata: modelMetadata,
        runtime_metadata: runtimeMetadata,
        state_features: stateFeatures,
        candidate_features: ranked.map((entry) => ({
          action_key: entry.actionKey,
          action: entry.concreteAction,
          features: entry.features
        })),
        chosen_action: concreteAction,
        selected_candidate_score: selected.score,
        candidate_score_distribution: scoreDistribution,
        top_k_candidate_scores: topKCandidateScores,
        model_id:
          typeof modelMetadata.model_id === "string"
            ? modelMetadata.model_id
            : null,
        model_version:
          typeof modelMetadata.model_version === "string"
            ? modelMetadata.model_version
            : null,
        objective:
          typeof modelMetadata.objective === "string"
            ? modelMetadata.objective
            : null,
        label_mode:
          typeof modelMetadata.label_mode === "string"
            ? modelMetadata.label_mode
            : null,
        target_column:
          typeof modelMetadata.target_column === "string"
            ? modelMetadata.target_column
            : null,
        feature_schema_version:
          typeof modelMetadata.feature_schema_version === "number"
            ? modelMetadata.feature_schema_version
            : null,
        requested_provider: "lightgbm_model",
        canonical_actor_seat: canonicalActor,
        legal_action_count: actorLegalActions.length,
        runtime_feature_count:
          typeof runtimeMetadata.runtime_feature_count === "number"
            ? runtimeMetadata.runtime_feature_count
            : null,
        missing_feature_count:
          typeof runtimeMetadata.missing_feature_count === "number"
            ? runtimeMetadata.missing_feature_count
            : null,
        model_feature_count:
          typeof runtimeMetadata.model_feature_count === "number"
            ? runtimeMetadata.model_feature_count
            : null,
        request_validated: true,
        provider_path: "lightgbm_model"
      } as JsonObject
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = routeHeuristicDecision(payload, {
      providerReason: `LightGBM inference failed; fell back to the backend heuristic: ${message}`,
      metadata: {
        requested_provider: "lightgbm_model",
        lightgbm_error: message,
        fallback_used: true,
        provider_path: "lightgbm_model"
      },
      ...(options.traceDecisionRequests !== undefined
        ? { traceDecisionRequests: options.traceDecisionRequests }
        : {})
    });

    return {
      ...fallback,
      responseMetadata: {
        requested_provider: "lightgbm_model",
        fallback_provider: "server_heuristic",
        fallback_used: true,
        lightgbm_error: message,
        provider_path: "lightgbm_model"
      }
    };
  }
}
