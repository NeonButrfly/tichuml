import {
  SEAT_IDS,
  SYSTEM_ACTOR,
  type EngineAction,
  type GameState,
  type LegalAction,
  type LegalActionMap,
  type SeatId,
  type StandardRank
} from "@tichuml/engine";
import { engineFoundation } from "@tichuml/engine";

export type PolicyExplanation = {
  policy: string;
  actor: SeatId | typeof SYSTEM_ACTOR;
  candidateScores: Array<{
    action: EngineAction;
    score: number;
    reasons: string[];
  }>;
  selectedReasonSummary: string[];
};

export type HeadlessDecisionContext = {
  state: GameState;
  legalActions: LegalActionMap;
};

export type ChosenDecision = {
  actor: SeatId | typeof SYSTEM_ACTOR;
  action: EngineAction;
  explanation: PolicyExplanation;
};

export type HeuristicPolicy = {
  name: string;
  chooseAction(ctx: HeadlessDecisionContext): ChosenDecision;
};

function chooseWishRank(state: GameState, seat: SeatId, selectedCardIds: string[]): StandardRank {
  const remainingRanks = state.hands[seat]
    .filter(
      (card): card is Extract<(typeof state.hands)[SeatId][number], { kind: "standard" }> =>
        !selectedCardIds.includes(card.id) && card.kind === "standard"
    )
    .map((card) => card.rank);

  if (remainingRanks.length === 0) {
    return 14;
  }

  const counts = new Map<StandardRank, number>();
  for (const rank of remainingRanks) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return right[0] - left[0];
  })[0]![0];
}

function createPassSelectionAction(state: GameState, seat: SeatId): EngineAction {
  const sorted = [...state.hands[seat]].sort((left, right) => {
    const leftWeight = left.kind === "standard" ? left.rank : left.id === "dog" ? 0 : left.id === "mahjong" ? 1 : left.id === "phoenix" ? 14.5 : 15;
    const rightWeight = right.kind === "standard" ? right.rank : right.id === "dog" ? 0 : right.id === "mahjong" ? 1 : right.id === "phoenix" ? 14.5 : 15;
    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }

    return left.id.localeCompare(right.id);
  });

  const [left, partner, right] = sorted.slice(0, 3);
  if (!left || !partner || !right) {
    throw new Error(`Seat ${seat} cannot choose a full pass selection.`);
  }

  return {
    type: "select_pass",
    seat,
    left: left.id,
    partner: partner.id,
    right: right.id
  };
}

function chooseDecisionActor(state: GameState, legalActions: LegalActionMap): SeatId | typeof SYSTEM_ACTOR {
  if ((legalActions[SYSTEM_ACTOR] ?? []).length > 0) {
    return SYSTEM_ACTOR;
  }

  if (state.activeSeat && (legalActions[state.activeSeat] ?? []).length > 0) {
    return state.activeSeat;
  }

  const actor = SEAT_IDS.find((seat) => (legalActions[seat] ?? []).length > 0);
  if (!actor) {
    throw new Error("No legal actor available for headless decision.");
  }

  return actor;
}

function actionScore(action: EngineAction): { score: number; reasons: string[] } {
  switch (action.type) {
    case "advance_phase":
      return { score: 1000, reasons: ["required system phase advancement"] };
    case "decline_grand_tichu":
      return { score: 950, reasons: ["baseline declines high-variance grand tichu calls"] };
    case "assign_dragon_trick":
      return { score: 900, reasons: ["dragon winner must assign the trick to an opponent"] };
    case "select_pass":
      return { score: 850, reasons: ["passing the three lowest cards keeps the baseline deterministic"] };
    case "play_cards":
      return {
        score: 500 + action.cardIds.length * 10 - action.cardIds.join(",").length / 100,
        reasons: ["prefers making forward progress with a deterministic legal play"]
      };
    case "pass_turn":
      return { score: 50, reasons: ["passing is the fallback when no preferred play is selected"] };
    case "call_tichu":
      return { score: 10, reasons: ["baseline suppresses tichu calls until smarter heuristics arrive"] };
    case "call_grand_tichu":
      return { score: 0, reasons: ["baseline suppresses grand tichu calls until smarter heuristics arrive"] };
  }
}

