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

export async function routeLightgbmDecision(
  payload: DecisionRequestPayload,
  scorer: LightgbmScorer
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
    const scored = await scorer.score({
      stateRaw,
      actorSeat: canonicalActor,
      phase: payload.phase,
      legalActions: actorLegalActions,
      stateFeatures,
      candidateFeatures
    });

    if (scored.scores.length !== actorLegalActions.length) {
      throw new Error(
        `LightGBM returned ${scored.scores.length} scores for ${actorLegalActions.length} legal actions.`
      );
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
    const providerReason = "Resolved by the LightGBM action model on the backend.";

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
          model_metadata: scored.modelMetadata,
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
          provider_used: "lightgbm_model",
          fallback_used: false
        } as JsonObject
      }),
      responseMetadata: {
        scores: ranked.map((entry) => ({
          action_key: entry.actionKey,
          score: entry.score,
          action: entry.concreteAction
        })),
        model_metadata: scored.modelMetadata,
        state_features: stateFeatures,
        candidate_features: ranked.map((entry) => ({
          action_key: entry.actionKey,
          action: entry.concreteAction,
          features: entry.features
        })),
        chosen_action: concreteAction,
        requested_provider: "lightgbm_model"
      } as JsonObject
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = routeHeuristicDecision(payload, {
      providerReason: `LightGBM inference failed; fell back to the backend heuristic: ${message}`,
      metadata: {
        requested_provider: "lightgbm_model",
        lightgbm_error: message,
        fallback_used: true
      }
    });

    return {
      ...fallback,
      responseMetadata: {
        requested_provider: "lightgbm_model",
        fallback_provider: "server_heuristic",
        lightgbm_error: message
      }
    };
  }
}
