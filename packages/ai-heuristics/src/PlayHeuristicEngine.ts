import {
  getOpponentSeats,
  getPartnerSeat,
  getTeamForSeat,
  type EngineAction,
  type SeatId
} from "@tichuml/engine";
import {
  activeOpponentHasLiveBeat,
  buildTeamplaySnapshot,
  buildUrgencyProfile,
  canOpponentBeatCombination,
  currentWinnerIsPartner,
  hasOpponentImmediateWinRisk,
  partnerHasCalledTichu,
  partnerStillLiveForTichu
} from "./HeuristicContext.js";
import type { HeuristicFeatureAnalyzer } from "./HeuristicFeatureAnalyzer.js";
import { HEURISTIC_WEIGHTS } from "./HeuristicScorer.js";
import { combinationKindBonus, getStructurePenaltyForPlay } from "./HandAnalysis.js";
import type { CandidateDecision, HeadlessDecisionContext, PlayLegalAction } from "./types.js";
import { appendUniqueTags } from "./utils.js";

function buildPlayBaseScore(
  ctx: HeadlessDecisionContext,
  actor: SeatId,
  legalAction: PlayLegalAction,
  analyzer: HeuristicFeatureAnalyzer,
  reasons: string[],
  tags: CandidateDecision["tags"]
): number {
  const ownHand = ctx.state.hands[actor];
  const handCountAfter = ownHand.length - legalAction.cardIds.length;
  const weights = HEURISTIC_WEIGHTS.play;
  const features = analyzer.getCandidateFeatures(actor, {
    type: "play_cards",
    seat: actor,
    cardIds: legalAction.cardIds,
    ...(legalAction.phoenixAsRank !== undefined
      ? { phoenixAsRank: legalAction.phoenixAsRank }
      : {})
  }, legalAction);
  let score = weights.base;
  const structurePenalty = getStructurePenaltyForPlay(
    ownHand,
    legalAction,
    handCountAfter
  );

  score += legalAction.cardIds.length * weights.perCardShed;
  score += combinationKindBonus(legalAction);
  score -= structurePenalty * weights.structureDamageScalar;
  if (features) {
    score += features.shed_value_score * 0.03;
    score += features.future_hand_quality_delta * 0.06;
    score += features.structure_preservation_score * 0.05;
    score += features.control_value_score * 0.01;
    score -= features.resource_cost_score * 0.03;
  }

  if (structurePenalty > 0) {
    reasons.push("preserves pairs, triples, and straight potential unless urgency justifies the damage");
  } else {
    appendUniqueTags(tags, "PRESERVE_STRUCTURE");
  }

  if (handCountAfter === 0) {
    score += weights.goOut;
    reasons.push("this line goes out immediately");
    appendUniqueTags(tags, "SHED_FOR_FINISH", "ENDGAME_COMMIT");
  }

  const selfTichuCalled =
    ctx.state.calls[actor].smallTichu || ctx.state.calls[actor].grandTichu;
  if (selfTichuCalled) {
    score += legalAction.cardIds.length * weights.tichuSpeedPerCard;
    reasons.push("called Tichu lines favor faster hand reduction");

    if (handCountAfter <= 2) {
      score += weights.tichuCloseout;
      reasons.push("low remaining card counts increase the value of pushing a called Tichu line");
    }
  }

  if (legalAction.combination.isBomb) {
    score -= weights.specials.bombPenalty;
    reasons.push("bombs are expensive and should be conserved when possible");
    appendUniqueTags(tags, "PRESERVE_BOMB");
  }

  return score;
}

