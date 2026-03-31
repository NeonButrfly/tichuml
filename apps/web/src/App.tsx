import { startTransition, useEffect, useState } from "react";
import { heuristicsV1Policy, type ChosenDecision } from "@tichuml/ai-heuristics";
import {
  applyEngineAction,
  createInitialGameState,
  getLeftSeat,
  getPartnerSeat,
  getRightSeat,
  SYSTEM_ACTOR,
  type ActorId,
  type Card,
  type EngineAction,
  type EngineEvent,
  type EngineResult,
  type LegalAction,
  type SeatId,
  type StandardRank
} from "@tichuml/engine";
import {
  LOCAL_SEAT,
  PASS_TARGETS,
  buildPlayVariantKey,
  collectLocalLegalCardIds,
  createRoundSeed,
  findMatchingPlayActions,
  getPrimaryActorFromResult,
  sortCardsForHand,
  type HandSortMode,
  type PassTarget,
  type PlayLegalAction
} from "./table-model";

const AI_STEP_DELAY_MS = 420;
const SYSTEM_STEP_DELAY_MS = 180;
const INITIAL_SEED_INDEX = 1;
const SEAT_LAYOUT: Array<{
  seat: SeatId;
  className: string;
  title: string;
  relation: string;
}> = [
  { seat: "seat-2", className: "seat seat--top", title: "Seat 2", relation: "Partner" },
  { seat: "seat-3", className: "seat seat--left", title: "Seat 3", relation: "Left Opponent" },
  { seat: "seat-1", className: "seat seat--right", title: "Seat 1", relation: "Right Opponent" },
  { seat: "seat-0", className: "seat seat--bottom", title: "Seat 0", relation: "You" }
];

function formatRank(rank: number): string {
  switch (rank) {
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
    case 14:
      return "A";
    default:
      return String(rank);
  }
}

function formatSuitName(card: Extract<Card, { kind: "standard" }>): string {
  switch (card.suit) {
    case "jade":
      return "Jade";
    case "sword":
      return "Sword";
    case "pagoda":
      return "Pagoda";
    case "star":
      return "Star";
  }
}

function formatSeatShort(seat: SeatId): string {
  switch (seat) {
    case "seat-0":
      return "You";
    case "seat-1":
      return "Seat 1";
    case "seat-2":
      return "Seat 2";
    case "seat-3":
      return "Seat 3";
  }
}

function formatActorLabel(actor: ActorId): string {
  return actor === SYSTEM_ACTOR ? "System" : formatSeatShort(actor);
}

function formatCombinationKind(kind: string): string {
  switch (kind) {
    case "pair-sequence":
      return "Pair Sequence";
    case "full-house":
      return "Full House";
    case "bomb-four-kind":
      return "Four of a Kind Bomb";
    case "bomb-straight":
      return "Straight Bomb";
    default:
      return kind
        .split("-")
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(" ");
  }
}

function formatPlacement(index: number): string {
  switch (index) {
    case 0:
      return "1st out";
    case 1:
      return "2nd out";
    case 2:
      return "3rd out";
    case 3:
      return "4th out";
    default:
      return `${index + 1}th out`;
  }
}

function formatEvent(event: EngineEvent): string {
  switch (event.type) {
    case "shuffle_completed":
      return "Deck shuffled from deterministic seed.";
    case "deal8_completed":
      return "Opening eight cards dealt to every seat.";
    case "grand_tichu_called":
      return `${formatSeatShort(event.detail as SeatId)} called Grand Tichu.`;
    case "grand_tichu_declined":
      return `${formatSeatShort(event.detail as SeatId)} passed on Grand Tichu.`;
    case "complete_deal":
      return "Final six cards dealt to every seat.";
    case "pass_selected":
      return `${formatSeatShort(event.detail as SeatId)} locked in a pass lane.`;
    case "passes_revealed":
      return "Pass selections revealed across the table.";
    case "exchange_completed":
      return "Exchange complete. Trick play is live.";
    case "cards_played":
      return `${formatSeatShort((event.detail ?? "").split(":")[0] as SeatId)} played a combination.`;
    case "seat_passed":
      return `${formatSeatShort(event.detail as SeatId)} passed.`;
    case "dog_led":
      return `${formatSeatShort(event.detail as SeatId)} led Dog to partner.`;
    case "dragon_gift_pending":
      return `${formatSeatShort(event.detail as SeatId)} must assign the Dragon trick.`;
    case "tichu_called":
      return `${formatSeatShort(event.detail as SeatId)} called Tichu.`;
    case "trick_resolved":
      return "The trick resolved and control moved to the winner.";
    case "round_scored":
      return "Round scoring completed.";
    case "phase_changed":
      return `Phase changed to ${event.detail}.`;
    default:
      return event.detail ? `${event.type}: ${event.detail}` : event.type;
  }
}

