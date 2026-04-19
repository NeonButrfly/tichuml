import type { LegalAction, SeatId } from "@tichuml/engine";
import type { DecisionRequestPayload, JsonObject } from "@tichuml/shared";
import type { LightgbmScorer } from "../ml/lightgbm-scorer.js";
import {
  buildChosenDecision,
  createTelemetryPayload,
  extractActorLegalActions,
  isUsableState,
  toActionSortKey,
  toConcreteActionForLegalAction,
  type RoutedDecision
} from "./provider-utils.js";
import { routeHeuristicDecision } from "./heuristic-provider.js";

function toLegalActionKey(
  stateRaw: DecisionRequestPayload["state_raw"],
  action: LegalAction
): string {
  return toActionSortKey(
    toConcreteActionForLegalAction(
      stateRaw as unknown as Parameters<typeof toConcreteActionForLegalAction>[0],
      action
    )
  );
}

export async function routeLightgbmDecision(
  payload: DecisionRequestPayload,
  scorer: LightgbmScorer
): Promise<RoutedDecision> {
  if (!isUsableState(payload.state_raw)) {
    throw new Error(
      "Decision requests for the LightGBM provider require a full state_raw payload."
    );
  }

  const actorLegalActions = extractActorLegalActions(payload);
  if (actorLegalActions.length === 0) {
    throw new Error(
      `LightGBM provider received no legal actions for actor ${payload.actor_seat}.`
    );
  }

  try {
    const scored = await scorer.score({
      stateRaw: payload.state_raw,
      actorSeat: payload.actor_seat,
      phase: payload.phase,
      legalActions: actorLegalActions
    });

    if (scored.scores.length !== actorLegalActions.length) {
      throw new Error(
        `LightGBM returned ${scored.scores.length} scores for ${actorLegalActions.length} legal actions.`
      );
    }

    const ranked = actorLegalActions.map((legalAction, index) => ({
      legalAction,
      score: scored.scores[index] ?? 0,
      actionKey: toLegalActionKey(payload.state_raw, legalAction)
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

    const concreteAction = toConcreteActionForLegalAction(
      payload.state_raw,
      selected.legalAction
    );
    const providerReason = "Resolved by the LightGBM action model on the backend.";

    return {
      providerUsed: "lightgbm_model",
      providerReason,
      chosen: buildChosenDecision(
        payload.actor_seat as SeatId,
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
          scores: ranked.map((entry) => ({
            action_key: entry.actionKey,
            score: entry.score
          }))
        } as JsonObject
      }),
      responseMetadata: {
        scores: ranked.map((entry) => ({
          action_key: entry.actionKey,
          score: entry.score
        })),
        model_metadata: scored.modelMetadata
      } as JsonObject
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = routeHeuristicDecision(payload, {
      providerReason: `LightGBM inference failed; fell back to the backend heuristic: ${message}`,
      metadata: {
        requested_provider: "lightgbm_model",
        lightgbm_error: message
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
