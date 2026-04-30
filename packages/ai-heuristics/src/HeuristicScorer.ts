import type { PolicyTag } from "./types.js";
import { appendUniqueTags } from "./utils.js";

export const HEURISTIC_WEIGHTS = {
  play: {
    base: 260,
    perCardShed: 36,
    goOut: 1000,
    tichuSpeedPerCard: 22,
    tichuCloseout: 180,
    structureDamageScalar: 1,
    wishSatisfied: 90,
    forcedWish: 45,
    lead: {
      mahjongLead: 40,
      lowPrimaryRankCeiling: 15,
      multiCardShed: 34,
      comboShed: 16,
      oneCardFinishSetup: 220,
      dogToPartner: 96,
      dogWithoutNeed: -80
    },
    follow: {
      partnerControlPenalty: 520,
      partnerThreatOffset: 220,
      opponentTempoGain: 140,
      opponentUrgentTempoGain: 180,
      cheapestWinBase: 18,
      cheapestWinStep: 4,
      opponentControlLossPenalty: 80
    },
    specials: {
      bombPenalty: 220,
      urgentBombReward: 260,
      calledTichuBombPenalty: 180,
      dragonHoldPenalty: 130,
      dragonCalledTichuPenalty: 70,
      phoenixHoldPenalty: 90,
      phoenixCalledTichuPenalty: 60
    },
    teamplay: {
      partnerTichuInterferencePenalty: 1480,
      partnerStillLivePenalty: 180,
      partnerNonBombInterferencePenalty: 220,
      partnerBombPenalty: 1320,
      salvageReward: 3380
    },
    passTurn: {
      base: 120,
      partnerWinning: 340,
      partnerWinningSafeBoard: 80,
      opponentWinning: -80,
      opponentUrgencyPenalty: 120,
      partnerTichuSafeTempo: 860,
      partnerTichuUrgentTempo: 180
    }
  },
  tactical: {
    topCandidateWindow: 6,
    perBucketWindow: 2,
    finishPlanDelta: 1.35,
    shedProgress: 32,
    deadSingleReduction: 34,
    straightPlanGain: 12,
    pairSequencePlanGain: 10,
    pairPlanGain: 6,
    trioPlanGain: 8,
    cleanEndgameCommit: 160,
    oneCardFinishSetup: 240,
    perfectControlRetention: 150,
    partialControlRetention: 60,
    controlLeakPenaltyPerBeat: 40,
    passiveControlLeakPenaltyPerBeat: 180,
    partnerTempoSupport: 90,
    urgentStopRetention: 120,
    urgentPassPenalty: 140,
    justifiedBombSwing: 640,
    dragonDecisive: 80,
    dragonWastePenalty: 70,
    phoenixShapeGain: 55,
    phoenixWastePenalty: 65,
    phoenixPreserveBonus: 40,
    finishNowBonus: 320
  },
  pass: {
    selectionBase: 320,
    tichuProtectReasonScalar: 1,
    opponent: {
      lowRankBase: 14,
      smallRankBonus: 120,
      midRankBonus: 36,
      lowComboCount: 90,
      singleton: 48,
      isolated: 42,
      nonStructured: 56,
      pointPenalty: 95,
      selfCalledStructurePenalty: 1.25,
      selfCalledDogPenalty: 180,
      protectedPenalty: 2000,
      controlPenalty: 440,
      highRankPenalty: 120,
      tichuDumpDog: 320
    },
    partner: {
      connectorRange: 90,
      premiumWithoutTichu: 34,
      lowRankPenalty: 44,
      neighbor: 28,
      pairGift: 58,
      straightGift: 48,
      isolatedPenalty: 32,
      partnerCalledSupportScalar: 0.85,
      partnerCalledHighBonus: 28,
      selfCalledSupportPenaltyScalar: 1.1,
      selfCalledHighPenalty: 42,
      protectedPenalty: 1800,
      controlPenalty: 380,
      dogTichuPenalty: 460
    }
  },
  calls: {
    grandThreshold: 720,
    tichuThreshold14: 620,
    tichuThreshold10: 540,
    tichuThreshold6: 420,
    legacyGrandThreshold: 145,
    legacyTichuThreshold: 170
  },
  dragonGift: {
    base: 500,
    perCardRemaining: 40,
    calledTichuPenalty: 80
  }
} as const;

export type ScoreAccumulator = {
  score: number;
  reasons: string[];
  tags: PolicyTag[];
};

export function createAccumulator(base = 0): ScoreAccumulator {
  return {
    score: base,
    reasons: [],
    tags: []
  };
}

export function applyScore(
  accumulator: ScoreAccumulator,
  delta: number,
  reason?: string,
  ...tags: PolicyTag[]
): void {
  accumulator.score += delta;
  if (reason) {
    accumulator.reasons.push(reason);
  }
  if (tags.length > 0) {
    appendUniqueTags(accumulator.tags, ...tags);
  }
}
