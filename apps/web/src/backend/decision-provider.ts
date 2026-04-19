import {
  heuristicsV1Policy,
  type ChosenDecision,
  type HeadlessDecisionContext
} from "@tichuml/ai-heuristics";
import { SYSTEM_ACTOR, type ActorId, type EngineAction } from "@tichuml/engine";
import {
  type BackendRuntimeSettings,
  type DecisionProviderUsed,
  type DecisionRequestPayload
} from "@tichuml/shared";
import { postDecisionRequest } from "./client";

export type DecisionResolution = {
  chosen: ChosenDecision;
  providerUsed: DecisionProviderUsed;
  providerReason: string;
  handledByServerTelemetry: boolean;
  usedFallback: boolean;
};

function createSyntheticDecision(
  actor: ActorId,
  action: EngineAction,
  providerReason: string,
  providerUsed: DecisionProviderUsed
): ChosenDecision {
  return {
    actor,
    action,
    explanation: {
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

export async function resolveDecisionWithProvider(config: {
  context: HeadlessDecisionContext;
  actor: ActorId;
  settings: BackendRuntimeSettings;
  requestPayload: DecisionRequestPayload;
  fetchImpl?: typeof fetch;
}): Promise<DecisionResolution> {
  const { context, actor, settings, requestPayload, fetchImpl } = config;

  if (actor === SYSTEM_ACTOR || settings.decisionMode === "local") {
    return {
      chosen: heuristicsV1Policy.chooseAction(context),
      providerUsed: "local_heuristic",
      providerReason: "Resolved through the local heuristics-v1 provider.",
      handledByServerTelemetry: false,
      usedFallback: false
    };
  }

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

    return {
      chosen: createSyntheticDecision(
        actor,
        response.chosen_action as unknown as EngineAction,
        response.provider_reason ??
          "Resolved through the shared heuristics-v1 provider on the backend.",
        response.provider_used ?? "server_heuristic"
      ),
      providerUsed: response.provider_used ?? "server_heuristic",
      providerReason:
        response.provider_reason ??
        "Resolved through the shared heuristics-v1 provider on the backend.",
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

    return {
      chosen: heuristicsV1Policy.chooseAction(context),
      providerUsed: "local_heuristic",
      providerReason: fallbackReason,
      handledByServerTelemetry: false,
      usedFallback: true
    };
  }
}