function applyLeadHeuristics(
  ctx: HeadlessDecisionContext,
  actor: SeatId,
  legalAction: PlayLegalAction,
  score: number,
  reasons: string[],
  tags: CandidateDecision["tags"]
): number {
  const weights = HEURISTIC_WEIGHTS.play;
  const urgency = buildUrgencyProfile(ctx.state, actor);
  const partnerTichuActive = partnerHasCalledTichu(ctx.state, actor);
  const selfTichuCalled =
    ctx.state.calls[actor].smallTichu || ctx.state.calls[actor].grandTichu;
  const handCountAfter = ctx.state.hands[actor].length - legalAction.cardIds.length;

  if (legalAction.combination.containsMahjong) {
    score += weights.lead.mahjongLead;
    reasons.push("Mahjong lead preserves initiative and sets a wish");
  }

  if (legalAction.combination.kind === "dog" && urgency.partnerCardCount > 0) {
    const justifiedDogLead =
      partnerTichuActive ||
      selfTichuCalled ||
      handCountAfter <= 3 ||
      urgency.partnerNearOut ||
      urgency.opponentOutUrgent;

    score += justifiedDogLead ? weights.lead.dogToPartner : weights.lead.dogWithoutNeed;
    if (justifiedDogLead && (urgency.partnerNearOut || partnerTichuActive || selfTichuCalled)) {
      score += 140;
    }
    reasons.push(
      justifiedDogLead
        ? "Dog lead is justified by partner support or endgame urgency"
        : "Dog lead is deferred until partner support or endgame urgency matters"
    );

    if (justifiedDogLead) {
      appendUniqueTags(tags, "DOG_TO_PARTNER", "PARTNER_SUPPORT");
    }
  }

  score += Math.max(0, weights.lead.lowPrimaryRankCeiling - legalAction.combination.primaryRank);
  reasons.push("leading with a cheaper legal combination preserves higher control cards");

  if (
    legalAction.cardIds.length >= 4 &&
    !legalAction.combination.isBomb &&
    handCountAfter > 0
  ) {
    score += weights.lead.multiCardShed;
    reasons.push("clean multi-card shedding improves hand shape on the lead");
    appendUniqueTags(tags, "SHED_COMBO", "SHED_FOR_FINISH");
  }

  if (
    (legalAction.combination.kind === "straight" ||
      legalAction.combination.kind === "pair-sequence" ||
      legalAction.combination.kind === "full-house") &&
    !legalAction.combination.isBomb
  ) {
    score += weights.lead.comboShed;
    appendUniqueTags(tags, "CONTROL_LEAD");
  }

  if (urgency.selfNearOut && handCountAfter === 1 && legalAction.cardIds.length >= 2) {
    score += weights.lead.oneCardFinishSetup;
    reasons.push("endgame leads should prefer lines that leave a one-card finish");
    appendUniqueTags(tags, "ENDGAME_COMMIT", "SHED_FOR_FINISH");
  }

  return score;
}

function applyFollowHeuristics(
  ctx: HeadlessDecisionContext,
  actor: SeatId,
  legalAction: PlayLegalAction,
  score: number,
  reasons: string[],
  tags: CandidateDecision["tags"]
): number {
  const state = ctx.state;
  const weights = HEURISTIC_WEIGHTS.play.follow;
  const urgency = buildUrgencyProfile(state, actor);
  const partnerWinning = currentWinnerIsPartner(state, actor);
  const opponentWinning =
    state.currentTrick !== null &&
    getTeamForSeat(state.currentTrick.currentWinner) !== getTeamForSeat(actor);

  if (partnerWinning) {
    score -= weights.partnerControlPenalty;
    reasons.push("avoid overtaking partner when the team is already winning the trick");

    if (urgency.opponentOutUrgent) {
      score += weights.partnerThreatOffset;
      reasons.push("opponent hand pressure justifies a more aggressive overtake");
      appendUniqueTags(tags, "OPPONENT_OUT_URGENT", "OPPONENT_STOP");
    }
  }

  if (opponentWinning) {
    score += weights.opponentTempoGain;
    reasons.push("taking the trick away from the opponents improves team tempo");

    if (urgency.opponentOutUrgent) {
      score += weights.opponentUrgentTempoGain;
      reasons.push("an opponent is close to going out, so denying control matters more");
      appendUniqueTags(tags, "OPPONENT_OUT_URGENT", "OPPONENT_STOP", "TEMPO_WIN");
    }
  } else if (state.currentTrick !== null) {
    score += weights.opponentControlLossPenalty;
  }

  const efficiencyDelta = state.currentTrick
    ? legalAction.combination.primaryRank - state.currentTrick.currentCombination.primaryRank
    : 0;
  score += Math.max(0, weights.cheapestWinBase - efficiencyDelta * weights.cheapestWinStep);
  reasons.push("prefers efficient beats over unnecessarily expensive overtakes");
  appendUniqueTags(tags, "CHEAPEST_WIN");
  if (efficiencyDelta <= 2) {
    appendUniqueTags(tags, "TEMPO_WIN");
  }

  return score;
}

