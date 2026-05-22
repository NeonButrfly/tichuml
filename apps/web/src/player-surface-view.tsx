import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, Ref } from "react";
import type { SurfacePresentation } from "./gameplay-surface-mode";
import { TableGraphicsLayer } from "./table-graphics-layer";
import type {
  NormalTableLayout,
  NormalViewportLayoutMetrics,
  SeatVisualPosition
} from "./table-layout";

export type PlayerSurfaceViewProps = {
  viewportRef?: Ref<HTMLElement>;
  layoutStyle?: CSSProperties;
  normalTableLayout: NormalTableLayout;
  layoutMetrics: NormalViewportLayoutMetrics;
  activeSeatPosition: SeatVisualPosition | null;
  wishActive: boolean;
  surfacePresentation: SurfacePresentation;
  centerZoneClassName: string;
  centerZoneStyle?: CSSProperties;
  centerZoneFelt: boolean;
  menu: ReactNode;
  activeWish: ReactNode;
  scoreboard: ReactNode;
  center: ReactNode;
  topSeat: ReactNode;
  leftSeat: ReactNode;
  rightSeat: ReactNode;
  localHand: ReactNode;
  actionBand: ReactNode;
  actionBandStyle?: CSSProperties;
  seatOverlays: ReactNode;
  passStaging: ReactNode;
  trickStaging: ReactNode;
  layoutEditor: ReactNode;
  dialogLayer: ReactNode;
  wishDialog: ReactNode;
};

function resolveElementFootprint(element: HTMLElement | null): number {
  if (!element) {
    return 0;
  }

  const measuredHeight =
    element.getBoundingClientRect().height || element.offsetHeight || 0;

  return Math.max(0, Math.ceil(measuredHeight));
}

export function PlayerSurfaceView({
  viewportRef,
  layoutStyle,
  normalTableLayout,
  layoutMetrics,
  activeSeatPosition,
  wishActive,
  surfacePresentation,
  centerZoneClassName,
  centerZoneStyle,
  centerZoneFelt,
  menu,
  activeWish,
  scoreboard,
  center,
  topSeat,
  leftSeat,
  rightSeat,
  localHand,
  actionBand,
  actionBandStyle,
  seatOverlays,
  passStaging,
  trickStaging,
  layoutEditor,
  dialogLayer,
  wishDialog
}: PlayerSurfaceViewProps) {
  const actionBandRef = useRef<HTMLElement | null>(null);
  const [actionBandFootprint, setActionBandFootprint] = useState(0);
  const shouldRenderFelt =
    centerZoneFelt || surfacePresentation.tableMode === "resolution";
  const southSafeZoneStyle =
    surfacePresentation.controlsVisible && actionBandFootprint > 0
      ? ({
          "--player-surface-action-band-footprint": `${actionBandFootprint}px`
        } as CSSProperties)
      : undefined;

  useLayoutEffect(() => {
    if (!surfacePresentation.controlsVisible) {
      setActionBandFootprint(0);
      return;
    }

    const actionBandElement = actionBandRef.current;
    if (!actionBandElement) {
      setActionBandFootprint(0);
      return;
    }

    const updateActionBandFootprint = (nextFootprint: number) => {
      setActionBandFootprint((previousFootprint) =>
        previousFootprint === nextFootprint ? previousFootprint : nextFootprint
      );
    };

    updateActionBandFootprint(resolveElementFootprint(actionBandElement));

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const nextFootprint = Math.max(
        0,
        Math.ceil(
          entry?.contentRect.height || resolveElementFootprint(actionBandElement)
        )
      );

      updateActionBandFootprint(nextFootprint);
    });

    resizeObserver.observe(actionBandElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [surfacePresentation.controlsVisible]);

  const southSafeZone =
    surfacePresentation.controlsVisible ? (
      <div
        className="player-surface__south-safe-zone"
        data-south-safe-zone="reserved"
        style={southSafeZoneStyle}
      >
        {localHand}
        <section
          ref={actionBandRef}
          className="normal-bottom-controls player-surface__action-band"
          data-layout-container="action-band"
          data-action-row="true"
          aria-label="Available actions"
          style={actionBandStyle}
        >
          {actionBand}
        </section>
      </div>
    ) : (
      localHand
    );
  const tableClassName = [
    "normal-table",
    "player-surface__table",
    `player-surface__table--${surfacePresentation.tableMode}`,
    `player-surface__hand--${surfacePresentation.handMode}`,
    surfacePresentation.controlsVisible
      ? "player-surface__table--south-safe-zone"
      : "",
    surfacePresentation.dramaticTurnCue ? "player-surface__table--dramatic-turn" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="tabletop-app tabletop-app--normal player-surface">
      <section
        ref={viewportRef}
        className="normal-viewport player-surface__viewport"
        style={layoutStyle}
        data-layout-container="normal-viewport"
      >
        <div
          className="normal-viewport__board player-surface__board"
          data-layout-container="board"
        >
          {menu}
          {activeWish}
          {scoreboard}

          <div className="normal-table-shell player-surface__table-shell">
            <TableGraphicsLayer
              normalTableLayout={normalTableLayout}
              layoutMetrics={layoutMetrics}
              activeSeatPosition={activeSeatPosition}
              wishActive={wishActive}
            />
            <div className={tableClassName}>
              <div className="player-surface__perspective">
                <div
                  className="normal-grid player-surface__seat-ring"
                  data-layout-container="table-grid"
                >
                  <section
                    className={`${centerZoneClassName} player-surface__center`}
                    data-layout-container="center-zone"
                    style={centerZoneStyle}
                  >
                    {shouldRenderFelt && (
                      <div className="normal-table__felt player-surface__felt" />
                    )}
                    {center}
                  </section>

                  {topSeat}
                  {leftSeat}
                  {rightSeat}
                  {southSafeZone}
                </div>

                {seatOverlays}
                {passStaging}
                {trickStaging}
                {layoutEditor}
              </div>
            </div>
          </div>

          {dialogLayer}
          {wishDialog}
        </div>
      </section>
    </main>
  );
}
