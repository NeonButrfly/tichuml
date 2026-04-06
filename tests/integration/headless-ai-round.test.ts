import { describe, expect, it } from "vitest";
import { runHeadlessBatch, runHeadlessRound } from "@tichuml/sim-runner";

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
  it("completes a headless AI-only round with append-only telemetry", () => {
    const result = runHeadlessRound({ seed: "headless-round" });

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
      result.telemetry.decisions.every(
        (record) =>
          record.policy_explanation.policy === "heuristics-v1" &&
          record.policy_explanation.candidateScores.length > 0 &&
          record.policy_explanation.selectedReasonSummary.length > 0 &&
          Array.isArray(record.policy_explanation.selectedTags) &&
          record.policy_explanation.candidateScores.every((candidate) => Array.isArray(candidate.tags))
      )
    ).toBe(true);
    expect(result.telemetry.decisions.every((record) => record.actor_type === "ai" || record.actor_type === "system")).toBe(
      true
    );
  });

  it("runs many AI-only rounds without soft locks", () => {
    const batch = runHeadlessBatch({
      seeds: Array.from({ length: 12 }, (_, index) => `batch-${index}`),
      maxDecisionsPerRound: 2000
    });

    expect(batch).toHaveLength(12);
    expect(batch.every((round) => round.completed && round.state.phase === "finished")).toBe(true);
    expect(batch.every((round) => round.decisions > 0)).toBe(true);
  }, 20000);
});
