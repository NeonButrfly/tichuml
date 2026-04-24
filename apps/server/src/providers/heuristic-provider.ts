import {
  chooseServerFastPathDecision,
  heuristicsV1Policy,
  type ServerFastPathState
} from "@tichuml/ai-heuristics";
import {
  getDecisionScoringPath,
  type DecisionRequestPayload,
  type JsonObject
} from "@tichuml/shared";
import type { LegalAction, SeatId } from "@tichuml/engine";
import {
  createTelemetryPayload,
  extractActorLegalActions,
  formatActorMismatchDiagnostics,
  isUsableLegalActionMap,
  isUsableState,
  validateDecisionRequestActorContract,
  type RoutedDecision
} from "./provider-utils.js";

function createFastPathExplanation(config: {
  actor: SeatId;
  candidates: ReturnType<typeof chooseServerFastPathDecision>["candidates"];
}) {
  return {
    policy: "server-fast-path",
    actor: config.actor,
    candidateScores: [],
    selectedReasonSummary: config.candidates[0]?.reasons ?? [],
    selectedTags: []
  };
}

function getLegalActionCount(payload: DecisionRequestPayload): number {
  const actorActions = extractActorLegalActions(payload);
  return actorActions.length;
}

export function routeHeuristicDecision(
  payload: DecisionRequestPayload,
  options: {
    providerReason?: string;
    metadata?: Record<string, unknown>;
    traceDecisionRequests?: boolean;
  } = {}
): RoutedDecision {
  const startedAt = Date.now();
  const scoringPath = getDecisionScoringPath(payload);
  const validationStartedAt = Date.now();
  const canonicalActor = validateDecisionRequestActorContract(payload);
  const validateMs = Date.now() - validationStartedAt;
  const legalActionCount = getLegalActionCount(payload);
  if (options.traceDecisionRequests) {
    console.info(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "decision_request_validated",
        game_id: payload.game_id,
        hand_id: payload.hand_id,
        phase: payload.phase,
        actor_seat: payload.actor_seat,
        requested_provider: payload.requested_provider,
        canonical_actor_seat: canonicalActor,
        legal_action_count: legalActionCount,
        provider_path: "server_heuristic",
        scoring_path: scoringPath
      })
    );
  }

  if (scoringPath === "fast_path") {
    const normalizeStartedAt = Date.now();
    if (!Array.isArray(payload.legal_actions)) {
      throw new Error("Fast-path decision requests require an actor-scoped legal action list.");
    }
    if (
      typeof payload.state_norm !== "object" ||
      payload.state_norm === null ||
      Array.isArray(payload.state_norm)
    ) {
      throw new Error("Fast-path decision requests require a compact state_norm payload.");
    }
    const fastState = payload.state_norm as unknown as ServerFastPathState;
    const normalizeMs = Date.now() - normalizeStartedAt;
    const evaluateStartedAt = Date.now();
    const fastDecision = chooseServerFastPathDecision({
      state: fastState,
      actor: payload.actor_seat as SeatId,
      legalActions: payload.legal_actions as unknown as LegalAction[]
    });
    const evaluateMs = Date.now() - evaluateStartedAt;
    if (fastDecision.actor !== payload.actor_seat) {
      throw new Error(
        formatActorMismatchDiagnostics({
          payload,
          canonicalActorSeat: canonicalActor,
          derivedActorSeat: fastDecision.actor,
          legalActionIssues: [
            `Server fast path selected actor ${fastDecision.actor} for request actor ${payload.actor_seat}.`
          ]
        })
      );
    }
    const explanation = createFastPathExplanation({
      actor: fastDecision.actor,
      candidates: fastDecision.candidates
    });
    const providerReason =
      options.providerReason ??
      "Resolved through the bounded fast-path server heuristic.";
    return {
      providerUsed: "server_heuristic",
      providerReason,
      chosen: {
        actor: fastDecision.actor,
        action: fastDecision.action,
        explanation
      },
      telemetryPayload: null,
      responseMetadata: {
        explanation,
        chosen_action: fastDecision.action,
        requested_provider: payload.requested_provider,
        canonical_actor_seat: canonicalActor,
        legal_action_count: legalActionCount,
        request_validated: true,
        provider_path: "server_heuristic",
        scoring_path: scoringPath,
        timing: {
          validate_ms: validateMs,
          normalize_ms: normalizeMs,
          evaluate_ms: evaluateMs,
          response_ms: 0,
          total_latency_ms: Date.now() - startedAt,
          candidate_count: fastDecision.candidateCount,
          scoring_path: scoringPath
        }
      } as JsonObject
    };
  }

  if (!isUsableState(payload.state_raw) || !isUsableLegalActionMap(payload.legal_actions)) {
    throw new Error(
      "Rich-path decision requests for the server heuristic require full state_raw and legal_actions."
    );
  }

  const providerReason =
    options.providerReason ??
    "Resolved through the shared heuristics-v1 policy on the backend.";
  const evaluateStartedAt = Date.now();
  const chosen = heuristicsV1Policy.chooseAction({
    state: payload.state_raw,
    legalActions: payload.legal_actions
  });
  const evaluateMs = Date.now() - evaluateStartedAt;

  if (chosen.actor !== payload.actor_seat) {
    throw new Error(
      formatActorMismatchDiagnostics({
        payload,
        canonicalActorSeat: canonicalActor,
        derivedActorSeat: chosen.actor,
        legalActionIssues: [
          `Server heuristic selected actor ${chosen.actor} for request actor ${payload.actor_seat}.`
        ]
      })
    );
  }

  return {
    providerUsed: "server_heuristic",
    providerReason,
    chosen,
    telemetryPayload: createTelemetryPayload({
      payload,
      providerUsed: "server_heuristic",
      providerReason,
      policyName: heuristicsV1Policy.name,
      chosenAction: chosen.action,
      antipatternTags:
        chosen.explanation.selectedTags.length > 0
          ? chosen.explanation.selectedTags
          : [],
      metadata: {
        requested_provider: payload.requested_provider,
        provider_used: "server_heuristic",
        fallback_used: options.providerReason !== undefined,
        canonical_actor_seat: canonicalActor,
        legal_action_count: legalActionCount,
        request_validated: true,
        provider_path: "server_heuristic",
        scoring_path: scoringPath,
        explanation: chosen.explanation,
        timing: {
          validate_ms: validateMs,
          normalize_ms: 0,
          evaluate_ms: evaluateMs,
          response_ms: 0,
          total_latency_ms: Date.now() - startedAt,
          candidate_count: chosen.explanation.candidateScores.length,
          scoring_path: scoringPath
        },
        ...(options.metadata ?? {})
      } as JsonObject
    }),
    responseMetadata: {
      explanation: chosen.explanation,
      chosen_action: chosen.action,
      requested_provider: payload.requested_provider,
      canonical_actor_seat: canonicalActor,
      legal_action_count: legalActionCount,
      request_validated: true,
      provider_path: "server_heuristic",
      scoring_path: scoringPath,
      timing: {
        validate_ms: validateMs,
        normalize_ms: 0,
        evaluate_ms: evaluateMs,
        response_ms: 0,
        total_latency_ms: Date.now() - startedAt,
        candidate_count: chosen.explanation.candidateScores.length,
        scoring_path: scoringPath
      }
    } as JsonObject
  };
}
