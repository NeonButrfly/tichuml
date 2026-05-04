import {
  heuristicsV1Policy,
  type ChosenDecision,
  type HeadlessDecisionContext,
  type PolicyExplanation
} from "@tichuml/ai-heuristics";
import {
  resolveContinuationActor,
  SYSTEM_ACTOR,
  type ActorId,
  type EngineAction
} from "@tichuml/engine";
import {
  type BackendRuntimeSettings,
  type DecisionProviderUsed,
  type DecisionRequestPayload,
  type JsonObject,
  type RequestedDecisionProvider
} from "@tichuml/shared";
import {
  isBackendRequestError,
  postDecisionRequest
} from "./client";

function assertBrowserDecisionProviderRuntime(): void {
  if (typeof window === "undefined" || import.meta.env.TEST) {
    return;
  }

  console.assert(
    typeof process === "undefined",
    "[decision-provider] browser runtime unexpectedly exposed Node process"
  );
}

export type DecisionResolution = {
  chosen: ChosenDecision;
  requestedProvider: RequestedDecisionProvider | "local";
  providerUsed: DecisionProviderUsed;
  providerReason: string;
  responseMetadata: JsonObject | null;
  telemetryId: number | null;
  latencyMs: number;
  endpointReachable: boolean | null;
  endpointStatus: "ok" | "validation_error" | "client_validation_error" | "network_error" | "server_error";
  endpointError: string | null;
  validationErrors: Array<{ path: string; message: string }> | null;
  handledByServerTelemetry: boolean;
  usedFallback: boolean;
};

function createSyntheticDecision(
  actor: ActorId,
  action: EngineAction,
  providerReason: string,
  providerUsed: DecisionProviderUsed,
  explanation?: PolicyExplanation | null
): ChosenDecision {
  return {
    actor,
    action,
    explanation:
      explanation ?? {
        policy:
          providerUsed === "lightgbm_model"
            ? "lightgbm-model"
            : providerUsed === "server_heuristic"
              ? "server-heuristic"
              : "local-heuristic",
        actor,
        candidateScores: [],
        selectedReasonSummary: [providerReason],
        selectedTags: []
      }
  };
}

function readPolicyExplanation(
  metadata: JsonObject | undefined
): PolicyExplanation | null {
  const explanation = metadata?.explanation;
  if (
    typeof explanation !== "object" ||
    explanation === null ||
    !("policy" in explanation) ||
    !("candidateScores" in explanation)
  ) {
    return null;
  }

  return explanation as unknown as PolicyExplanation;
}

