import {
  buildServerFastPathState,
  type CandidateActionFeatureSnapshot,
  createHeuristicFeatureAnalyzer,
  generateFastTrickPlayCandidates,
  SERVER_HEURISTIC_FAST_PATH_LIMITS,
  type TacticalFeatureSnapshot
} from "@tichuml/ai-heuristics";
import type { GameState, LegalAction } from "@tichuml/engine";
import type { DecisionRequestPayload, JsonObject } from "@tichuml/shared";
import type {
  LightgbmFeatureRequirements,
  LightgbmScorer
} from "../ml/lightgbm-scorer.js";
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

type CandidatePrefilterResult = {
  legalActions: LegalAction[];
  metadata: JsonObject;
};

type PreparedLightgbmFeatureInputs = {
  stateFeatures: TacticalFeatureSnapshot | null;
  candidateFeatures: Array<CandidateActionFeatureSnapshot | null>;
  metadata: JsonObject;
};

const TACTICAL_LIGHTGBM_FEATURES = new Set([
  "likely_wins_current_trick_flag",
  "hand_quality_score",
  "future_hand_quality_delta",
  "control_retention_estimate",
  "structure_preservation_score",
  "dead_singles_count_before",
  "dead_singles_count_after",
  "dead_singles_reduction",
  "combo_count_before",
  "combo_count_after",
  "finishability_score",
  "endgame_pressure",
  "partner_advantage_estimate",
  "opponent_threat_estimate",
  "resource_cost_score",
  "shed_value_score",
  "control_value_score",
  "bomb_count_in_hand",
  "dragon_in_hand",
  "phoenix_in_hand",
  "dog_in_hand",
  "mahjong_in_hand",
  "control_cards_count",
  "premium_resource_pressure",
  "singles_count",
  "pairs_count",
  "triples_count",
  "straights_count",
  "pair_runs_count",
  "bombs_count",
  "isolated_high_singles_count",
  "isolated_low_singles_count"
]);

const TACTICAL_LIGHTGBM_FEATURE_PREFIXES = ["urgency_mode_"];

function findMatchingLegalAction(
  actorLegalActions: LegalAction[],
  stateRaw: GameState,
  candidateAction: ReturnType<typeof generateFastTrickPlayCandidates>[number]["action"]
): LegalAction | null {
  const targetKey = toActionSortKey(candidateAction);
  return (
    actorLegalActions.find((legalAction) => {
      const concreteAction = toConcreteActionForLegalAction(stateRaw, legalAction);
      return toActionSortKey(concreteAction) === targetKey;
    }) ?? null
  );
}

function prefilterLightgbmLegalActions(
  payload: DecisionRequestPayload,
  stateRaw: GameState,
  actorSeat: string,
  actorLegalActions: LegalAction[]
): CandidatePrefilterResult {
  if (
    payload.phase !== "trick_play" ||
    actorLegalActions.length <=
      SERVER_HEURISTIC_FAST_PATH_LIMITS.trick_play_candidate_cap
  ) {
    return {
      legalActions: actorLegalActions,
      metadata: {
        candidate_prefilter_applied: false
      }
    };
  }

  const fastState = buildServerFastPathState(
    stateRaw,
    actorSeat as GameState["activeSeat"] & string
  );
  const fastCandidates = generateFastTrickPlayCandidates({
    state: fastState,
    actor: actorSeat as GameState["activeSeat"] & string,
    legalActions: actorLegalActions
  });
  const retained = fastCandidates
    .map((candidate) =>
      findMatchingLegalAction(actorLegalActions, stateRaw, candidate.action)
    )
    .filter((candidate): candidate is LegalAction => candidate !== null);
  const callTichuAction = actorLegalActions.find(
    (action): action is Extract<LegalAction, { type: "call_tichu" }> =>
      action.type === "call_tichu"
  );
  if (
    callTichuAction &&
    !retained.some(
      (action) =>
        action.type === "call_tichu" &&
        toLegalActionKey(stateRaw, action) === toLegalActionKey(stateRaw, callTichuAction)
    )
  ) {
    retained.push(callTichuAction);
  }

  if (retained.length === 0 || retained.length >= actorLegalActions.length) {
    return {
      legalActions: actorLegalActions,
      metadata: {
        candidate_prefilter_applied: false
      }
    };
  }

  return {
    legalActions: retained,
    metadata: {
      candidate_prefilter_applied: true,
      candidate_prefilter_policy: "server_fast_trick_play",
      candidate_prefilter_total: actorLegalActions.length,
      candidate_prefilter_retained: retained.length,
      candidate_prefilter_limit:
        SERVER_HEURISTIC_FAST_PATH_LIMITS.trick_play_candidate_cap
    }
  };
}

