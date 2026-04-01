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
  type EngineAction,
  type EngineResult,
  type LegalAction,
  type SeatId,
  type StandardRank,
  type TrickEntry
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
import {
  createNormalActionRail,
  isDebugToggleShortcut,
  type NormalActionSlotId,
  type UiMode
} from "./game-table-view-model";
import {
  DEFAULT_NORMAL_TABLE_LAYOUT,
  DebugGameTableView,
  NormalGameTableView,
  describeAction,
  formatActorLabel,
  formatEvent,
  parseNormalTableLayoutText,
  type NormalTableLayout,
  type SeatVisualPosition
} from "./game-table-views";
import defaultLayoutXml from "./layout.xml?raw";

const AI_STEP_DELAY_MS = 420;
const SYSTEM_STEP_DELAY_MS = 180;
const INITIAL_SEED_INDEX = 1;
const SEAT_LAYOUT: Array<{
  seat: SeatId;
  position: SeatVisualPosition;
  title: string;
  relation: string;
}> = [
  { seat: "seat-2", position: "top", title: "NORTH", relation: "Partner" },
  { seat: "seat-3", position: "left", title: "WEST", relation: "Left Opponent" },
  { seat: "seat-1", position: "right", title: "EAST", relation: "Right Opponent" },
  { seat: "seat-0", position: "bottom", title: "SOUTH", relation: "You" }
];

function createActorOnlyLegalActions(result: EngineResult, actor: ActorId) {
  const actorOnly = {} as EngineResult["legalActions"];
  actorOnly[actor] = result.legalActions[actor] ?? [];
  return actorOnly;
}

function findNextEmptyPassTarget(draft: Partial<Record<PassTarget, string>>): PassTarget | null {
  return PASS_TARGETS.find((target) => !draft[target]) ?? null;
}