function describeAction(action: LegalAction | EngineAction): string {
  switch (action.type) {
    case "call_grand_tichu":
      return "Grand Tichu";
    case "decline_grand_tichu":
      return "Continue";
    case "call_tichu":
      return "Tichu";
    case "select_pass":
      return "Confirm Pass";
    case "advance_phase":
      return "Advance Phase";
    case "pass_turn":
      return "Pass";
    case "assign_dragon_trick":
      return `Gift Dragon to ${formatSeatShort(action.recipient)}`;
    case "play_cards":
      if ("combination" in action) {
        return `${formatCombinationKind(action.combination.kind)} (${action.cardIds.length})`;
      }
      return `Play ${action.cardIds.join(", ")}`;
  }
}

function createActorOnlyLegalActions(result: EngineResult, actor: ActorId) {
  const actorOnly = {} as EngineResult["legalActions"];
  actorOnly[actor] = result.legalActions[actor] ?? [];
  return actorOnly;
}

function getCardClassName(card: Card): string {
  if (card.kind === "special") {
    return `playing-card playing-card--special playing-card--${card.special}`;
  }

  return `playing-card playing-card--${card.suit}`;
}

function findNextEmptyPassTarget(draft: Partial<Record<PassTarget, string>>): PassTarget | null {
  return PASS_TARGETS.find((target) => !draft[target]) ?? null;
}

function handCardFromId(cardId: string): Card {
  if (cardId === "mahjong" || cardId === "dog" || cardId === "phoenix" || cardId === "dragon") {
    return {
      id: cardId,
      kind: "special",
      special: cardId
    };
  }

  const [suit, rank] = cardId.split("-");

  return {
    id: cardId,
    kind: "standard",
    suit: suit as Extract<Card, { kind: "standard" }>["suit"],
    rank: Number(rank) as StandardRank
  };
}

function SeatCountPreview({ count }: { count: number }) {
  return (
    <div className="seat-count-preview" aria-hidden="true">
      {Array.from({ length: Math.min(count, 8) }).map((_, index) => (
        <span key={index} className="seat-count-preview__card" />
      ))}
    </div>
  );
}

function PlayingCard({
  card,
  interactive,
  legal,
  selected,
  onClick
}: {
  card: Card;
  interactive: boolean;
  legal: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        getCardClassName(card),
        legal ? "playing-card--legal" : "playing-card--muted",
        selected ? "playing-card--selected" : "",
        interactive ? "" : "playing-card--static"
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={!interactive}
    >
      {card.kind === "standard" ? (
        <>
          <span className="playing-card__rank">{formatRank(card.rank)}</span>
          <span className="playing-card__suit">{formatSuitName(card)}</span>
        </>
      ) : (
        <>
          <span className="playing-card__rank playing-card__rank--special">{card.special}</span>
          <span className="playing-card__suit">special</span>
        </>
      )}
    </button>
  );
}

