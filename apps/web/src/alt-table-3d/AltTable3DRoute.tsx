import { useCallback, useMemo } from "react";
import type { SeatId } from "@tichuml/engine";
import {
  GameChromeMenu,
  formatRank,
  type GameTableViewProps,
  type WishSelectionValue
} from "../game-table-views";
import "./alt-table-3d.css";
import { AltTable3DScene } from "./AltTable3DScene";
import { createAltTable3DSceneModel, formatSouthHandSummary } from "./AltTable3DModel";

function WishOptionButton({
  value,
  active,
  onClick
}: {
  value: WishSelectionValue;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={["alt-table-3d__wish-option", active ? "is-active" : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      {value === null ? "No Wish" : formatRank(value)}
    </button>
  );
}

function DragonRecipientButton({
  recipient,
  onClick
}: {
  recipient: SeatId;
  onClick: () => void;
}) {
  return (
    <button type="button" className="alt-table-3d__utility-button" onClick={onClick}>
      {recipient}
    </button>
  );
}

export function AltTable3DRoute(props: GameTableViewProps) {
  const model = useMemo(() => createAltTable3DSceneModel(props), [props]);

  const handlePassLaneClick = useCallback(
    (laneKey: string) => {
      const route = props.passRouteViews.find((entry) => entry.key === laneKey);
      if (!route) {
        return;
      }
      if (route.occupied) {
        props.onPassLaneCardClick(route.target);
        return;
      }
      const selectedCardId = props.selectedCardIds[0];
      if (props.localPassInteractionEnabled && selectedCardId) {
        props.onPassLaneDrop(route.target, selectedCardId);
        return;
      }
      props.onPassTargetSelect(route.target);
    },
    [props]
  );

  return (
    <main className="alt-table-3d">
      <GameChromeMenu
        variant="alternate"
        isOpen={props.mainMenuOpen}
        uiMode={props.uiMode}
        layoutEditorActive={props.layoutEditorActive}
        playerTableVariant={props.playerTableVariant}
        onMainMenuOpenChange={props.onMainMenuOpenChange}
        onUiCommand={props.onUiCommand}
        onPlayerTableVariantChange={props.onPlayerTableVariantChange}
      />

      <section className="alt-table-3d__stage">
        <AltTable3DScene
          model={model}
          onSouthCardClick={props.localCanInteract ? props.onLocalCardClick : undefined}
          onPassLaneClick={handlePassLaneClick}
        />

        <div hidden aria-hidden="true" data-alt-table-3d-scene="true">
          <span data-scene-node="TableRoot" />
          <span data-scene-node="felt-inset" />
          <span data-scene-node="trick-zone" />
          <span data-scene-node="deck-zone" />
          <span data-scene-node="discard-zone" />
          {model.seats.map((seat) => (
            <span
              key={seat.position}
              data-scene-node="seat-tray"
              data-seat-position={seat.position}
            />
          ))}
          {model.passLanes.map((lane) => (
            <span key={lane.key} data-scene-node="pass-lane" data-pass-lane-key={lane.key} />
          ))}
          {model.southCards.map((card) => (
            <span key={card.key} data-scene-card="south-mesh" data-card-id={card.cardId} />
          ))}
          {model.opponentCards.map((card) => (
            <span key={card.key} data-scene-card="opponent-mesh" data-card-id={card.cardId} />
          ))}
        </div>

        <div className="alt-table-3d__status-strip">
          <span>{model.phaseLabel}</span>
          <span>{`WE ${model.score.we}`}</span>
          <span>{`THEY ${model.score.they}`}</span>
          <span>{formatSouthHandSummary(model.southCards)}</span>
        </div>

        {props.localDragonRecipients.length > 0 && (
          <section className="alt-table-3d__choice-panel alt-table-3d__choice-panel--dragon">
            <h2>Dragon Gift</h2>
            <div className="alt-table-3d__choice-buttons">
              {props.localDragonRecipients.map((recipient) => (
                <DragonRecipientButton
                  key={recipient}
                  recipient={recipient}
                  onClick={() => props.onDragonRecipientSelect(recipient)}
                />
              ))}
            </div>
          </section>
        )}

        {props.wishDialogOpen && (
          <section className="alt-table-3d__choice-panel alt-table-3d__choice-panel--wish">
            <h2>Mahjong Wish</h2>
            <div className="alt-table-3d__choice-options">
              {props.wishSelectionOptions.map((value) => (
                <WishOptionButton
                  key={value === null ? "none" : value}
                  value={value}
                  active={props.resolvedWishRank === value}
                  onClick={() => props.onWishRankSelect(value)}
                />
              ))}
            </div>
            <div className="alt-table-3d__choice-buttons">
              <button
                type="button"
                className="alt-table-3d__action-button alt-table-3d__action-button--primary"
                disabled={props.wishConfirmDisabled || props.wishSubmissionPending}
                onClick={props.onWishConfirm}
              >
                Confirm Wish
              </button>
              <button
                type="button"
                className="alt-table-3d__utility-button"
                disabled={props.wishSubmissionPending}
                onClick={props.onWishCancel}
              >
                Cancel
              </button>
            </div>
          </section>
        )}
      </section>

      <footer className="alt-table-3d__action-rail" data-alt-table-3d-action-rail="true">
        {props.normalActionRail.map((slot) => (
          <button
            key={slot.id}
            type="button"
            className={[
              "alt-table-3d__action-button",
              `alt-table-3d__action-button--${slot.tone}`
            ].join(" ")}
            disabled={!slot.enabled}
            onClick={() => props.onNormalAction(slot.id)}
          >
            {slot.label}
          </button>
        ))}
        {props.canContinueAi && (
          <button
            type="button"
            className="alt-table-3d__utility-button alt-table-3d__utility-button--wide"
            onClick={props.onContinueAi}
          >
            Continue AI
          </button>
        )}
      </footer>
    </main>
  );
}
