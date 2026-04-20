import {
  SYSTEM_ACTOR,
  type Card,
  type EngineAction,
  type GameState,
  type LegalAction,
  type LegalActionMap,
  type SeatId
} from "@tichuml/engine";

export type PolicyTag =
  | "partner_called_tichu"
  | "partner_still_live_for_tichu"
  | "partner_tichu_interference_candidate"
  | "unjustified_partner_bomb"
  | "justified_partner_bomb"
  | "partner_tempo_preserved"
  | "partner_control_preserved"
  | "opponent_immediate_win_risk"
  | "partner_cannot_retain_lead"
  | "team_control_would_be_lost_without_intervention"
  | "team_salvage_intervention"
  | "CHEAPEST_WIN"
  | "YIELD_TO_PARTNER"
  | "FORCED_WISH"
  | "OPPONENT_OUT_URGENT"
  | "SELF_NEAR_OUT"
  | "PRESERVE_BOMB"
  | "SHED_COMBO"
  | "DOG_TO_PARTNER"
  | "DUMP_LOW_IMPACT"
  | "GIFT_PARTNER"
  | "DRAGON_SAFE_TARGET"
  | "TEMPO_WIN"
  | "CONTROL_LEAD"
  | "SHED_FOR_FINISH"
  | "PARTNER_SUPPORT"
  | "OPPONENT_STOP"
  | "ENDGAME_COMMIT"
  | "PRESERVE_STRUCTURE"
  | "BOMB_PIVOT"
  | "DRAGON_DECISIVE"
  | "PHOENIX_FLEX_PRESERVE"
  | "PASS_GIFT_PARTNER"
  | "PASS_DUMP_LOW_IMPACT"
  | "DRAGON_GIFT_LOWEST_THREAT";

export type TeamplaySnapshot = {
  partnerCalledTichu: boolean;
  partnerStillLiveForTichu: boolean;
  partnerCardCount: number;
  partnerCurrentControl: boolean;
  opponentImmediateWinRisk: boolean;
  partnerCannotRetainLead: boolean;
  teamControlWouldBeLostWithoutIntervention: boolean;
  teamSalvageIntervention: boolean;
  partnerInterferenceCandidate: boolean;
  justifiedPartnerBomb: boolean;
  unjustifiedPartnerBomb: boolean;
};

export type UrgencyMode =
  | "normal"
  | "opponent_near_out"
  | "self_near_out"
  | "partner_support"
  | "endgame";

export type TacticalFeatureSnapshot = {
  seat: SeatId;
  hand_size: number;
  hand_quality_score: number;
  finishability_score: number;
  singles_count: number;
  dead_singles_count: number;
  pairs_count: number;
  triples_count: number;
  straights_count: number;
  pair_runs_count: number;
  bombs_count: number;
  control_cards_count: number;
  isolated_high_singles_count: number;
  isolated_low_singles_count: number;
  combo_count: number;
  control_value_score: number;
  partner_advantage_estimate: number;
  opponent_threat_estimate: number;
  urgency_mode: UrgencyMode;
  endgame_pressure: number;
  bomb_count_in_hand: number;
  dragon_in_hand: boolean;
  phoenix_in_hand: boolean;
  dog_in_hand: boolean;
  mahjong_in_hand: boolean;
  premium_resource_pressure: number;
};