export function lightgbmRequiresSharedTacticalFeatures(
  featureRequirements: LightgbmFeatureRequirements | null | undefined
): boolean {
  if (!featureRequirements) {
    return true;
  }

  if (featureRequirements.featureProfile === "runtime_raw") {
    return false;
  }

  if (
    featureRequirements.featureProfile &&
    featureRequirements.featureProfile !== "full"
  ) {
    return featureRequirements.featureProfile !== "runtime_raw";
  }

  const featureNames = featureRequirements.featureNames;
  if (!featureNames || featureNames.length === 0) {
    return true;
  }

  return featureNames.some(
    (featureName) =>
      TACTICAL_LIGHTGBM_FEATURES.has(featureName) ||
      TACTICAL_LIGHTGBM_FEATURE_PREFIXES.some((prefix) =>
        featureName.startsWith(prefix)
      )
  );
}

function normalizeLightgbmPhase(phase: string | null | undefined): string | null {
  if (!phase) {
    return null;
  }
  return phase === "play" ? "trick_play" : phase;
}

function lightgbmSupportsPhase(config: {
  phase: string;
  featureRequirements: LightgbmFeatureRequirements | null | undefined;
}): boolean {
  const modelPhase = normalizeLightgbmPhase(config.featureRequirements?.modelPhase);
  if (!modelPhase) {
    return true;
  }
  return normalizeLightgbmPhase(config.phase) === modelPhase;
}

export function buildLightgbmFeatureInputs(config: {
  payload: DecisionRequestPayload;
  stateRaw: GameState;
  actorSeat: string;
  scoringLegalActions: LegalAction[];
  featureRequirements: LightgbmFeatureRequirements | null | undefined;
  analyzerFactory?: typeof createHeuristicFeatureAnalyzer;
}): PreparedLightgbmFeatureInputs {
  const featureProfile = config.featureRequirements?.featureProfile ?? null;
  if (!lightgbmRequiresSharedTacticalFeatures(config.featureRequirements)) {
    return {
      stateFeatures: null,
      candidateFeatures: config.scoringLegalActions.map(() => null),
      metadata: {
        shared_tactical_features_used: false,
        model_feature_profile: featureProfile
      }
    };
  }

  const analyzerFactory = config.analyzerFactory ?? createHeuristicFeatureAnalyzer;
  const analyzerLegalActions = Array.isArray(config.payload.legal_actions)
    ? ({ [config.payload.actor_seat]: config.scoringLegalActions } as Record<
        string,
        LegalAction[]
      >)
    : (config.payload.legal_actions as Record<string, LegalAction[]>);
  const analyzer = analyzerFactory({
    state: config.stateRaw,
    legalActions: analyzerLegalActions as never
  });
  const stateFeatures = analyzer.getStateFeatures(config.actorSeat as never);
  const candidateFeatures = config.scoringLegalActions.map((legalAction) =>
    analyzer.getCandidateFeatures(
      config.actorSeat as never,
      toConcreteActionForLegalAction(config.stateRaw, legalAction),
      legalAction
    )
  );

  return {
    stateFeatures,
    candidateFeatures,
    metadata: {
      shared_tactical_features_used: true,
      model_feature_profile: featureProfile
    }
  };
}