function isPlayTrickEntry(entry: TrickEntry): entry is Extract<TrickEntry, { type: "play" }> {
  return entry.type === "play";
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function collectStagedPassCardIds(selection?: Partial<Record<PassTarget, string>>) {
  return new Set(PASS_TARGETS.map((target) => selection?.[target]).filter((value): value is string => Boolean(value)));
}

export function App() {
  const [seedIndex, setSeedIndex] = useState(INITIAL_SEED_INDEX);
  const [round, setRound] = useState<EngineResult>(() => createInitialGameState(createRoundSeed(INITIAL_SEED_INDEX)));
  const [decisionCount, setDecisionCount] = useState(0);
  const [uiMode, setUiMode] = useState<UiMode>("normal");
  const [layoutEditorActive, setLayoutEditorActive] = useState(false);
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
  const [stagedTrick, setStagedTrick] = useState<EngineResult["derivedView"]["currentTrick"] | null>(null);
  const [normalTableLayout, setNormalTableLayout] = useState<NormalTableLayout>(
    () => parseNormalTableLayoutText(defaultLayoutXml) ?? DEFAULT_NORMAL_TABLE_LAYOUT
  );

  const state = round.nextState;
  const derived = round.derivedView;
  const primaryActor = getPrimaryActorFromResult(round);
  const roundSeed = createRoundSeed(seedIndex);
  const localActions = round.legalActions[LOCAL_SEAT] ?? [];
  const localPlayActions = localActions.filter(
    (action): action is PlayLegalAction => action.type === "play_cards"
  );
  const localPassSelection = localActions.find((action) => action.type === "select_pass");
  const localPassAction = localActions.find((action) => action.type === "pass_turn");
  const localGrandTichuAction = localActions.find((action) => action.type === "call_grand_tichu");
  const localDeclineGrandTichuAction = localActions.find((action) => action.type === "decline_grand_tichu");
  const localCallTichuAction = localActions.find((action) => action.type === "call_tichu");
  const localDragonActions = localActions.filter(
    (action): action is Extract<LegalAction, { type: "assign_dragon_trick" }> => action.type === "assign_dragon_trick"
  );
  const systemAdvanceAction =
    (round.legalActions[SYSTEM_ACTOR] ?? []).find(
      (action): action is Extract<LegalAction, { type: "advance_phase" }> => action.type === "advance_phase"
    ) ?? null;
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
  const localIsPrimaryActor = primaryActor === LOCAL_SEAT;
  const localHasOptionalAction = primaryActor !== LOCAL_SEAT && localActions.length > 0;
  const localCanInteract = localIsPrimaryActor || localHasOptionalAction || autoplayLocal;
  const localActionSummary = localActions.map(describeAction);
  const localSummaryText = localActionSummary.length > 0 ? localActionSummary.join(" • ") : "No local actions.";
  const displayedTrick = derived.currentTrick ?? stagedTrick;
  const trickIsResolving = derived.currentTrick === null && stagedTrick !== null;
  const passSelectionReady =
    Boolean(passDraft.left) &&
    Boolean(passDraft.partner) &&
    Boolean(passDraft.right) &&
    new Set(Object.values(passDraft)).size === 3;
  const pickupPending = state.phase === "exchange_complete" && Boolean(systemAdvanceAction);
  const controlHint =
    state.phase === "finished"
      ? "Round complete"
      : pickupPending && !autoplayLocal
        ? "Pickup ready"
      : localPassSelection
        ? "Pick left, partner, right"
        : localDragonActions.length > 0
          ? "Choose who gets the Dragon"
          : localIsPrimaryActor
            ? "Your turn"
            : localHasOptionalAction
              ? "Interrupt available"
              : thinkingActor
                ? `${formatActorLabel(thinkingActor)} thinking`
                : "Auto-advancing";

  const cardLookup = new Map(state.shuffledDeck.map((card) => [card.id, card]));
  const stagedSelectionBySeat = Object.fromEntries(
    SEAT_LAYOUT.map(({ seat }) => [
      seat,
      state.revealedPasses[seat] ?? state.passSelections[seat] ?? (seat === LOCAL_SEAT ? passDraft : undefined)
    ])
  ) as Record<SeatId, Partial<Record<PassTarget, string>> | undefined>;
  const visibleHandsBySeat = Object.fromEntries(
    SEAT_LAYOUT.map(({ seat }) => {
      const stagedCardIds =
        state.phase === "pass_select" || state.phase === "pass_reveal" || state.phase === "exchange_complete"
          ? collectStagedPassCardIds(stagedSelectionBySeat[seat])
          : new Set<string>();

      return [seat, state.hands[seat].filter((card) => !stagedCardIds.has(card.id))];
    })
  ) as Record<SeatId, (typeof state.hands)[SeatId]>;
  const sortedLocalHand = sortCardsForHand(visibleHandsBySeat[LOCAL_SEAT], sortMode, localPlayActions);
  const seatViews = SEAT_LAYOUT.map(({ seat, position, title, relation }) => ({
    seat,
    position,
    title,
    relation,
    handCount: visibleHandsBySeat[seat].length,
    cards: visibleHandsBySeat[seat],
    callState: derived.calls[seat],
    passReady: Boolean(state.passSelections[seat] || state.revealedPasses[seat]),
    finishIndex: state.finishedOrder.indexOf(seat),
    isLocalSeat: seat === LOCAL_SEAT,
    isPrimarySeat: primaryActor === seat,
    isThinkingSeat: thinkingActor === seat
  }));
  const seatRelativePlays = SEAT_LAYOUT.map(({ seat, position, title }) => ({
    seat,
    position,
    label: title,
    plays: (displayedTrick?.entries ?? []).filter(
      (entry): entry is Extract<TrickEntry, { type: "play" }> => isPlayTrickEntry(entry) && entry.seat === seat
    )
  }));
  const tablePassGroups = SEAT_LAYOUT.map(({ seat, position, title }) => {
    const selection = stagedSelectionBySeat[seat];
    const cardIds = PASS_TARGETS.map((target) => selection?.[target]).filter((value): value is string => Boolean(value));

    return { seat, position, label: title, cardIds };
  }).filter((group) => group.cardIds.length > 0);
  const passRouteViews =
    state.phase === "pass_select" || state.phase === "pass_reveal" || state.phase === "exchange_complete"
      ? SEAT_LAYOUT.flatMap(({ seat, position }) =>
          PASS_TARGETS.map((target) => {
            const targetSeat =
              target === "left" ? getLeftSeat(seat) : target === "partner" ? getPartnerSeat(seat) : getRightSeat(seat);
            const revealedSelection = state.revealedPasses[seat];
            const stagedSelection = stagedSelectionBySeat[seat];
            const stagedCardId = stagedSelection?.[target] ?? null;
            const visibleCardId = revealedSelection?.[target] ?? (seat === LOCAL_SEAT ? stagedCardId : null);

            return {
              key: `${seat}-${target}`,
              sourceSeat: seat,
              sourcePosition: position,
              target,
              targetSeat,
              occupied: Boolean(stagedCardId),
              visibleCardId,
              faceDown: Boolean(stagedCardId) && !visibleCardId,
              interactive: seat === LOCAL_SEAT && state.phase === "pass_select"
            };
          })
        )
      : [];
  const passLaneViews = PASS_TARGETS.map((target) => ({
    target,
    targetSeat:
      target === "left"
        ? getLeftSeat(LOCAL_SEAT)
        : target === "partner"
          ? getPartnerSeat(LOCAL_SEAT)
          : getRightSeat(LOCAL_SEAT),
    assignedCardId: passDraft[target] ?? null
  }));
  const normalActionRail = createNormalActionRail({
    phase: state.phase,
    nextEnabled: Boolean(localDeclineGrandTichuAction),
    grandTichuEnabled: Boolean(localGrandTichuAction),
    tichuEnabled: Boolean(localCallTichuAction),
    passEnabled: Boolean(localPassAction && localIsPrimaryActor),
    exchangeEnabled: passSelectionReady,
    pickupEnabled: Boolean(systemAdvanceAction),
    playEnabled: Boolean(activePlayVariant)
  });

  useEffect(() => {
    function exportNormalTableLayout(layout: NormalTableLayout) {
      const payload = {
        version: 1,
        surface: {
          widthMode: "relative",
          heightMode: "relative",
          gridSize: 10
        },
        elements: layout
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tichu-table-layout-${Date.now()}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "s" || event.key === "S") && event.ctrlKey && layoutEditorActive) {
        event.preventDefault();
        exportNormalTableLayout(normalTableLayout);
        return;
      }

      if ((event.key === "e" || event.key === "E") && event.ctrlKey && !isEditableTarget(event.target)) {
        event.preventDefault();
        if (uiMode === "debug") {
          setUiMode("normal");
          setLayoutEditorActive(true);
          return;
        }

        setLayoutEditorActive((current) => !current);
        return;
      }

      if (layoutEditorActive && isDebugToggleShortcut(event) && !isEditableTarget(event.target)) {
        return;
      }

      if (!isDebugToggleShortcut(event) || isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setLayoutEditorActive(false);
      setUiMode((current) => (current === "normal" ? "debug" : "normal"));
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [layoutEditorActive, normalTableLayout, uiMode]);

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

    if (!autoplayLocal && pickupPending) {
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

    return () => window.clearTimeout(timeout);
  }, [autoplayLocal, localHasOptionalAction, localIsPrimaryActor, pickupPending, primaryActor, round, state.phase]);

  useEffect(() => {
    if (derived.currentTrick) {
      setStagedTrick(derived.currentTrick);
      return;
    }

    if (!stagedTrick) {
      return;
    }

    const timeout = window.setTimeout(() => setStagedTrick(null), 190);
    return () => window.clearTimeout(timeout);
  }, [derived.currentTrick, stagedTrick]);

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
    const nextRound = createInitialGameState(createRoundSeed(nextSeedIndex));

    startTransition(() => {
      setSeedIndex(nextSeedIndex);
      setRound(nextRound);
      setDecisionCount(0);
      setThinkingActor(null);
      setLastAiDecision(null);
      setRecentEvents(nextRound.events.map(formatEvent));
      setSortMode("rank");
      setStagedTrick(null);
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

    applyClientAction({
      type: "play_cards",
      seat: LOCAL_SEAT,
      cardIds: activePlayVariant.cardIds,
      ...(activePlayVariant.phoenixAsRank !== undefined ? { phoenixAsRank: activePlayVariant.phoenixAsRank } : {}),
      ...(resolvedWishRank !== null ? { wishRank: resolvedWishRank } : {})
    });
  }

  function confirmPassSelection() {
    if (!localPassSelection || !passSelectionReady || !passDraft.left || !passDraft.partner || !passDraft.right) {
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

  function assignPassCard(target: PassTarget, cardId: string) {
    if (!localPassSelection) {
      return;
    }

    setPassDraft((current) => {
      if (current[target] === cardId) {
        setSelectedPassTarget(target);
        return current;
      }

      const nextDraft: Partial<Record<PassTarget, string>> = {};

      for (const draftTarget of PASS_TARGETS) {
        const existingCardId = current[draftTarget];
        if (!existingCardId || existingCardId === cardId || draftTarget === target) {
          continue;
        }

        nextDraft[draftTarget] = existingCardId;
      }

      nextDraft[target] = cardId;
      const nextEmptyTarget = findNextEmptyPassTarget(nextDraft);
      setSelectedPassTarget(nextEmptyTarget ?? target);
      return nextDraft;
    });
  }

  function handleLocalCardClick(cardId: string) {
    if (!localCanInteract) {
      return;
    }

    if (localPassSelection) {
      assignPassCard(selectedPassTarget, cardId);
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

  function handleNormalAction(slotId: NormalActionSlotId) {
    switch (slotId) {
      case "next":
        if (localDeclineGrandTichuAction) {
          applyClientAction(localDeclineGrandTichuAction);
        }
        break;
      case "grand_tichu":
        if (localGrandTichuAction) {
          applyClientAction(localGrandTichuAction);
        }
        break;
      case "tichu":
        if (localCallTichuAction) {
          applyClientAction(localCallTichuAction);
        }
        break;
      case "pass":
        if (localPassAction && localIsPrimaryActor) {
          applyClientAction(localPassAction);
        }
        break;
      case "exchange":
        confirmPassSelection();
        break;
      case "pickup":
        if (systemAdvanceAction) {
          applyClientAction(systemAdvanceAction);
        }
        break;
      case "play":
        playSelectedCards();
        break;
      case "new_round":
        startNextRound();
        break;
      }
  }

  function handlePassLaneDrop(target: PassTarget, cardId: string) {
    assignPassCard(target, cardId);
  }

  function handleDragonRecipientSelect(recipient: SeatId) {
    const action = localDragonActions.find((candidate) => candidate.recipient === recipient);
    if (action) {
      applyClientAction(action);
    }
  }

  const viewProps = {
    roundSeed,
    decisionCount,
    state,
    derived,
    controlHint,
    seatViews,
    seatRelativePlays,
    displayedTrick,
    trickIsResolving,
    tablePassGroups,
    passRouteViews,
    passLaneViews,
    sortedLocalHand,
    localCanInteract,
    localPassInteractionEnabled: Boolean(localPassSelection),
    localLegalCardIds,
    selectedCardIds,
    selectedPassTarget,
    passSelectionReady,
    matchingPlayActions,
    activePlayVariant,
    resolvedWishRank,
    normalActionRail,
    sortMode,
    autoplayLocal,
    lastAiDecision,
    recentEvents,
    localActionSummary,
    localSummaryText,
    canContinueAi: Boolean(primaryActor && primaryActor !== LOCAL_SEAT),
    localDragonRecipients: localDragonActions.map((action) => action.recipient),
    normalTableLayout,
    layoutEditorActive,
    cardLookup,
    onToggleMode: () => {
      setLayoutEditorActive(false);
      setUiMode((current) => (current === "normal" ? "debug" : "normal"));
    },
    onAutoplayChange: setAutoplayLocal,
    onNewRound: startNextRound,
    onContinueAi: continueWithAi,
    onSortModeChange: setSortMode,
    onLocalCardClick: handleLocalCardClick,
    onPassTargetSelect: setSelectedPassTarget,
    onPassLaneDrop: handlePassLaneDrop,
    onVariantSelect: setSelectedVariantKey,
    onWishRankSelect: setSelectedWishRank,
    onDragonRecipientSelect: handleDragonRecipientSelect,
    onNormalAction: handleNormalAction,
    onNormalTableLayoutChange: setNormalTableLayout
  };

  return uiMode === "normal" ? <NormalGameTableView {...viewProps} /> : <DebugGameTableView {...viewProps} />;
}
