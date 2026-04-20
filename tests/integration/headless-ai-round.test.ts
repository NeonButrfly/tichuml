import { describe, expect, it } from "vitest";
import { runHeadlessRound } from "@tichuml/sim-runner";
import {
  deterministicBaselinePolicy,
  heuristicsV1Policy
} from "@tichuml/ai-heuristics";

function withSilencedConsole<T>(run: () => T): T {
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = () => undefined;
  console.info = () => undefined;
  console.warn = () => undefined;
  console.error = () => undefined;

  try {
    return run();
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function selectedActionMatchesLegalShape(record: {
  legal_actions: Array<Record<string, unknown>>;
  selected_action: Record<string, unknown>;
}): boolean {
  const selectedType = record.selected_action.type;
  if (typeof selectedType !== "string") {
    return false;
  }

  return record.legal_actions.some((legalAction) => {
    if (legalAction.type !== selectedType) {
      return false;
    }

    switch (selectedType) {
      case "play_cards":
        return (
          legalAction.seat === record.selected_action.seat &&
          JSON.stringify(legalAction.cardIds) === JSON.stringify(record.selected_action.cardIds) &&
          (legalAction.phoenixAsRank ?? null) === (record.selected_action.phoenixAsRank ?? null)
        );
      case "select_pass":
        return legalAction.seat === record.selected_action.seat;
      case "assign_dragon_trick":
        return (
          legalAction.seat === record.selected_action.seat &&
          legalAction.recipient === record.selected_action.recipient
        );
      case "advance_phase":
        return legalAction.actor === record.selected_action.actor;
      default:
        return legalAction.seat === record.selected_action.seat;
    }
  });
}

describe("headless AI flow", () => {
  it("uses the same canonical heuristics policy export for headless execution", () => {
    expect(deterministicBaselinePolicy).toBe(heuristicsV1Policy);
  });

  it("completes a headless AI-only round with append-only telemetry", () => {
    const result = withSilencedConsole(() =>
      runHeadlessRound({ seed: "headless-round" })
    );

    expect(result.completed).toBe(true);
    expect(result.state.phase).toBe("finished");
    expect(result.state.roundSummary).not.toBeNull();
    expect(result.decisions).toBeGreaterThan(0);
    expect(result.events).toBeGreaterThan(result.decisions);

    expect(result.telemetry.decisions.map((record) => record.decision_index)).toEqual(
      result.telemetry.decisions.map((_, index) => index)
    );
    expect(result.telemetry.decisions.every(selectedActionMatchesLegalShape)).toBe(true);
    expect(result.policyName).toBe("heuristics-v1");
    expect(result.telemetry.decisions.every((record) => record.policy_name === "heuristics-v1")).toBe(true);
    expect(
      result.telemetry.decisions.every((record) => {
        if (
          record.actor_type !== "ai" ||
          record.policy_explanation.actor === "system"
        ) {
          return (
            record.policy_explanation.policy === "heuristics-v1" &&
            record.policy_explanation.selectedReasonSummary.length > 0
          );
        }

        return (
          record.policy_explanation.policy === "heuristics-v1" &&
          record.policy_explanation.candidateScores.length > 0 &&
          record.policy_explanation.selectedReasonSummary.length > 0 &&
          Array.isArray(record.policy_explanation.selectedTags) &&
          typeof record.policy_explanation.stateFeatures === "object" &&
          record.policy_explanation.selectedFeatures !== undefined &&
          record.policy_explanation.candidateScores.every(
            (candidate) =>
              Array.isArray(candidate.tags) &&
              typeof candidate.features === "object"
          )
        );
      })
    ).toBe(true);
    expect(result.telemetry.decisions.every((record) => record.actor_type === "ai" || record.actor_type === "system")).toBe(
      true
    );
  }, 150000);

  it("runs many AI-only rounds without soft locks", async () => {
    const batch = [];
    for (const seed of ["fast-0", "fast-1"]) {
      batch.push(
        withSilencedConsole(() =>
          runHeadlessRound({
            seed,
            matchId: `match-${seed}`,
            maxDecisions: 2000
          })
        )
      );
      await yieldToEventLoop();
    }

    expect(batch).toHaveLength(2);
    expect(batch.every((round) => round.completed && round.state.phase === "finished")).toBe(true);
    expect(batch.every((round) => round.decisions > 0)).toBe(true);
  }, 180000);

  it("replays the same seed with identical policy decisions", async () => {
    const first = withSilencedConsole(() =>
      runHeadlessRound({ seed: "fast-0" })
    );
    await yieldToEventLoop();
    const second = withSilencedConsole(() =>
      runHeadlessRound({ seed: "fast-0" })
    );

    expect(
      first.telemetry.decisions.map((record) => record.selected_action)
    ).toEqual(second.telemetry.decisions.map((record) => record.selected_action));
    expect(first.state.roundSummary).toEqual(second.state.roundSummary);
  }, 120000);
});
