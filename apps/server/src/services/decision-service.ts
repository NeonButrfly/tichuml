import type {
  DecisionRequestPayload,
  DecisionResponsePayload,
  JsonObject,
  TelemetryDecisionPayload
} from "@tichuml/shared";
import type { TelemetryRepository } from "./telemetry-repository.js";
import { routeHeuristicDecision } from "../providers/heuristic-provider.js";
import { routeLightgbmDecision } from "../providers/lightgbm-provider.js";
import type { LightgbmScorer } from "../ml/lightgbm-scorer.js";
import type { LightgbmRolloutReranker } from "../providers/lightgbm-provider.js";
import type { TelemetryEnqueueResult } from "./telemetry-ingest-queue.js";

const HEAVY_SIMULATION_RESPONSE_METADATA_KEYS = [
  "explanation",
  "chosen_action",
  "scores",
  "state_features",
  "candidate_features",
  "model_metadata",
  "runtime_metadata",
  "lightgbm_rollout_rerank_results",
] as const;

function logDecisionTrace(
  enabled: boolean,
  event: string,
  payload: Record<string, unknown>
): void {
  if (!enabled) {
    return;
  }
  console.info(JSON.stringify({ ts: new Date().toISOString(), event, ...payload }));
}

function shouldSlimSimulationResponseMetadata(payload: DecisionRequestPayload): boolean {
  if (payload.metadata.simulation_mode !== true) {
    return false;
  }
  return payload.metadata.response_detail !== "full";
}

function slimSimulationResponseMetadata(
  responseMetadata: JsonObject | undefined
): JsonObject | undefined {
  if (!responseMetadata) {
    return responseMetadata;
  }
  const slimmed = { ...responseMetadata };
  for (const key of HEAVY_SIMULATION_RESPONSE_METADATA_KEYS) {
    delete slimmed[key];
  }
  slimmed.simulation_response_detail = "slim";
  return slimmed;
}