export function App() {
  const [seedIndex, setSeedIndex] = useState(INITIAL_SEED_INDEX);
  const [round, setRound] = useState<EngineResult>(() => createInitialGameState(createRoundSeed(INITIAL_SEED_INDEX)));
  const [decisionCount, setDecisionCount] = useState(0);
  const [debugOpen, setDebugOpen] = useState(true);
  const [autoplayLocal, setAutoplayLocal] = useState(false);
  const [thinkingActor, setThinkingActor] = useState<ActorId | null>(null);
  const [lastAiDecision, setLastAiDecision] = useState<ChosenDecision | null>(null);
  const [recentEvents, setRecentEvents] = useState<string[]>(() =>
    createInitialGameState(createRoundSeed(INITIAL_SEED_INDEX)).events.map(formatEvent)
  );
  const [sortMode, setSortMode] = useState<HandSortMode>("rank");
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedVariantKey, setSelectedVariantKey] = useState<string | null>(null);
  const [selectedWishRank, setSelectedWishRank] = useState<StandardRank | null>(null);
  const [selectedPassTarget, setSelectedPassTarget] = useState<PassTarget>("left");
  const [passDraft, setPassDraft] = useState<Partial<Record<PassTarget, string>>>({});

  const state = round.nextState;
  const derived = round.derivedView;
  const primaryActor = getPrimaryActorFromResult(round);
  const localActions = round.legalActions[LOCAL_SEAT] ?? [];
  const localPlayActions = localActions.filter(
    (action): action is PlayLegalAction => action.type === "play_cards"
  );
  const localPassSelection = localActions.find((action) => action.type === "select_pass");
  const localPassAction = localActions.find((action) => action.type === "pass_turn");
  const localGrandTichuAction = localActions.find((action) => action.type === "call_grand_tichu");
  const localDeclineGrandTichuAction = localActions.find((action) => action.type === "decline_grand_tichu");
  const localCallTichuAction = localActions.find((action) => action.type === "call_tichu");
  const localLegalCardIds = collectLocalLegalCardIds(localActions);
  const matchingPlayActions = findMatchingPlayActions(localPlayActions, selectedCardIds);
  const activePlayVariant =
    matchingPlayActions.find((action) => buildPlayVariantKey(action) === selectedVariantKey) ??
    matchingPlayActions[0] ??
    null;
  const resolvedWishRank =
    activePlayVariant?.availableWishRanks?.includes(selectedWishRank ?? -1)
      ? selectedWishRank
      : activePlayVariant?.availableWishRanks?.at(-1) ?? null;
  const sortedLocalHand = sortCardsForHand(state.hands[LOCAL_SEAT], sortMode, localPlayActions);
  const roundSeed = createRoundSeed(seedIndex);
  const localIsPrimaryActor = primaryActor === LOCAL_SEAT;
  const localHasOptionalAction = primaryActor !== LOCAL_SEAT && localActions.length > 0;
  const localCanInteract = localIsPrimaryActor || localHasOptionalAction || autoplayLocal;
  const localActionSummary = localActions.map(describeAction);

  useEffect(() => {
    if (state.phase === "finished") {
      setThinkingActor(null);
      return;
    }

    if (!primaryActor) {
      setThinkingActor(null);
      return;
    }

    if (!autoplayLocal && (localIsPrimaryActor || localHasOptionalAction)) {
      setThinkingActor(null);
      return;
    }

    const delay = primaryActor === SYSTEM_ACTOR ? SYSTEM_STEP_DELAY_MS : AI_STEP_DELAY_MS;
    setThinkingActor(primaryActor);

    const timeout = window.setTimeout(() => {
      const chosen = autoplayLocal
        ? heuristicsV1Policy.chooseAction({
            state: round.nextState,
            legalActions: round.legalActions
          })
        : heuristicsV1Policy.chooseAction({
            state: round.nextState,
            legalActions: createActorOnlyLegalActions(round, primaryActor)
          });

      const nextResult = applyEngineAction(round.nextState, chosen.action);

      startTransition(() => {
        setRound(nextResult);
        setDecisionCount((current) => current + 1);
        setRecentEvents((current) => [...current, ...nextResult.events.map(formatEvent)].slice(-14));
        setSelectedCardIds([]);
        setSelectedVariantKey(null);
        setSelectedWishRank(null);
        if (chosen.actor !== SYSTEM_ACTOR) {
          setLastAiDecision(chosen);
        }
        if (nextResult.nextState.phase !== "pass_select") {
          setPassDraft({});
          setSelectedPassTarget("left");
        }
      });
    }, delay);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [autoplayLocal, localHasOptionalAction, localIsPrimaryActor, primaryActor, round, state.phase]);

  function resetInteractionState() {
    setSelectedCardIds([]);
    setSelectedVariantKey(null);
    setSelectedWishRank(null);
    setPassDraft({});
    setSelectedPassTarget("left");
  }

  function applyClientAction(action: EngineAction, chosen?: ChosenDecision) {
    const nextResult = applyEngineAction(state, action);

    startTransition(() => {
      setRound(nextResult);
      setDecisionCount((current) => current + 1);
      setRecentEvents((current) => [...current, ...nextResult.events.map(formatEvent)].slice(-14));
      if (chosen && chosen.actor !== SYSTEM_ACTOR) {
        setLastAiDecision(chosen);
      }
      resetInteractionState();
    });
  }

  function startNextRound() {
    const nextSeedIndex = seedIndex + 1;
    const nextSeed = createRoundSeed(nextSeedIndex);
    const nextRound = createInitialGameState(nextSeed);

    startTransition(() => {
      setSeedIndex(nextSeedIndex);
      setRound(nextRound);
      setDecisionCount(0);
      setThinkingActor(null);
      setLastAiDecision(null);
      setRecentEvents(nextRound.events.map(formatEvent));
      setSortMode("rank");
      resetInteractionState();
    });
  }

  function continueWithAi() {
    if (!primaryActor || primaryActor === LOCAL_SEAT) {
      return;
    }

    const chosen = heuristicsV1Policy.chooseAction({
      state,
      legalActions: createActorOnlyLegalActions(round, primaryActor)
    });

    applyClientAction(chosen.action, chosen);
  }

  function playSelectedCards() {
    if (!activePlayVariant) {
      return;
    }

    const action: EngineAction = {
      type: "play_cards",
      seat: LOCAL_SEAT,
      cardIds: activePlayVariant.cardIds,
      ...(activePlayVariant.phoenixAsRank !== undefined
        ? { phoenixAsRank: activePlayVariant.phoenixAsRank }
        : {}),
      ...(resolvedWishRank !== null ? { wishRank: resolvedWishRank } : {})
    };

    applyClientAction(action);
  }

  function confirmPassSelection() {
    if (
      !localPassSelection ||
      !passDraft.left ||
      !passDraft.partner ||
      !passDraft.right ||
      new Set(Object.values(passDraft)).size !== 3
    ) {
      return;
    }

    applyClientAction({
      type: "select_pass",
      seat: LOCAL_SEAT,
      left: passDraft.left,
      partner: passDraft.partner,
      right: passDraft.right
    });
  }

  function handleLocalCardClick(cardId: string) {
    if (!localCanInteract) {
      return;
    }

    if (localPassSelection) {
      setPassDraft((current) => {
        const nextDraft: Partial<Record<PassTarget, string>> = {};

        for (const target of PASS_TARGETS) {
          const existingCardId = current[target];
          if (existingCardId && existingCardId !== cardId) {
            nextDraft[target] = existingCardId;
          }
        }

        if (current[selectedPassTarget] === cardId) {
          return nextDraft;
        }

        nextDraft[selectedPassTarget] = cardId;
        const nextEmptyTarget = findNextEmptyPassTarget(nextDraft);
        if (nextEmptyTarget) {
          setSelectedPassTarget(nextEmptyTarget);
        }
        return nextDraft;
      });
      return;
    }

    setSelectedCardIds((current) => {
      const nextSelection = current.includes(cardId)
        ? current.filter((selectedId) => selectedId !== cardId)
        : [...current, cardId];

      const sortedSelection = sortedLocalHand
        .map((card) => card.id)
        .filter((candidateId) => nextSelection.includes(candidateId));

      setSelectedVariantKey(null);
      setSelectedWishRank(null);
      return sortedSelection;
    });
  }

  const passSelectionReady =
    Boolean(passDraft.left) &&
    Boolean(passDraft.partner) &&
    Boolean(passDraft.right) &&
    new Set(Object.values(passDraft)).size === 3;

  const controlHint =
    state.phase === "finished"
      ? "Round complete. Start the next seed or inspect the result summary."
      : localPassSelection
        ? "Assign one card to left, partner, and right. The UI only accepts cards surfaced by the engine."
        : localIsPrimaryActor
          ? "Your seat has priority. All available controls come directly from engine legality."
          : localHasOptionalAction
            ? `${formatActorLabel(primaryActor ?? SYSTEM_ACTOR)} has priority, but you can still use any local interrupt the engine exposes.`
            : thinkingActor
              ? `${formatActorLabel(thinkingActor)} is thinking.`
              : "The table will continue automatically until your seat or an optional local response is available.";

  const localSummaryText =
    localActionSummary.length > 0
      ? localActionSummary.join(" • ")
      : "No local action is available from the engine right now.";

  return (
    <main className="tabletop-app">
      <header className="topbar">
        <div className="topbar__intro">
          <p className="topbar__eyebrow">TichuML Milestone 4</p>
          <h1>Authoritative Table Preview</h1>
          <p className="topbar__summary">
            The browser client renders seats, hand interaction, trick progression, and phase-aware
            controls on top of the deterministic engine core.
          </p>
        </div>

        <div className="topbar__status-grid">
          <section className="status-card">
            <span className="status-card__label">Seed</span>
            <strong>{roundSeed}</strong>
            <small>{decisionCount} engine decisions applied</small>
          </section>
          <section className="status-card">
            <span className="status-card__label">Phase</span>
            <strong>{derived.phase}</strong>
            <small>{controlHint}</small>
          </section>
          <section className="status-card">
            <span className="status-card__label">Scoreboard</span>
            <strong>
              Team 0 {derived.matchScore["team-0"]} : {derived.matchScore["team-1"]} Team 1
            </strong>
            <small>Single-round preview, ready for server orchestration next.</small>
          </section>
        </div>

        <div className="topbar__controls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoplayLocal}
              onChange={(event) => setAutoplayLocal(event.target.checked)}
            />
            <span>Autoplay local seat</span>
          </label>

          <button type="button" className="utility-button" onClick={() => setDebugOpen((open) => !open)}>
            {debugOpen ? "Hide Debug" : "Show Debug"}
          </button>
          <button type="button" className="utility-button utility-button--primary" onClick={startNextRound}>
            New Round
          </button>
        </div>
      </header>

      <div className={debugOpen ? "workspace workspace--debug" : "workspace"}>
        <section className="table-stage">
          <div className="table-surface">
            {SEAT_LAYOUT.map(({ seat, className, title, relation }) => {
              const callState = derived.calls[seat];
              const handCount = derived.handCounts[seat];
              const passReady = state.passSelections[seat] || state.revealedPasses[seat];
              const finishIndex = state.finishedOrder.indexOf(seat);
              const isLocalSeat = seat === LOCAL_SEAT;
              const isPrimarySeat = primaryActor === seat;
              const isThinkingSeat = thinkingActor === seat;
              const handCards = state.hands[seat];

              return (
                <article
                  key={seat}
                  className={[
                    className,
                    isLocalSeat ? "seat--local" : "",
                    isPrimarySeat ? "seat--active" : "",
                    isThinkingSeat ? "seat--thinking" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="seat__header">
                    <div>
                      <p className="seat__title">{title}</p>
                      <strong className="seat__relation">{relation}</strong>
                    </div>
                    <span className="seat__count">{handCount} cards</span>
                  </div>

                  <div className="seat__flags">
                    {callState.grandTichu && <span className="seat-chip seat-chip--alert">Grand Tichu</span>}
                    {callState.smallTichu && <span className="seat-chip seat-chip--accent">Tichu</span>}
                    {isPrimarySeat && <span className="seat-chip seat-chip--turn">Priority</span>}
                    {isThinkingSeat && <span className="seat-chip seat-chip--soft">Thinking</span>}
                    {passReady && <span className="seat-chip seat-chip--soft">Pass Ready</span>}
                    {finishIndex >= 0 && <span className="seat-chip seat-chip--success">{formatPlacement(finishIndex)}</span>}
                  </div>

                  {isLocalSeat ? (
                    <div className="local-hand">
                      <div className="local-hand__toolbar">
                        <div className="segment-control" aria-label="Sort local hand">
                          {(["rank", "suit", "combo"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              className={mode === sortMode ? "segment-control__button is-active" : "segment-control__button"}
                              onClick={() => setSortMode(mode)}
                            >
                              {mode === "combo" ? "Combo" : mode.charAt(0).toUpperCase() + mode.slice(1)}
                            </button>
                          ))}
                        </div>
                        <small>{localSummaryText}</small>
                      </div>

                      <div className="local-hand__cards">
                        {sortedLocalHand.map((card) => {
                          const selected =
                            selectedCardIds.includes(card.id) ||
                            Object.values(passDraft).includes(card.id);

                          return (
                            <PlayingCard
                              key={card.id}
                              card={card}
                              interactive={localCanInteract}
                              legal={localLegalCardIds.has(card.id)}
                              selected={selected}
                              onClick={() => handleLocalCardClick(card.id)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="seat__body">
                      <SeatCountPreview count={handCards.length} />
                    </div>
                  )}
                </article>
              );
            })}

            <section className="trick-well">
              <div className="trick-well__header">
                <div>
                  <p className="trick-well__eyebrow">Center Trick Stack</p>
                  <h2>{derived.currentTrick ? "Live Trick" : "Table State"}</h2>
                </div>
                {derived.currentWish !== null && <span className="wish-chip">Wish: {formatRank(derived.currentWish)}</span>}
              </div>

              {derived.currentTrick ? (
                <>
                  <div className="trick-well__summary">
                    <span>Leader: {formatSeatShort(derived.currentTrick.leader)}</span>
                    <span>Winner: {formatSeatShort(derived.currentTrick.currentWinner)}</span>
                    <span>{formatCombinationKind(derived.currentTrick.currentCombination.kind)}</span>
                  </div>
                  <ol className="trick-log">
                    {derived.currentTrick.entries.map((entry, index) => (
                      <li
                        key={`${entry.seat}-${index}`}
                        className={
                          entry.type === "play" && entry.seat === derived.currentTrick?.currentWinner
                            ? "trick-log__entry is-winning"
                            : "trick-log__entry"
                        }
                      >
                        <header className="trick-log__meta">
                          <strong>{formatSeatShort(entry.seat)}</strong>
                          <span>{entry.type === "pass" ? "Pass" : formatCombinationKind(entry.combination.kind)}</span>
                        </header>
                        {entry.type === "play" ? (
                          <div className="trick-log__cards">
                            {entry.combination.cardIds.map((cardId) => {
                              const card =
                                state.shuffledDeck.find((candidate) => candidate.id === cardId) ?? handCardFromId(cardId);
                              return (
                                <div key={cardId} className={`${getCardClassName(card)} playing-card playing-card--mini`}>
                                  {card.kind === "standard" ? formatRank(card.rank) : card.special}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="trick-log__pass-note">Stayed out of the current battle.</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              ) : state.pendingDragonGift ? (
                <div className="trick-placeholder">
                  <strong>Dragon gift pending</strong>
                  <p>
                    {formatSeatShort(state.pendingDragonGift.winner)} must pass the trick to an opponent before play can
                    continue.
                  </p>
                </div>
              ) : state.phase === "finished" && state.roundSummary ? (
                <div className="round-summary">
                  <h3>Round Summary</h3>
                  <p>
                    Finish order: {state.roundSummary.finishOrder.map((seat) => formatSeatShort(seat)).join(" -> ")}
                  </p>
                  <p>
                    Team 0 {state.roundSummary.teamScores["team-0"]} | Team 1{" "}
                    {state.roundSummary.teamScores["team-1"]}
                  </p>
                  {state.roundSummary.doubleVictory && <p>{state.roundSummary.doubleVictory} scored a double victory.</p>}
                  {state.roundSummary.tichuBonuses.length > 0 && (
                    <ul className="bonus-list">
                      {state.roundSummary.tichuBonuses.map((bonus) => (
                        <li key={`${bonus.seat}-${bonus.label}`}>
                          {formatSeatShort(bonus.seat)} {bonus.label} {bonus.amount > 0 ? `+${bonus.amount}` : bonus.amount}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="trick-placeholder">
                  <strong>{derived.phase}</strong>
                  <p>{controlHint}</p>
                </div>
              )}
            </section>
          </div>

          <section className="action-dock">
            <div className="action-dock__header">
              <div>
                <p className="action-dock__eyebrow">Action Rail</p>
                <h2>Local Controls</h2>
              </div>
              <span className="action-dock__phase">{derived.phase}</span>
            </div>

            {localPassSelection && (
              <div className="pass-lanes">
                {PASS_TARGETS.map((target) => {
                  const targetSeat =
                    target === "left"
                      ? getLeftSeat(LOCAL_SEAT)
                      : target === "partner"
                        ? getPartnerSeat(LOCAL_SEAT)
                        : getRightSeat(LOCAL_SEAT);
                  const assignedCardId = passDraft[target];

                  return (
                    <button
                      key={target}
                      type="button"
                      className={target === selectedPassTarget ? "pass-lane is-selected" : "pass-lane"}
                      onClick={() => setSelectedPassTarget(target)}
                    >
                      <span className="pass-lane__label">
                        {`${target} -> ${formatSeatShort(targetSeat)}`}
                      </span>
                      <strong>{assignedCardId ?? "Pick a card"}</strong>
                    </button>
                  );
                })}
              </div>
            )}

            {matchingPlayActions.length > 1 && (
              <div className="variant-row">
                {matchingPlayActions.map((action) => {
                  const key = buildPlayVariantKey(action);
                  const activeKey = activePlayVariant ? buildPlayVariantKey(activePlayVariant) : key;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={key === activeKey ? "variant-pill is-active" : "variant-pill"}
                      onClick={() => setSelectedVariantKey(key)}
                    >
                      {formatCombinationKind(action.combination.kind)}
                      {action.phoenixAsRank ? ` as ${formatRank(action.phoenixAsRank)}` : ""}
                    </button>
                  );
                })}
              </div>
            )}

            {activePlayVariant?.availableWishRanks && (
              <div className="wish-picker">
                <p>Mahjong wish</p>
                <div className="wish-picker__options">
                  {activePlayVariant.availableWishRanks.map((rank) => (
                    <button
                      key={rank}
                      type="button"
                      className={rank === resolvedWishRank ? "wish-chip wish-chip--active" : "wish-chip"}
                      onClick={() => setSelectedWishRank(rank)}
                    >
                      {formatRank(rank)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="action-buttons">
              {localGrandTichuAction && (
                <button type="button" className="action-button action-button--primary" onClick={() => applyClientAction(localGrandTichuAction)}>
                  Grand Tichu
                </button>
              )}
              {localDeclineGrandTichuAction && (
                <button type="button" className="action-button" onClick={() => applyClientAction(localDeclineGrandTichuAction)}>
                  Continue
                </button>
              )}
              {localCallTichuAction && (
                <button type="button" className="action-button action-button--accent" onClick={() => applyClientAction(localCallTichuAction)}>
                  Tichu
                </button>
              )}
              {localPassSelection && (
                <button
                  type="button"
                  className="action-button action-button--primary"
                  onClick={confirmPassSelection}
                  disabled={!passSelectionReady}
                >
                  Confirm Pass
                </button>
              )}
              {activePlayVariant && (
                <button type="button" className="action-button action-button--primary" onClick={playSelectedCards}>
                  Play Selected
                </button>
              )}
              {localPassAction && localIsPrimaryActor && (
                <button type="button" className="action-button" onClick={() => applyClientAction(localPassAction)}>
                  Pass
                </button>
              )}
              {state.pendingDragonGift &&
                primaryActor === LOCAL_SEAT &&
                localActions
                  .filter((action) => action.type === "assign_dragon_trick")
                  .map((action) => (
                    <button
                      key={action.recipient}
                      type="button"
                      className="action-button"
                      onClick={() => applyClientAction(action)}
                    >
                      Gift Dragon to {formatSeatShort(action.recipient)}
                    </button>
                  ))}
              {primaryActor && primaryActor !== LOCAL_SEAT && (
                <button type="button" className="action-button" onClick={continueWithAi}>
                  Continue AI
                </button>
              )}
            </div>

            <p className="action-dock__hint">{controlHint}</p>
          </section>
        </section>

        {debugOpen && (
          <aside className="debug-drawer">
            <section className="debug-panel">
              <p className="debug-panel__eyebrow">Latest AI Rationale</p>
              {lastAiDecision ? (
                <>
                  <h2>{formatActorLabel(lastAiDecision.actor)}</h2>
                  <p className="debug-panel__copy">{lastAiDecision.explanation.selectedReasonSummary.join(" ")}</p>
                  <ol className="candidate-list">
                    {lastAiDecision.explanation.candidateScores.slice(0, 5).map((candidate, index) => (
                      <li key={`${candidate.score}-${index}`}>
                        <strong>{describeAction(candidate.action)}</strong>
                        <span>{candidate.score.toFixed(0)}</span>
                        <small>{candidate.reasons.join(" ")}</small>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="debug-panel__copy">AI rationale will appear here after the first automated decision.</p>
              )}
            </section>

            <section className="debug-panel">
              <p className="debug-panel__eyebrow">Local Legality</p>
              <h2>Action Surface</h2>
              <ul className="debug-list">
                {localActionSummary.length > 0 ? (
                  localActionSummary.map((summary) => <li key={summary}>{summary}</li>)
                ) : (
                  <li>No local legal actions right now.</li>
                )}
              </ul>
            </section>

            <section className="debug-panel">
              <p className="debug-panel__eyebrow">Recent Engine Events</p>
              <h2>Event Feed</h2>
              <ul className="debug-list">
                {recentEvents.slice(-8).reverse().map((eventText, index) => (
                  <li key={`${eventText}-${index}`}>{eventText}</li>
                ))}
              </ul>
            </section>
          </aside>
        )}
      </div>
    </main>
  );
}
