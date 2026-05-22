import type { CSSProperties, ReactNode, Ref } from "react";

export type PlayerSurfaceViewProps = {
  viewportRef?: Ref<HTMLElement>;
  layoutStyle?: CSSProperties;
  controlsVisible: boolean;
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

export function PlayerSurfaceView({
  viewportRef,
  layoutStyle,
  controlsVisible,
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
            <div className="normal-table player-surface__table">
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
                    {centerZoneFelt && (
                      <div className="normal-table__felt player-surface__felt" />
                    )}
                    {center}
                  </section>

                  {topSeat}
                  {leftSeat}
                  {rightSeat}
                  {localHand}

                  {controlsVisible ? (
                    <section
                      className="normal-bottom-controls player-surface__action-band"
                      data-layout-container="action-band"
                      data-action-row="true"
                      style={actionBandStyle}
                    >
                      {actionBand}
                    </section>
                  ) : null}
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