export async function handleDecisionRequest(
  repository: TelemetryRepository,
  payload: DecisionRequestPayload,
  dependencies: {
    lightgbmScorer?: LightgbmScorer;
    traceDecisionRequests?: boolean;
    lightgbmConfidenceMargin?: number | null;
    lightgbmMinLegalActionsForScoring?: number | null;
    lightgbmConfidenceDelegationMaxPreDelegationMs?: number | null;
    lightgbmRolloutReranker?: LightgbmRolloutReranker;
    lightgbmRolloutRerankTopK?: number | null;
    lightgbmRolloutRerankSamples?: number | null;
    lightgbmRolloutRerankMaxScoreMargin?: number | null;
    lightgbmRolloutRerankMaxContinuationDecisions?: number | null;
    lightgbmRolloutRerankMaxActorHandSize?: number | null;
    parseMs?: number;
    validateMs?: number;
    payloadBytes?: number;
    enqueueDecisionTelemetry?: (
      telemetryPayload: TelemetryDecisionPayload
    ) => TelemetryEnqueueResult;
  } = {}
): Promise<DecisionResponsePayload> {
  const startedAt = Date.now();
  logDecisionTrace(dependencies.traceDecisionRequests === true, "decision_request_received", {
    game_id: payload.game_id,
    hand_id: payload.hand_id,
    phase: payload.phase,
    actor_seat: payload.actor_seat,
    requested_provider: payload.requested_provider
  });
  const routed =
    payload.requested_provider === "lightgbm_model"
      ? await routeLightgbmDecision(
          payload,
          dependencies.lightgbmScorer ??
            ({
              score: async () => {
                throw new Error(
                  "LightGBM provider is not available. Bootstrap the ML environment and train a model first."
                );
              },
              close: async () => {}
            } satisfies LightgbmScorer),
          {
            ...(dependencies.traceDecisionRequests !== undefined
              ? { traceDecisionRequests: dependencies.traceDecisionRequests }
              : {}),
            ...(dependencies.lightgbmConfidenceMargin !== undefined
              ? { confidenceMargin: dependencies.lightgbmConfidenceMargin }
              : {}),
            ...(dependencies.lightgbmMinLegalActionsForScoring !== undefined
              ? {
                  minLegalActionsForScoring:
                    dependencies.lightgbmMinLegalActionsForScoring,
                }
              : {}),
            ...(dependencies.lightgbmConfidenceDelegationMaxPreDelegationMs !==
            undefined
              ? {
                  confidenceDelegationMaxPreDelegationMs:
                    dependencies.lightgbmConfidenceDelegationMaxPreDelegationMs,
                }
              : {}),
            ...(dependencies.lightgbmRolloutReranker !== undefined
              ? { rolloutReranker: dependencies.lightgbmRolloutReranker }
              : {}),
            ...(dependencies.lightgbmRolloutRerankTopK !== undefined
              ? { rolloutRerankTopK: dependencies.lightgbmRolloutRerankTopK }
              : {}),
            ...(dependencies.lightgbmRolloutRerankSamples !== undefined
              ? {
                  rolloutRerankSamples:
                    dependencies.lightgbmRolloutRerankSamples,
                }
              : {}),
            ...(dependencies.lightgbmRolloutRerankMaxScoreMargin !== undefined
              ? {
                  rolloutRerankMaxScoreMargin:
                    dependencies.lightgbmRolloutRerankMaxScoreMargin,
                }
              : {}),
            ...(dependencies.lightgbmRolloutRerankMaxContinuationDecisions !==
            undefined
              ? {
                  rolloutRerankMaxContinuationDecisions:
                    dependencies.lightgbmRolloutRerankMaxContinuationDecisions,
                }
              : {}),
            ...(dependencies.lightgbmRolloutRerankMaxActorHandSize !== undefined
              ? {
                  rolloutRerankMaxActorHandSize:
                    dependencies.lightgbmRolloutRerankMaxActorHandSize,
                }
              : {})
          }
        )
      : routeHeuristicDecision(payload, {
          ...(dependencies.traceDecisionRequests !== undefined
            ? { traceDecisionRequests: dependencies.traceDecisionRequests }
            : {})
        });
  const latencyMs = Date.now() - startedAt;
  let telemetryId: number | undefined;
  let telemetryQueueResult: TelemetryEnqueueResult | undefined;
  if (routed.telemetryPayload) {
    routed.telemetryPayload.metadata = {
      ...routed.telemetryPayload.metadata,
      latency_ms: latencyMs
    };
    const queueEligible = payload.metadata.simulation_mode === true;
    if (queueEligible && dependencies.enqueueDecisionTelemetry) {
      telemetryQueueResult = dependencies.enqueueDecisionTelemetry(
        routed.telemetryPayload
      );
    } else {
      telemetryId = await repository.insertDecision(routed.telemetryPayload);
    }
  }
  const existingTiming =
    typeof routed.responseMetadata?.timing === "object" &&
    routed.responseMetadata.timing !== null
      ? (routed.responseMetadata.timing as JsonObject)
      : undefined;
  const providerWorkMs =
    (typeof existingTiming?.normalize_ms === "number"
      ? existingTiming.normalize_ms
      : 0) +
    (typeof existingTiming?.evaluate_ms === "number"
      ? existingTiming.evaluate_ms
      : 0);
  const timingMetadata = {
    parse_ms: dependencies.parseMs ?? 0,
    validate_ms: dependencies.validateMs ?? 0,
    response_ms: Math.max(
      0,
      latencyMs - (dependencies.parseMs ?? 0) - (dependencies.validateMs ?? 0) - providerWorkMs
    ),
    total_latency_ms: latencyMs,
    payload_bytes: dependencies.payloadBytes ?? 0
  } as JsonObject;
  const responseMetadata = shouldSlimSimulationResponseMetadata(payload)
    ? slimSimulationResponseMetadata(routed.responseMetadata)
    : routed.responseMetadata;
  logDecisionTrace(dependencies.traceDecisionRequests === true, "decision_request_resolved", {
    game_id: payload.game_id,
    hand_id: payload.hand_id,
    phase: payload.phase,
    actor_seat: payload.actor_seat,
    requested_provider: payload.requested_provider,
    provider_used: routed.providerUsed,
    chosen_action_type: routed.chosen.action.type,
    chosen_action_actor:
      "seat" in routed.chosen.action
        ? routed.chosen.action.seat
        : "actor" in routed.chosen.action
          ? routed.chosen.action.actor
          : routed.chosen.actor,
    telemetry_id: telemetryId,
    telemetry_queued: telemetryQueueResult?.queued ?? false,
    telemetry_queue_depth: telemetryQueueResult?.queue_depth ?? null,
    telemetry_dropped: telemetryQueueResult?.dropped ?? false,
    latency_ms: latencyMs,
    canonical_actor_seat: routed.responseMetadata?.canonical_actor_seat,
    legal_action_count: routed.responseMetadata?.legal_action_count,
    scoring_path: routed.responseMetadata?.scoring_path
  });

  return {
    accepted: true,
    chosen_action: routed.chosen.action as unknown as JsonObject,
    provider_used: routed.providerUsed,
    provider_reason: routed.providerReason,
    metadata: {
      ...(responseMetadata ?? {}),
      response_phase: payload.phase,
      response_actor_seat: payload.actor_seat,
      chosen_action_type: routed.chosen.action.type,
      latency_ms: latencyMs,
      ...(telemetryQueueResult
        ? {
            telemetry_queued: telemetryQueueResult.queued,
            telemetry_queue_depth: telemetryQueueResult.queue_depth,
            telemetry_dropped: telemetryQueueResult.dropped,
            ...(telemetryQueueResult.drop_reason
              ? { telemetry_drop_reason: telemetryQueueResult.drop_reason }
              : {})
          }
        : {}),
      timing: {
        ...((existingTiming ?? {}) as JsonObject),
        ...timingMetadata
      },
      ...(telemetryId !== undefined ? { telemetry_id: telemetryId } : {})
    },
    ...(telemetryId !== undefined ? { telemetry_id: telemetryId } : {})
  };
}