export type CandidateActionFeatureSnapshot = {
  state: TacticalFeatureSnapshot;
  projected_state: TacticalFeatureSnapshot | null;
  future_hand_quality_delta: number;
  structure_preservation_score: number;
  dead_singles_count_before: number;
  dead_singles_count_after: number | null;
  dead_singles_reduction: number;
  combo_count_before: number;
  combo_count_after: number | null;
  shed_value_score: number;
  resource_cost_score: number;
  control_retention_estimate: number;
  control_value_score: number;
  partner_advantage_estimate: number;
  opponent_threat_estimate: number;
  urgency_mode: UrgencyMode;
  endgame_pressure: number;
  bomb_count_in_hand: number;
  dragon_in_hand: boolean;
  phoenix_in_hand: boolean;
  dog_in_hand: boolean;
  mahjong_in_hand: boolean;
  premium_resource_pressure: number;
  satisfies_wish: boolean;
  overtakes_partner: boolean;
  likely_wins_current_trick: boolean;
  uses_bomb: boolean;
  uses_dragon: boolean;
  uses_phoenix: boolean;
  uses_dog: boolean;
  uses_mahjong: boolean;
  cards_used_count: number;
  combo_type: string | null;
  combo_rank: number | null;
  combo_length: number | null;
};

export type PolicyExplanation = {
  policy: string;
  actor: SeatId | typeof SYSTEM_ACTOR;
  stateFeatures?: TacticalFeatureSnapshot;
  candidateScores: Array<{
    action: EngineAction;
    score: number;
    reasons: string[];
    tags: PolicyTag[];
    teamplay?: TeamplaySnapshot;
    features?: CandidateActionFeatureSnapshot;
  }>;
  selectedReasonSummary: string[];
  selectedTags: PolicyTag[];
  selectedTeamplay?: TeamplaySnapshot;
  selectedFeatures?: CandidateActionFeatureSnapshot;
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

export type CandidateDecision = {
  actor: SeatId | typeof SYSTEM_ACTOR;
  action: EngineAction;
  score: number;
  reasons: string[];
  tags: PolicyTag[];
  teamplay?: TeamplaySnapshot;
  features?: CandidateActionFeatureSnapshot;
};

export type PlayLegalAction = Extract<LegalAction, { type: "play_cards" }>;
export type PassLegalAction = Extract<LegalAction, { type: "pass_turn" }>;

export type CardPassMetrics = {
  card: Card;
  comboCount: number;
  maxComboSize: number;
  supportScore: number;
  pairLikeCount: number;
  straightLikeCount: number;
  bombCount: number;
  neighborCount: number;
  rankCount: number;
  isControl: boolean;
  isDog: boolean;
  isAce: boolean;
  isHighRank: boolean;
};

export type HandEvaluation = {
  strength: number;
  legacyCallStrength: number;
  leadPlayActions: PlayLegalAction[];
  cardMetrics: Map<string, CardPassMetrics>;
  rankCounts: Map<number, number>;
  straightProtectedRanks: Set<number>;
  controlCount: number;
  bombCount: number;
  highRankCount: number;
  highClusterCount: number;
  synergyScore: number;
  fragmentation: number;
  loserCount: number;
  deadSingleCount: number;
  expectedTrickWins: number;
  handSpeed: number;
  singlesCount: number;
  pairCount: number;
  trioCount: number;
  nearBombCount: number;
  straightsCount: number;
  pairRunsCount: number;
  comboCount: number;
  longestStraightLength: number;
  longestPairSequenceLength: number;
  finishPlanScore: number;
  handQualityScore: number;
  isolatedHighSinglesCount: number;
  isolatedLowSinglesCount: number;
  phoenixAvailable: boolean;
  dragonAvailable: boolean;
  dogAvailable: boolean;
  mahjongAvailable: boolean;
  tichuViable: boolean;
  protectedCardIds: Set<string>;
};

export type PassScoringContext = {
  partnerCalled: boolean;
  selfCalled: boolean;
};

export type UrgencyProfile = {
  minOpponentCards: number;
  partnerCardCount: number;
  opponentImmediateWinRisk: boolean;
  opponentOutUrgent: boolean;
  selfNearOut: boolean;
  partnerNearOut: boolean;
  yieldToPartner: boolean;
  highUrgency: boolean;
};

export type TacticalBucket =
  | "cheap_win"
  | "tempo_win"
  | "urgent_stop"
  | "control_lead"
  | "shedding_lead"
  | "partner_support"
  | "endgame"
  | "support_pass"
  | "fallback";