export async function resolveDecisionWithProvider(config: {
  context: HeadlessDecisionContext;
  actor: ActorId;
  settings: BackendRuntimeSettings;
  requestPayload: DecisionRequestPayload;
  fetchImpl?: typeof fetch;
}): Promise<DecisionResolution> {
  assertBrowserDecisionProviderRuntime();
  const { context, actor, settings, requestPayload, fetchImpl } = config;

  if (actor === SYSTEM_ACTOR || settings.decisionMode === "local") {
    const startedAt = performance.now();
    const chosen = heuristicsV1Policy.chooseAction(context);
    return {
      chosen,
      requestedProvider: "local",
      providerUsed: "local_heuristic",
      providerReason: "Resolved through the local heuristics-v1 provider.",
      responseMetadata: null,
      telemetryId: null,
      latencyMs: performance.now() - startedAt,
      endpointReachable: null,
      endpointStatus: "ok",
      endpointError: null,
      validationErrors: null,
      handledByServerTelemetry: false,
      usedFallback: false
    };
  }

  if (context.state.phase === "trick_play" && context.state.activeSeat === null) {
    const recovery = resolveContinuationActor({
      state: context.state,
      legalActions: context.legalActions
    });
    if (
      !recovery.ok ||
      recovery.actor === SYSTEM_ACTOR ||
      recovery.actor !== actor
    ) {
      const startedAt = performance.now();
      const endpointError =
        "trick_play requests must not be sent with activeSeat=null.";
      console.error(
        "[decision-provider] refusing backend request for trick_play with activeSeat=null",
        {
          actor,
          pendingDragonGiftWinner: context.state.pendingDragonGift?.winner ?? null,
          legalActionCount: (context.legalActions[actor] ?? []).length
        }
      );
      const chosen = heuristicsV1Policy.chooseAction(context);
      return {
        chosen,
        requestedProvider: requestPayload.requested_provider,
        providerUsed: "local_heuristic",
        providerReason:
          "Resolved locally because the browser observed an invalid trick_play state with activeSeat=null and skipped the backend request to prevent a retry loop.",
        responseMetadata: {
          requested_provider: requestPayload.requested_provider,
          malformed_state: "trick_play activeSeat=null"
        },
        telemetryId: null,
        latencyMs: performance.now() - startedAt,
        endpointReachable: null,
        endpointStatus: "client_validation_error",
        endpointError,
        validationErrors: [
          {
            path: "state_raw.activeSeat",
            message: endpointError
          }
        ],
        handledByServerTelemetry: false,
        usedFallback: false
      };
    }
  }

  const startedAt = performance.now();
  try {
    const response = await postDecisionRequest(
      settings.backendBaseUrl,
      requestPayload,
      fetchImpl
    );

    if (!response.accepted || !response.chosen_action) {
      throw new Error(
        response.validation_errors?.map((issue) => issue.message).join("; ") ||
          response.provider_reason ||
          "Server provider rejected the decision request."
      );
    }

    const metadata = response.metadata ?? undefined;
    const explanation = readPolicyExplanation(metadata);
    return {
      chosen: createSyntheticDecision(
        actor,
        response.chosen_action as unknown as EngineAction,
        response.provider_reason ??
          "Resolved through the shared heuristics-v1 provider on the backend.",
        response.provider_used ?? "server_heuristic",
        explanation
      ),
      requestedProvider: requestPayload.requested_provider,
      providerUsed: response.provider_used ?? "server_heuristic",
      providerReason:
        response.provider_reason ??
        "Resolved through the shared heuristics-v1 provider on the backend.",
      responseMetadata: (response.metadata as JsonObject | undefined) ?? null,
      telemetryId: response.telemetry_id ?? null,
      latencyMs: performance.now() - startedAt,
      endpointReachable: true,
      endpointStatus: "ok",
      endpointError: null,
      validationErrors: null,
      handledByServerTelemetry: true,
      usedFallback: false
    };
  } catch (error) {
    if (!settings.serverFallbackEnabled) {
      throw error;
    }

    const fallbackReason = `Server provider failed, fell back to local heuristics: ${
      error instanceof Error ? error.message : String(error)
    }`;
    const chosen = heuristicsV1Policy.chooseAction(context);
    const endpointReachable = isBackendRequestError(error)
      ? error.reachable
      : false;
    const endpointStatus = isBackendRequestError(error)
      ? error.kind === "validation"
        ? "validation_error"
        : error.kind === "client_validation"
          ? "client_validation_error"
          : error.kind === "network"
            ? "network_error"
            : "server_error"
      : "server_error";
    const validationErrors = isBackendRequestError(error)
      ? error.validationErrors
      : null;
    const endpointError =
      error instanceof Error ? error.message : String(error);

    return {
      chosen,
      requestedProvider: requestPayload.requested_provider,
      providerUsed: "local_heuristic",
      providerReason: fallbackReason,
      responseMetadata: {
        requested_provider: requestPayload.requested_provider,
        fallback_error: endpointError
      },
      telemetryId: null,
      latencyMs: performance.now() - startedAt,
      endpointReachable,
      endpointStatus,
      endpointError,
      validationErrors,
      handledByServerTelemetry: false,
      usedFallback: true
    };
  }
}
