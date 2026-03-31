export const SEAT_IDS = ["seat-0", "seat-1", "seat-2", "seat-3"] as const;
export const SYSTEM_ACTOR = "system" as const;
export const SUITS = ["jade", "sword", "pagoda", "star"] as const;
export const STANDARD_RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

export type SeatId = (typeof SEAT_IDS)[number];
export type ActorId = SeatId | typeof SYSTEM_ACTOR;
export type TeamId = "team-0" | "team-1";
export type Suit = (typeof SUITS)[number];
export type StandardRank = (typeof STANDARD_RANKS)[number];
export type StraightRank = 1 | StandardRank;
export type PhoenixRank = StandardRank;
export type SpecialCard = "mahjong" | "dog" | "phoenix" | "dragon";
export type RoundPhase =
  | "shuffle"
  | "deal8"
  | "grand_tichu_window"
  | "complete_deal"
  | "pass_select"
  | "pass_reveal"
  | "exchange_complete"
  | "trick_play"
  | "round_scoring"
  | "finished";

export type StandardCard = {
  id: string;
  kind: "standard";
  suit: Suit;
  rank: StandardRank;
};

export type SpecialCardModel = {
  id: SpecialCard;
  kind: "special";
  special: SpecialCard;
};

export type Card = StandardCard | SpecialCardModel;

export type CombinationKind =
  | "dog"
  | "single"
  | "pair"
  | "trio"
  | "full-house"
  | "straight"
  | "pair-sequence"
  | "bomb-four-kind"
  | "bomb-straight";

export type Combination = {
  key: string;
  kind: CombinationKind;
  cardIds: string[];
  primaryRank: number;
  cardCount: number;
  phoenixAsRank: PhoenixRank | null;
  containsMahjong: boolean;
  containsDragon: boolean;
  containsPhoenix: boolean;
  containsDog: boolean;
  actualRanks: StraightRank[];
  pairCount: number | null;
  isBomb: boolean;
};

export type TrickEntry =
  | {
      type: "play";
      seat: SeatId;
      combination: Combination;
    }
  | {
      type: "pass";
      seat: SeatId;
    };

export type TrickState = {
  leader: SeatId;
  currentWinner: SeatId;
  currentCombination: Combination;
  entries: TrickEntry[];
  passingSeats: SeatId[];
};

export type PassSelection = {
  left: string;
  partner: string;
  right: string;
};

export type CallState = {
  grandTichu: boolean;
  smallTichu: boolean;
  hasPlayedFirstCard: boolean;
};

export type DragonGiftState = {
  winner: SeatId;
  trickCards: Card[];
  nextLeader: SeatId | null;
  roundEndsAfterGift: boolean;
};

export type RoundScoreSummary = {
  teamScores: Record<TeamId, number>;
  finishOrder: SeatId[];
  doubleVictory: TeamId | null;
  tichuBonuses: Array<{
    seat: SeatId;
    team: TeamId;
    label: "small" | "grand";
    amount: number;
  }>;
};

export type GameState = {
  seed: string;
  phase: RoundPhase;
  shuffledDeck: Card[];
  deckIndex: number;
  hands: Record<SeatId, Card[]>;
  activeSeat: SeatId | null;
  currentWish: StandardRank | null;
  calls: Record<SeatId, CallState>;
  grandTichuQueue: SeatId[];
  passSelections: Partial<Record<SeatId, PassSelection>>;
  revealedPasses: Partial<Record<SeatId, PassSelection>>;
  currentTrick: TrickState | null;
  collectedCards: Record<SeatId, Card[]>;
  finishedOrder: SeatId[];
  pendingDragonGift: DragonGiftState | null;
  roundSummary: RoundScoreSummary | null;
  matchScore: Record<TeamId, number>;
};

export type EngineEvent = {
  type: string;
  detail?: string;
};

export type PlayCardsAction = {
  type: "play_cards";
  seat: SeatId;
  cardIds: string[];
  phoenixAsRank?: PhoenixRank;
  wishRank?: StandardRank;
};

export type EngineAction =
  | {
      type: "call_grand_tichu";
      seat: SeatId;
    }
  | {
      type: "decline_grand_tichu";
      seat: SeatId;
    }
  | {
      type: "call_tichu";
      seat: SeatId;
    }
  | {
      type: "select_pass";
      seat: SeatId;
      left: string;
      partner: string;
      right: string;
    }
  | {
      type: "advance_phase";
      actor: typeof SYSTEM_ACTOR;
    }
  | PlayCardsAction
  | {
      type: "pass_turn";
      seat: SeatId;
    }
  | {
      type: "assign_dragon_trick";
      seat: SeatId;
      recipient: SeatId;
    };

export type LegalAction =
  | {
      type: "call_grand_tichu";
      seat: SeatId;
    }
  | {
      type: "decline_grand_tichu";
      seat: SeatId;
    }
  | {
      type: "call_tichu";
      seat: SeatId;
    }
  | {
      type: "select_pass";
      seat: SeatId;
      availableCardIds: string[];
      requiredTargets: ["left", "partner", "right"];
    }
  | {
      type: "advance_phase";
      actor: typeof SYSTEM_ACTOR;
    }
  | (PlayCardsAction & {
      combination: Combination;
      availableWishRanks?: StandardRank[];
    })
  | {
      type: "pass_turn";
      seat: SeatId;
    }
  | {
      type: "assign_dragon_trick";
      seat: SeatId;
      recipient: SeatId;
    };

export type LegalActionMap = Partial<Record<ActorId, LegalAction[]>>;

export type PublicDerivedState = {
  phase: RoundPhase;
  activeSeat: SeatId | null;
  handCounts: Record<SeatId, number>;
  currentWish: StandardRank | null;
  calls: Record<SeatId, CallState>;
  finishedOrder: SeatId[];
  currentTrick: {
    leader: SeatId;
    currentWinner: SeatId;
    currentCombination: Combination;
    entries: TrickEntry[];
  } | null;
  matchScore: Record<TeamId, number>;
  pendingDragonGift: DragonGiftState | null;
  roundSummary: RoundScoreSummary | null;
};

export type EngineResult = {
  nextState: GameState;
  events: EngineEvent[];
  legalActions: LegalActionMap;
  derivedView: PublicDerivedState;
};