export function scorePlayAction(
  ctx: HeadlessDecisionContext,
  actor: SeatId,
  legalAction: PlayLegalAction,
  action: EngineAction,
  analyzer: HeuristicFeatureAnalyzer
): CandidateDecision {
  const state = ctx.state;
  const handCountAfter = state.hands[actor].length - legalAction.cardIds.length;
  const urgency = buildUrgencyProfile(state, actor);
  const partnerWinning = currentWinnerIsPartner(state, actor);
  const partnerCardCount = urgency.partnerCardCount;
  const selfTichuCalled =
    state.calls[actor].smallTichu || state.calls[actor].grandTichu;
  const partnerTichuActive = partnerHasCalledTichu(state, actor);
  const reasons: string[] = [];
  const tags: CandidateDecision["tags"] = [];
  const features = analyzer.getCandidateFeatures(actor, action, legalAction);
  let score = buildPlayBaseScore(ctx, actor, legalAction, analyzer, reasons, tags);

  if (features) {
    if (features.structure_preservation_score >= 0) {
      appendUniqueTags(tags, "PRESERVE_STRUCTURE");
    }
    if (features.control_retention_estimate >= 65) {
      score += 6;
      reasons.push("shared tactical features project strong control retention after this action");
    } else if (features.control_retention_estimate <= 20 && state.currentTrick !== null) {
      score -= 4;
      reasons.push("shared tactical features project weak control retention after this action");
    }
    if (features.urgency_mode === "endgame") {
      appendUniqueTags(tags, "ENDGAME_COMMIT");
    }
    if (state.currentTrick === null && features.uses_dog && features.partner_advantage_estimate > 0) {
      score += 120 + features.partner_advantage_estimate * 8;
      reasons.push("shared tactical features show Dog improves partner tempo conversion");
    }
  }

  if (urgency.selfNearOut) {
    appendUniqueTags(tags, "SELF_NEAR_OUT", "ENDGAME_COMMIT");
  }

  if (features?.uses_bomb ?? legalAction.combination.isBomb) {
    if (urgency.opponentOutUrgent || handCountAfter === 0 || urgency.selfNearOut) {
      score += HEURISTIC_WEIGHTS.play.specials.urgentBombReward;
      reasons.push("bomb value is justified by the immediate threat");
      appendUniqueTags(tags, "BOMB_PIVOT");
    }

    if (selfTichuCalled && handCountAfter > 0 && !urgency.opponentOutUrgent) {
      score -= HEURISTIC_WEIGHTS.play.specials.calledTichuBombPenalty;
      reasons.push("called Tichu lines should avoid cashing bombs too early");
    }
  }

  if (state.currentTrick === null) {
    score = applyLeadHeuristics(ctx, actor, legalAction, score, reasons, tags);
  } else {
    score = applyFollowHeuristics(ctx, actor, legalAction, score, reasons, tags);
  }

  const partnerTichuStillLive = partnerStillLiveForTichu(state, actor);
  const opponentImmediateWinRisk = hasOpponentImmediateWinRisk(state, actor);
  const partnerCurrentControl = partnerWinning;
  const partnerCannotRetainLead =
    partnerCurrentControl &&
    (activeOpponentHasLiveBeat(ctx, actor) ||
      (state.activeSeat === actor &&
        getOpponentSeats(actor).some((opponent) =>
          canOpponentBeatCombination(state, opponent, getPartnerSeat(actor))
        )));
  const teamControlWouldBeLostWithoutIntervention = partnerCannotRetainLead;
  const partnerInterferenceCandidate =
    partnerCurrentControl && partnerTichuActive && partnerTichuStillLive;
  const bombsPartner = partnerInterferenceCandidate && (features?.uses_bomb ?? legalAction.combination.isBomb);
  const teamSalvageIntervention =
    partnerInterferenceCandidate &&
    (features?.uses_bomb ?? legalAction.combination.isBomb) &&
    (opponentImmediateWinRisk || teamControlWouldBeLostWithoutIntervention);

  if (partnerTichuActive) {
    appendUniqueTags(tags, "partner_called_tichu");
  }

  if (partnerTichuStillLive) {
    appendUniqueTags(tags, "partner_still_live_for_tichu");
  }

  if (opponentImmediateWinRisk) {
    appendUniqueTags(tags, "opponent_immediate_win_risk");
  }

  if (partnerInterferenceCandidate) {
    appendUniqueTags(tags, "partner_tichu_interference_candidate");
    score -= HEURISTIC_WEIGHTS.play.teamplay.partnerTichuInterferencePenalty;
    reasons.push("partner has an active Tichu line, so tempo theft is heavily penalized");

    if (partnerCardCount > 1) {
      score -= HEURISTIC_WEIGHTS.play.teamplay.partnerStillLivePenalty;
      reasons.push("partner still has a plausible path to finish first without team interference");
    }

    if (bombsPartner) {
      score -= HEURISTIC_WEIGHTS.play.teamplay.partnerBombPenalty;
      reasons.push("bombing a Tichu-calling partner is an extreme last resort");
    } else {
      score -= HEURISTIC_WEIGHTS.play.teamplay.partnerNonBombInterferencePenalty;
      reasons.push("overtaking a Tichu-calling partner is disfavored unless it saves the team");
    }

    if (teamControlWouldBeLostWithoutIntervention) {
      appendUniqueTags(
        tags,
        "partner_cannot_retain_lead",
        "team_control_would_be_lost_without_intervention"
      );
      reasons.push("partner is under live opponent pressure and may lose the trick without help");
    }

    if (teamSalvageIntervention) {
      appendUniqueTags(tags, "team_salvage_intervention");
      score += HEURISTIC_WEIGHTS.play.teamplay.salvageReward;
      if (features?.control_retention_estimate !== undefined) {
        score += features.control_retention_estimate * 4;
      }
      if (actor !== state.activeSeat) {
        score += 1200;
      }
      reasons.push(
        "allowed intervention: bomb preserves team survival against an immediate collapse risk"
      );
    } else if (bombsPartner) {
      appendUniqueTags(tags, "unjustified_partner_bomb");
      reasons.push("rejected bomb: partner has active Tichu and remains live");
    }

    if (bombsPartner && teamSalvageIntervention) {
      appendUniqueTags(tags, "justified_partner_bomb");
      reasons.push(
        "allowed bomb: opponent pressure made partner support secondary to team survival"
      );
    }
  }

  const teamplay =
    partnerTichuActive || partnerInterferenceCandidate
      ? buildTeamplaySnapshot(state, actor, {
          partnerCurrentControl,
          opponentImmediateWinRisk,
          partnerCannotRetainLead,
          teamControlWouldBeLostWithoutIntervention,
          teamSalvageIntervention,
          partnerInterferenceCandidate,
          justifiedPartnerBomb: bombsPartner && teamSalvageIntervention,
          unjustifiedPartnerBomb: bombsPartner && !teamSalvageIntervention
        })
      : undefined;

  if (
    features?.satisfies_wish ??
    (state.currentWish !== null &&
      legalAction.combination.actualRanks.includes(state.currentWish))
  ) {
    score += HEURISTIC_WEIGHTS.play.wishSatisfied;
    reasons.push("wish-satisfying plays are preferred when multiple legal lines exist");
    appendUniqueTags(tags, "FORCED_WISH");

    if (state.currentTrick !== null) {
      score += HEURISTIC_WEIGHTS.play.forcedWish;
    }
  }

  if ((features?.uses_dragon ?? legalAction.cardIds.includes("dragon")) && handCountAfter > 0) {
    score -= HEURISTIC_WEIGHTS.play.specials.dragonHoldPenalty;
    reasons.push("holding Dragon back keeps a premium single-card stopper available");

    if (selfTichuCalled && handCountAfter > 2) {
      score -= HEURISTIC_WEIGHTS.play.specials.dragonCalledTichuPenalty;
      reasons.push(
        "called Tichu lines should preserve Dragon until it closes or stabilizes the race"
      );
    }
  }

  if (
    (features?.uses_phoenix ?? legalAction.cardIds.includes("phoenix")) &&
    legalAction.combination.kind === "single" &&
    handCountAfter > 0
  ) {
    score -= HEURISTIC_WEIGHTS.play.specials.phoenixHoldPenalty;
    reasons.push("preserve Phoenix flexibility when a simpler line exists");
    appendUniqueTags(tags, "PHOENIX_FLEX_PRESERVE");

    if (selfTichuCalled && handCountAfter > 2) {
      score -= HEURISTIC_WEIGHTS.play.specials.phoenixCalledTichuPenalty;
      reasons.push("called Tichu lines should keep Phoenix flexible until the endgame");
    }
  }

  if (
    state.currentTrick?.currentCombination.cardIds.some((cardId) => cardId === "phoenix") &&
    !urgency.highUrgency &&
    handCountAfter > 0
  ) {
    score -= 80;
    reasons.push("avoid taking a Phoenix-led trick unless urgency justifies it");
  }

  return {
    actor,
    action,
    score,
    reasons,
    tags,
    ...(features ? { features } : {}),
    ...(teamplay ? { teamplay } : {})
  };
}