export async function routeLightgbmDecision(
  payload: DecisionRequestPayload,
  scorer: LightgbmScorer,
  options: { traceDecisionRequests?: boolean } = {}
): Promise<RoutedDecision> {
  const startedAt = Date.now();
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
    const featureRequirements = scorer.getFeatureRequirements?.() ?? null;
    if (!lightgbmSupportsPhase({ phase: payload.phase, featureRequirements })) {
      return routeHeuristicDecision(payload, {
        providerReason:
          "LightGBM model is scoped to trick_play; delegated to the backend heuristic for this phase.",
        metadata: {
          requested_provider: "lightgbm_model",
          provider_path: "lightgbm_model",
          fallback_used: false,
          lightgbm_phase_delegated: true,
          lightgbm_model_phase:
            normalizeLightgbmPhase(featureRequirements?.modelPhase) ?? null,
          lightgbm_feature_profile: featureRequirements?.featureProfile ?? null
        },
        ...(options.traceDecisionRequests !== undefined
          ? { traceDecisionRequests: options.traceDecisionRequests }
          : {})
      });
    }

    const prefilter = prefilterLightgbmLegalActions(
      payload,
      stateRaw,
      canonicalActor,
      actorLegalActions
    );
    const scoringLegalActions = prefilter.legalActions;
    const featureBuildStartedAt = Date.now();
    const featureInputs = buildLightgbmFeatureInputs({
      payload,
      stateRaw,
      actorSeat: canonicalActor,
      scoringLegalActions,
      featureRequirements
    });
    const featureBuildMs = Date.now() - featureBuildStartedAt;
    const scoringStartedAt = Date.now();
    const scored = await scorer.score({
      stateRaw,
      actorSeat: canonicalActor,
      phase: payload.phase,
      legalActions: scoringLegalActions,
      stateFeatures: featureInputs.stateFeatures,
      candidateFeatures: featureInputs.candidateFeatures
    });
    const scoringLatencyMs = Date.now() - scoringStartedAt;

    if (scored.scores.length !== scoringLegalActions.length) {
      throw new Error(
        `LightGBM returned ${scored.scores.length} scores for ${scoringLegalActions.length} legal actions.`
      );
    }
    if (scored.scores.some((score) => !Number.isFinite(score))) {
      throw new Error("LightGBM returned non-finite candidate scores.");
    }

    const ranked = scoringLegalActions.map((legalAction, index) => ({
      legalAction,
      score: scored.scores[index] ?? 0,
      concreteAction: toConcreteActionForLegalAction(stateRaw, legalAction),
      actionKey: toLegalActionKey(stateRaw, legalAction),
      features: featureInputs.candidateFeatures[index] ?? null
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
      scoring_latency_ms: scoringLatencyMs,
      feature_build_ms: featureBuildMs,
      ...featureInputs.metadata
    } as JsonObject;
    const providerReason = "Resolved by the LightGBM action model on the backend.";
    const explanation = {
      policy: "lightgbm-action-model",
      actor: canonicalActor,
      stateFeatures: featureInputs.stateFeatures,
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
          state_features: featureInputs.stateFeatures,
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
          legal_action_count: scoringLegalActions.length,
          ...featureInputs.metadata,
          ...prefilter.metadata,
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
        provider_path: "lightgbm_model",
        timing: {
          feature_build_ms: featureBuildMs,
          evaluate_ms: scoringLatencyMs,
          total_latency_ms: Date.now() - startedAt,
          scoring_path: "rich_path"
        }
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
        state_features: featureInputs.stateFeatures,
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
        legal_action_count: scoringLegalActions.length,
        ...featureInputs.metadata,
        ...prefilter.metadata,
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
        provider_path: "lightgbm_model",
        timing: {
          feature_build_ms: featureBuildMs,
          evaluate_ms: scoringLatencyMs,
          total_latency_ms: Date.now() - startedAt,
          scoring_path: "rich_path"
        }
      } as JsonObject
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallbackStartedAt = Date.now();
    const fallbackPayload = buildLightgbmFallbackPayload(
      payload,
      stateRaw,
      canonicalActor,
      actorLegalActions
    );
    const fallback = routeHeuristicDecision(fallbackPayload, {
      providerReason: `LightGBM inference failed; fell back to the backend heuristic: ${message}`,
      metadata: {
        requested_provider: "lightgbm_model",
        lightgbm_error: message,
        fallback_used: true,
        provider_path: "lightgbm_model",
        lightgbm_requested_scoring_path:
          typeof payload.metadata.scoring_path === "string"
            ? payload.metadata.scoring_path
            : "fast_path",
        lightgbm_fallback_scoring_path:
          typeof fallbackPayload.metadata.scoring_path === "string"
            ? fallbackPayload.metadata.scoring_path
            : "fast_path",
        lightgbm_attempt_ms: Date.now() - startedAt
      },
      ...(options.traceDecisionRequests !== undefined
        ? { traceDecisionRequests: options.traceDecisionRequests }
        : {})
    });

    return {
      ...fallback,
      responseMetadata: {
        ...(fallback.responseMetadata ?? {}),
        requested_provider: "lightgbm_model",
        fallback_provider: "server_heuristic",
        fallback_used: true,
        lightgbm_error: message,
        provider_path: "lightgbm_model",
        lightgbm_requested_scoring_path:
          typeof payload.metadata.scoring_path === "string"
            ? payload.metadata.scoring_path
            : "fast_path",
        lightgbm_fallback_scoring_path:
          typeof fallbackPayload.metadata.scoring_path === "string"
            ? fallbackPayload.metadata.scoring_path
            : "fast_path",
        timing: {
          ...(typeof fallback.responseMetadata?.timing === "object" &&
          fallback.responseMetadata.timing !== null
            ? (fallback.responseMetadata.timing as JsonObject)
            : {}),
          lightgbm_attempt_ms: Date.now() - startedAt,
          fallback_heuristic_ms: Date.now() - fallbackStartedAt,
          total_latency_ms: Date.now() - startedAt
        }
      }
    };
  }
}

function buildLightgbmFallbackPayload(
  payload: DecisionRequestPayload,
  stateRaw: GameState,
  actorSeat: string,
  actorLegalActions: LegalAction[]
): DecisionRequestPayload {
  if (payload.phase === "grand_tichu_window") {
    return payload;
  }

  return {
    ...payload,
    state_norm: buildServerFastPathState(
      stateRaw,
      actorSeat as GameState["activeSeat"] & string
    ) as unknown as JsonObject,
    legal_actions: actorLegalActions as unknown as JsonObject,
    metadata: {
      ...payload.metadata,
      scoring_path: "fast_path"
    }
  };
}
