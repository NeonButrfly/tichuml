import {
  SYSTEM_ACTOR,
  type Card,
  type EngineAction,
  type GameState,
  type LegalAction,
  type LegalActionMap,
  type SeatId,
  type StandardRank,
  type TeamId
} from "@tichuml/engine";
import type {
  AggressionContextV1,
  GrandTichuAggressionV1,
  PassReductionV1,
  TichuAggressionV1
} from "@tichuml/shared";

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
    mahjongWish?: MahjongWishMetadata;
    tichuCall?: TichuCallMetadata;
    pass_reduction_v1?: PassReductionV1;
    tichu_aggression_v1?: TichuAggressionV1;
    grand_tichu_aggression_v1?: GrandTichuAggressionV1;
    aggression_context_v1?: AggressionContextV1;
  }>;
  selectedReasonSummary: string[];
  selectedTags: PolicyTag[];
  selectedTeamplay?: TeamplaySnapshot;
  selectedFeatures?: CandidateActionFeatureSnapshot;
  selectedMahjongWish?: MahjongWishMetadata;
  selectedTichuCall?: TichuCallMetadata;
  selectedPassReductionV1?: PassReductionV1;
  selectedTichuAggressionV1?: TichuAggressionV1;
  selectedGrandTichuAggressionV1?: GrandTichuAggressionV1;
  selectedAggressionContextV1?: AggressionContextV1;
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
  mahjongWish?: MahjongWishMetadata;
  tichuCall?: TichuCallMetadata;
  pass_reduction_v1?: PassReductionV1;
  tichu_aggression_v1?: TichuAggressionV1;
  grand_tichu_aggression_v1?: GrandTichuAggressionV1;
  aggression_context_v1?: AggressionContextV1;
};

export type TichuCallMetadata = {
  tichu_call_score: number;
  tichu_call_threshold: number;
  tichu_call_reason: string;
  tichu_call_risk_flags: string[];
  tichu_call_confidence: number;
  tichu_call_decision: "call" | "decline";
  tichu_call_type: "tichu" | "grand_tichu";
  hand_quality_score: number;
  control_score: number;
  exit_path_score: number;
  fragmentation_penalty: number;
  premium_card_score: number;
  bomb_score: number;
  low_card_burden: number;
  combo_coherence_score: number;
  lead_recovery_score: number;
  partner_context_score: number;
  opponent_pressure_score: number;
  score_context_score: number;
  predicted_exit_steps: number;
  predicted_control_recoveries: number;
  predicted_loser_groups: number;
  predicted_winner_groups: number;
  predicted_deadwood_count: number;
  predicted_needs_partner_help: boolean;
  first_out_probability_proxy: number;
  grand_tichu_call_score: number | null;
  grand_tichu_call_threshold: number | null;
  grand_tichu_call_reason: string | null;
  grand_tichu_risk_flags: string[];
  grand_tichu_premium_count: number | null;
  grand_tichu_unknown_card_risk: number | null;
  grand_tichu_first8_exit_proxy: number | null;
  tichu_context_notes: string[];
  tichu_call_selected: boolean;
  tichu_call_kind: "regular" | "grand";
};

export type MahjongWishSkippedReason =
  | "no_strategic_wish"
  | "avoid_helping_opponents"
  | "all_wishes_low_value"
  | "rules_variant_allows_no_wish";

export type MahjongWishReason =
  | "sabotage_tichu_caller"
  | "sabotage_grand_tichu_caller"
  | "passed_to_tichu_caller"
  | "passed_to_grand_tichu_caller"
  | "break_sequence"
  | "drain_control"
  | "support_partner_tichu"
  | "support_partner_grand_tichu"
  | "passed_to_left"
  | "passed_to_partner"
  | "passed_to_right"
  | "hand_pressure"
  | "control_rank"
  | "default_lowest_safe"
  | "default_safe_pressure"
  | "skipped";

export type PassMemoryTarget = "left" | "partner" | "right";

export type MahjongWishMetadata = {
  mahjong_played: boolean;
  mahjong_wish_available: boolean;
  mahjong_wish_selected: boolean;
  mahjong_wish_skipped_reason: MahjongWishSkippedReason | null;
  wish_reason: MahjongWishReason;
  wish_target_seat: SeatId | null;
  wish_target_team: TeamId | null;
  wish_rank_source_card_id: string | null;
  wish_rank_source_target: PassMemoryTarget | null;
  wish_considered_tichu_pressure: boolean;
  wish_considered_grand_tichu_pressure: boolean;
  cards_passed_left: string[];
  cards_passed_partner: string[];
  cards_passed_right: string[];
  cards_received_from_left: string[];
  cards_received_from_partner: string[];
  cards_received_from_right: string[];
  wish_rank_candidates: Array<{
    rank: StandardRank;
    score: number;
    reason: MahjongWishReason;
    targetSeat: SeatId | null;
    sourceCardId: string | null;
    sourceTarget: PassMemoryTarget | null;
  }>;
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