export function scorePassTurn(
  ctx: HeadlessDecisionContext,
  seat: SeatId,
  action: EngineAction,
  analyzer: HeuristicFeatureAnalyzer
): CandidateDecision {
  const partnerWinning = currentWinnerIsPartner(ctx.state, seat);
  const urgency = buildUrgencyProfile(ctx.state, seat);
  const partnerSeat = getPartnerSeat(seat);
  const partnerCannotRetainLead =
    partnerWinning &&
    (activeOpponentHasLiveBeat(ctx, seat) ||
      (ctx.state.activeSeat === seat &&
        getOpponentSeats(seat).some((opponent) =>
          canOpponentBeatCombination(ctx.state, opponent, partnerSeat)
        )));
  let score = HEURISTIC_WEIGHTS.play.passTurn.base;
  const reasons: string[] = ["passing keeps stronger cards available for later decisions"];
  const tags: CandidateDecision["tags"] = [];
  const features = analyzer.getCandidateFeatures(seat, action);

  if (partnerWinning) {
    score += HEURISTIC_WEIGHTS.play.passTurn.partnerWinning;
    reasons.push("partner is already winning the trick");
    appendUniqueTags(tags, "YIELD_TO_PARTNER");

    if (!urgency.opponentOutUrgent) {
      score += HEURISTIC_WEIGHTS.play.passTurn.partnerWinningSafeBoard;
      reasons.push("there is no immediate opponent escape threat");
    }
  }

  if (!partnerWinning && ctx.state.currentTrick !== null) {
    score += HEURISTIC_WEIGHTS.play.passTurn.opponentWinning;
    reasons.push("passing leaves the current trick with the opponents");
  }

  if (urgency.opponentOutUrgent) {
    score -= HEURISTIC_WEIGHTS.play.passTurn.opponentUrgencyPenalty;
    reasons.push("low opponent card counts make passive play riskier");
    appendUniqueTags(tags, "OPPONENT_OUT_URGENT");
  }

  if (features) {
    score += features.partner_advantage_estimate * 0.2;
    score += features.control_retention_estimate * 0.05;
    score -= Math.max(0, features.opponent_threat_estimate - 60) * 0.2;
  }

  const partnerTichuActive = partnerHasCalledTichu(ctx.state, seat);
  const partnerTichuStillLive = partnerStillLiveForTichu(ctx.state, seat);
  const opponentImmediateWinRisk = hasOpponentImmediateWinRisk(ctx.state, seat);
  const teamplay =
    partnerTichuActive || partnerWinning
      ? buildTeamplaySnapshot(ctx.state, seat, {
          partnerCurrentControl: partnerWinning,
          opponentImmediateWinRisk,
          partnerCannotRetainLead,
          teamControlWouldBeLostWithoutIntervention: partnerCannotRetainLead,
          partnerInterferenceCandidate: false,
          teamSalvageIntervention: false
        })
      : undefined;

  if (partnerTichuActive) {
    appendUniqueTags(tags, "partner_called_tichu");
  }

  if (partnerTichuStillLive) {
    appendUniqueTags(tags, "partner_still_live_for_tichu");
  }

  if (opponentImmediateWinRisk) {
    appendUniqueTags(tags, "opponent_immediate_win_risk");
  }

  if (partnerWinning && partnerTichuStillLive) {
    appendUniqueTags(tags, "partner_tempo_preserved", "partner_control_preserved");

    if (partnerCannotRetainLead) {
      appendUniqueTags(
        tags,
        "partner_cannot_retain_lead",
        "team_control_would_be_lost_without_intervention"
      );
      score -=
        HEURISTIC_WEIGHTS.play.teamplay.salvageReward +
        HEURISTIC_WEIGHTS.play.passTurn.partnerTichuUrgentTempo;
      reasons.push(
        "passing is unsafe because live opponents can strip partner control before the Tichu line converts"
      );
    } else if (opponentImmediateWinRisk) {
      score += HEURISTIC_WEIGHTS.play.passTurn.partnerTichuUrgentTempo;
      reasons.push(
        "partner control is valuable, but immediate opponent pressure limits passive support value"
      );
    } else {
      score += HEURISTIC_WEIGHTS.play.passTurn.partnerTichuSafeTempo;
      reasons.push("preserved partner control because the active Tichu line is still alive");
    }
  }

  return {
    actor: seat,
    action,
    score,
    reasons,
    tags,
    ...(features ? { features } : {}),
    ...(teamplay ? { teamplay } : {})
  };
}