function toConcreteAction(state: GameState, actor: SeatId | typeof SYSTEM_ACTOR, legalAction: LegalAction): EngineAction {
  if (legalAction.type === "select_pass") {
    return createPassSelectionAction(state, legalAction.seat);
  }

  if (legalAction.type === "play_cards" && legalAction.availableWishRanks) {
    return {
      type: "play_cards",
      seat: legalAction.seat,
      cardIds: legalAction.cardIds,
      ...(legalAction.phoenixAsRank !== undefined ? { phoenixAsRank: legalAction.phoenixAsRank } : {}),
      wishRank: chooseWishRank(state, legalAction.seat, legalAction.cardIds)
    };
  }

  if (legalAction.type === "assign_dragon_trick") {
    const recipients = (SEAT_IDS.filter((seat) => seat !== legalAction.seat) as SeatId[]).filter(
      (seat) => state.hands[seat] !== undefined
    );
    const deterministicRecipient = recipients.find((seat) => seat === legalAction.recipient) ?? legalAction.recipient;

    return {
      type: "assign_dragon_trick",
      seat: legalAction.seat,
      recipient: deterministicRecipient
    };
  }

  if (actor === SYSTEM_ACTOR && legalAction.type === "advance_phase") {
    return legalAction;
  }

  if (
    legalAction.type === "call_grand_tichu" ||
    legalAction.type === "decline_grand_tichu" ||
    legalAction.type === "call_tichu" ||
    legalAction.type === "pass_turn" ||
    legalAction.type === "advance_phase"
  ) {
    return legalAction;
  }

  return {
    type: "play_cards",
    seat: legalAction.seat,
    cardIds: legalAction.cardIds,
    ...(legalAction.phoenixAsRank !== undefined ? { phoenixAsRank: legalAction.phoenixAsRank } : {})
  };
}

function choosePreferredAction(
  state: GameState,
  actor: SeatId | typeof SYSTEM_ACTOR,
  legalActions: LegalAction[]
): ChosenDecision {
  const concreteCandidates = legalActions
    .map((legalAction) => toConcreteAction(state, actor, legalAction))
    .map((action) => ({
      action,
      ...actionScore(action)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return JSON.stringify(left.action).localeCompare(JSON.stringify(right.action));
    });

  const filtered = concreteCandidates.filter((candidate) => {
    if (candidate.action.type === "call_tichu" || candidate.action.type === "call_grand_tichu") {
      return false;
    }

    return true;
  });

  const selected = filtered[0] ?? concreteCandidates[0];
  if (!selected) {
    throw new Error(`No legal action candidates available for actor ${actor}.`);
  }

  return {
    actor,
    action: selected.action,
    explanation: {
      policy: "deterministic-baseline-v1",
      actor,
      candidateScores: concreteCandidates.map((candidate) => ({
        action: candidate.action,
        score: candidate.score,
        reasons: candidate.reasons
      })),
      selectedReasonSummary: selected.reasons
    }
  };
}

export const deterministicBaselinePolicy: HeuristicPolicy = {
  name: "deterministic-baseline-v1",
  chooseAction(ctx) {
    const actor = chooseDecisionActor(ctx.state, ctx.legalActions);
    const actorActions = ctx.legalActions[actor] ?? [];
    return choosePreferredAction(ctx.state, actor, actorActions);
  }
};

export const heuristicFoundation = {
  policyFamily: "team-aware-heuristics",
  dependsOn: engineFoundation.name,
  readyForHeadlessFlow: true,
  baselinePolicy: deterministicBaselinePolicy.name
};
