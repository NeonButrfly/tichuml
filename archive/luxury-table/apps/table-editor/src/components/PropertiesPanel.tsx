import { useCallback } from "react";
import type {
  AltTableLayout,
  SideHandId,
  PassingLaneId,
  HandMasterTransform,
  CardFanSettings,
  PassingLaneTransform,
  Vec3,
  Scale3
} from "@tichuml/table-layout-schema";
import { degreesToRadians, radiansToDegrees, mirrorHandLayout, copyHandLayout, mirrorPassingLane, getMirrorLaneId, createDefaultPassingLane } from "@tichuml/table-layout-schema";
import {
  isEditableHandId,
  updateHandFan,
  updateHandMaster,
  updatePassingLane,
  type EditorSelection
} from "../state/editorState";

interface PropertiesPanelProps {
  layout: AltTableLayout;
  selection: EditorSelection | null;
  onLayoutChange: (layout: AltTableLayout, description?: string) => void;
}

export function PropertiesPanel(props: PropertiesPanelProps) {
  const { layout, selection, onLayoutChange } = props;

  if (!selection) {
    return (
      <div className="editor-properties">
        <div className="editor-properties__title">Properties</div>
        <div className="editor-properties__subtitle">Select an object to edit its properties</div>
      </div>
    );
  }

  if (selection.type === "hand") {
    return (
      <HandProperties
        layout={layout}
        side={selection.id as SideHandId}
        onLayoutChange={onLayoutChange}
      />
    );
  }

  if (selection.type === "lane" || selection.type === "arrow") {
    return (
      <LaneProperties
        layout={layout}
        laneId={selection.id as PassingLaneId}
        editingArrow={selection.type === "arrow"}
        onLayoutChange={onLayoutChange}
      />
    );
  }

  return null;
}

function HandProperties({
  layout,
  side,
  onLayoutChange
}: {
  layout: AltTableLayout;
  side: SideHandId;
  onLayoutChange: (layout: AltTableLayout, description?: string) => void;
}) {
  const hand = layout.hands[side];
  const otherSides: SideHandId[] = (["north", "east", "west", "south"] as SideHandId[]).filter(s => s !== side);

  if (!isEditableHandId(side)) {
    return (
      <div className="editor-properties">
        <div className="editor-properties__title">South Hand (Locked)</div>
        <div className="editor-properties__subtitle">
          Reference only. South stays visible in the preview but is not editable here.
        </div>
      </div>
    );
  }

  const updateMaster = useCallback(
    (updater: (m: HandMasterTransform) => HandMasterTransform, desc = "Edit hand") => {
      onLayoutChange(updateHandMaster(layout, side, updater), desc);
    },
    [layout, side, onLayoutChange]
  );

  const updateFan = useCallback(
    (updater: (f: CardFanSettings) => CardFanSettings, desc = "Edit fan") => {
      onLayoutChange(updateHandFan(layout, side, updater), desc);
    },
    [layout, side, onLayoutChange]
  );

  const handleMirrorFrom = useCallback(
    (fromSide: SideHandId) => {
      const mirrored = mirrorHandLayout(layout.hands[fromSide], side);
      onLayoutChange({
        ...layout,
        hands: { ...layout.hands, [side]: mirrored }
      }, `Mirror ${fromSide} to ${side}`);
    },
    [layout, side, onLayoutChange]
  );

  const handleCopyFrom = useCallback(
    (fromSide: SideHandId) => {
      const copied = copyHandLayout(layout.hands[fromSide], side);
      onLayoutChange({
        ...layout,
        hands: { ...layout.hands, [side]: copied }
      }, `Copy ${fromSide} to ${side}`);
    },
    [layout, side, onLayoutChange]
  );

  const applyBacksInwardPreset = useCallback(() => {
    updateFan(
      (f) => ({
        ...f,
        cardLocalRotation: {
          x: degreesToRadians(0),
          y: degreesToRadians(0),
          z: degreesToRadians(0)
        },
        cardLocalPivot: { x: 0, y: 0, z: 0 }
      }),
      "Apply readable backs inward card preset"
    );
  }, [side, updateFan]);

  return (
    <div className="editor-properties">
      <div className="editor-properties__title">{side.charAt(0).toUpperCase() + side.slice(1)} Hand Master</div>
      <div className="editor-properties__subtitle">Parent transform for all {side} cards</div>

      <Vec3Section
        title="Position"
        value={hand.master.position}
        step={0.1}
        onChange={(v) => updateMaster((m) => ({ ...m, position: v }), "Move hand")}
      />

      <Vec3Section
        title="Rotation (degrees)"
        value={{
          x: radiansToDegrees(hand.master.rotation.x),
          y: radiansToDegrees(hand.master.rotation.y),
          z: radiansToDegrees(hand.master.rotation.z)
        }}
        step={1}
        onChange={(v) =>
          updateMaster(
            (m) => ({
              ...m,
              rotation: {
                x: degreesToRadians(v.x),
                y: degreesToRadians(v.y),
                z: degreesToRadians(v.z)
              }
            }),
            "Rotate hand"
          )
        }
      />

      <Scale3Section
        title="Scale"
        value={hand.master.scale}
        step={0.05}
        onChange={(v) => updateMaster((m) => ({ ...m, scale: v }), "Scale hand")}
      />

      <Vec3Section
        title="Pivot"
        value={hand.master.pivot}
        step={0.1}
        onChange={(v) => updateMaster((m) => ({ ...m, pivot: v }), "Move pivot")}
      />

      <Vec3Section
        title="Card Local Rotation (degrees)"
        value={{
          x: radiansToDegrees(hand.fan.cardLocalRotation.x),
          y: radiansToDegrees(hand.fan.cardLocalRotation.y),
          z: radiansToDegrees(hand.fan.cardLocalRotation.z)
        }}
        step={1}
        onChange={(v) =>
          updateFan(
            (f) => ({
              ...f,
              cardLocalRotation: {
                x: degreesToRadians(v.x),
                y: degreesToRadians(v.y),
                z: degreesToRadians(v.z)
              }
            }),
            "Rotate cards locally"
          )
        }
      />

      <Vec3Section
        title="Card Local Pivot"
        value={hand.fan.cardLocalPivot}
        step={0.05}
        onChange={(v) =>
          updateFan(
            (f) => ({ ...f, cardLocalPivot: v }),
            "Move card local pivot"
          )
        }
      />

      <div className="editor-properties__section">
        <div className="editor-properties__section-title">Fan Settings</div>

        <div className="editor-properties__row">
          <span className="editor-properties__label">Card Count</span>
          <input
            type="number"
            className="editor-properties__input"
            value={hand.fan.cardCount}
            min={1}
            max={20}
            step={1}
            onChange={(e) =>
              updateFan((f) => ({ ...f, cardCount: Number(e.target.value) }), "Change card count")
            }
          />
        </div>

        <div className="editor-properties__row">
          <span className="editor-properties__label">Card Width</span>
          <input
            type="number"
            className="editor-properties__input"
            value={hand.fan.cardWidth}
            step={0.01}
            onChange={(e) =>
              updateFan((f) => ({ ...f, cardWidth: Number(e.target.value) }), "Change card width")
            }
          />
        </div>

        <div className="editor-properties__row">
          <span className="editor-properties__label">Card Height</span>
          <input
            type="number"
            className="editor-properties__input"
            value={hand.fan.cardHeight}
            step={0.01}
            onChange={(e) =>
              updateFan((f) => ({ ...f, cardHeight: Number(e.target.value) }), "Change card height")
            }
          />
        </div>

        <div className="editor-properties__row">
          <span className="editor-properties__label">Overlap</span>
          <input
            type="number"
            className="editor-properties__input"
            value={hand.fan.overlap}
            step={0.01}
            onChange={(e) =>
              updateFan((f) => ({ ...f, overlap: Number(e.target.value) }), "Change overlap")
            }
          />
        </div>

        <div className="editor-properties__row">
          <span className="editor-properties__label">Spread</span>
          <input
            type="number"
            className="editor-properties__input"
            value={hand.fan.spread}
            step={0.01}
            onChange={(e) =>
              updateFan((f) => ({ ...f, spread: Number(e.target.value) }), "Change spread")
            }
          />
        </div>

        <div className="editor-properties__row">
          <span className="editor-properties__label">Arc</span>
          <input
            type="number"
            className="editor-properties__input"
            value={hand.fan.arc}
            step={0.01}
            onChange={(e) =>
              updateFan((f) => ({ ...f, arc: Number(e.target.value) }), "Change arc")
            }
          />
        </div>

        <div className="editor-properties__row">
          <span className="editor-properties__label">Depth Step</span>
          <input
            type="number"
            className="editor-properties__input"
            value={hand.fan.depthStep}
            step={0.005}
            onChange={(e) =>
              updateFan((f) => ({ ...f, depthStep: Number(e.target.value) }), "Change depth step")
            }
          />
        </div>

        <div className="editor-properties__row">
          <span className="editor-properties__label">Rot Step</span>
          <input
            type="number"
            className="editor-properties__input"
            value={hand.fan.localRotationStep}
            step={0.001}
            onChange={(e) =>
              updateFan((f) => ({ ...f, localRotationStep: Number(e.target.value) }), "Change rotation step")
            }
          />
        </div>

        <div className="editor-properties__row">
          <span className="editor-properties__label">Fan Dir</span>
          <select
            className="editor-properties__input"
            value={hand.fan.fanDirection}
            onChange={(e) =>
              updateFan((f) => ({ ...f, fanDirection: Number(e.target.value) as 1 | -1 }), "Change fan direction")
            }
          >
            <option value={1}>Normal</option>
            <option value={-1}>Reversed</option>
          </select>
        </div>

        <div className="editor-properties__checkbox-row">
          <input
            type="checkbox"
            className="editor-properties__checkbox"
            checked={hand.fan.reverseOrder}
            onChange={(e) =>
              updateFan((f) => ({ ...f, reverseOrder: e.target.checked }), "Toggle reverse order")
            }
          />
          <span className="editor-properties__label">Reverse Card Order</span>
        </div>
      </div>

      <div className="editor-properties__section">
        <div className="editor-properties__section-title">Actions</div>
        <div className="editor-properties__actions">
          <button
            className="editor-properties__action-btn"
            onClick={applyBacksInwardPreset}
          >
            Backs Inward
          </button>
          {otherSides.map((fromSide) => (
            <button key={`mirror-${fromSide}`} className="editor-properties__action-btn" onClick={() => handleMirrorFrom(fromSide)}>
              Mirror from {fromSide}
            </button>
          ))}
          {otherSides.map((fromSide) => (
            <button key={`copy-${fromSide}`} className="editor-properties__action-btn" onClick={() => handleCopyFrom(fromSide)}>
              Copy from {fromSide}
            </button>
          ))}
          <button
            className="editor-properties__action-btn"
            onClick={() =>
              updateMaster(
                () => ({
                  position: { x: 0, y: 0, z: 0 },
                  rotation: { x: 0, y: 0, z: 0 },
                  scale: { x: 1, y: 1, z: 1 },
                  pivot: { x: 0, y: 0, z: 0 }
                }),
                "Reset master transform"
              )
            }
          >
            Reset Transform
          </button>
        </div>
      </div>
    </div>
  );
}

function LaneProperties({
  layout,
  laneId,
  editingArrow,
  onLayoutChange
}: {
  layout: AltTableLayout;
  laneId: PassingLaneId;
  editingArrow: boolean;
  onLayoutChange: (layout: AltTableLayout, description?: string) => void;
}) {
  const lane = layout.passingLanes[laneId];
  const mirrorId = getMirrorLaneId(laneId);

  const updateLane = useCallback(
    (updater: (l: PassingLaneTransform) => PassingLaneTransform, desc = "Edit lane") => {
      onLayoutChange(updatePassingLane(layout, laneId, updater), desc);
    },
    [layout, laneId, onLayoutChange]
  );

  const handleMirror = useCallback(() => {
    const source = layout.passingLanes[mirrorId];
    if (!source) return;
    const mirrored = mirrorPassingLane(source, laneId);
    onLayoutChange(
      {
        ...layout,
        passingLanes: { ...layout.passingLanes, [laneId]: mirrored }
      },
      `Mirror ${mirrorId} to ${laneId}`
    );
  }, [layout, laneId, mirrorId, onLayoutChange]);

  return (
    <div className="editor-properties">
      <div className="editor-properties__title">
        {editingArrow ? "Arrow" : "Lane"}: {formatLaneId(laneId)}
      </div>
      <div className="editor-properties__subtitle">
        {editingArrow ? "Arrow transform for this passing lane" : "Passing lane rectangle"}
      </div>

      {!editingArrow && (
        <>
          <Vec3Section
            title="Position"
            value={lane.position}
            step={0.1}
            onChange={(v) => updateLane((l) => ({ ...l, position: v }), "Move lane")}
          />

          <Vec3Section
            title="Rotation (degrees)"
            value={{
              x: radiansToDegrees(lane.rotation.x),
              y: radiansToDegrees(lane.rotation.y),
              z: radiansToDegrees(lane.rotation.z)
            }}
            step={1}
            onChange={(v) =>
              updateLane(
                (l) => ({
                  ...l,
                  rotation: {
                    x: degreesToRadians(v.x),
                    y: degreesToRadians(v.y),
                    z: degreesToRadians(v.z)
                  }
                }),
                "Rotate lane"
              )
            }
          />

          <div className="editor-properties__row">
            <span className="editor-properties__label">Width</span>
            <input
              type="number"
              className="editor-properties__input"
              value={lane.width}
              step={0.05}
              onChange={(e) => updateLane((l) => ({ ...l, width: Number(e.target.value) }), "Resize lane width")}
            />
          </div>

          <div className="editor-properties__row">
            <span className="editor-properties__label">Height</span>
            <input
              type="number"
              className="editor-properties__input"
              value={lane.height}
              step={0.05}
              onChange={(e) => updateLane((l) => ({ ...l, height: Number(e.target.value) }), "Resize lane height")}
            />
          </div>

          <div className="editor-properties__row">
            <span className="editor-properties__label">Border</span>
            <input
              type="number"
              className="editor-properties__input"
              value={lane.borderThickness}
              step={0.005}
              onChange={(e) => updateLane((l) => ({ ...l, borderThickness: Number(e.target.value) }), "Change border")}
            />
          </div>

          <div className="editor-properties__row">
            <span className="editor-properties__label">Fill Opacity</span>
            <input
              type="number"
              className="editor-properties__input"
              value={lane.fillOpacity}
              step={0.05}
              min={0}
              max={1}
              onChange={(e) => updateLane((l) => ({ ...l, fillOpacity: Number(e.target.value) }), "Change fill opacity")}
            />
          </div>

          <div className="editor-properties__checkbox-row">
            <input
              type="checkbox"
              className="editor-properties__checkbox"
              checked={lane.visible}
              onChange={(e) => updateLane((l) => ({ ...l, visible: e.target.checked }), "Toggle visibility")}
            />
            <span className="editor-properties__label">Visible</span>
          </div>

          <div className="editor-properties__checkbox-row">
            <input
              type="checkbox"
              className="editor-properties__checkbox"
              checked={lane.locked}
              onChange={(e) => updateLane((l) => ({ ...l, locked: e.target.checked }), "Toggle lock")}
            />
            <span className="editor-properties__label">Locked</span>
          </div>
        </>
      )}

      {editingArrow && (
        <>
          <div className="editor-properties__row">
            <span className="editor-properties__label">Rotation (deg)</span>
            <input
              type="number"
              className="editor-properties__input"
              value={radiansToDegrees(lane.arrowRotation)}
              step={5}
              onChange={(e) =>
                updateLane(
                  (l) => ({ ...l, arrowRotation: degreesToRadians(Number(e.target.value)) }),
                  "Rotate arrow"
                )
              }
            />
          </div>

          <Vec3Section
            title="Arrow Offset"
            value={lane.arrowOffset}
            step={0.05}
            onChange={(v) => updateLane((l) => ({ ...l, arrowOffset: v }), "Move arrow")}
          />

          <div className="editor-properties__row">
            <span className="editor-properties__label">Arrow Scale</span>
            <input
              type="number"
              className="editor-properties__input"
              value={lane.arrowScale}
              step={0.1}
              min={0.1}
              max={3}
              onChange={(e) => updateLane((l) => ({ ...l, arrowScale: Number(e.target.value) }), "Scale arrow")}
            />
          </div>
        </>
      )}

      <div className="editor-properties__section">
        <div className="editor-properties__section-title">Actions</div>
        <div className="editor-properties__actions">
          <button className="editor-properties__action-btn" onClick={handleMirror}>
            Mirror from {formatLaneId(mirrorId)}
          </button>
          <button
            className="editor-properties__action-btn"
            onClick={() => {
              const def = createDefaultPassingLane(laneId);
              onLayoutChange(
                { ...layout, passingLanes: { ...layout.passingLanes, [laneId]: def } },
                `Reset ${laneId}`
              );
            }}
          >
            Reset Lane
          </button>
        </div>
      </div>
    </div>
  );
}

function Vec3Section({
  title,
  value,
  step,
  onChange
}: {
  title: string;
  value: Vec3;
  step: number;
  onChange: (v: Vec3) => void;
}) {
  return (
    <div className="editor-properties__section">
      <div className="editor-properties__section-title">{title}</div>
      <div className="editor-properties__row">
        <span className="editor-properties__label">X</span>
        <input
          type="number"
          className="editor-properties__input"
          value={round(value.x)}
          step={step}
          onChange={(e) => onChange({ ...value, x: Number(e.target.value) })}
        />
      </div>
      <div className="editor-properties__row">
        <span className="editor-properties__label">Y</span>
        <input
          type="number"
          className="editor-properties__input"
          value={round(value.y)}
          step={step}
          onChange={(e) => onChange({ ...value, y: Number(e.target.value) })}
        />
      </div>
      <div className="editor-properties__row">
        <span className="editor-properties__label">Z</span>
        <input
          type="number"
          className="editor-properties__input"
          value={round(value.z)}
          step={step}
          onChange={(e) => onChange({ ...value, z: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}

function Scale3Section({
  title,
  value,
  step,
  onChange
}: {
  title: string;
  value: Scale3;
  step: number;
  onChange: (v: Scale3) => void;
}) {
  return (
    <div className="editor-properties__section">
      <div className="editor-properties__section-title">{title}</div>
      <div className="editor-properties__row">
        <span className="editor-properties__label">X</span>
        <input
          type="number"
          className="editor-properties__input"
          value={round(value.x)}
          step={step}
          onChange={(e) => onChange({ ...value, x: Number(e.target.value) })}
        />
      </div>
      <div className="editor-properties__row">
        <span className="editor-properties__label">Y</span>
        <input
          type="number"
          className="editor-properties__input"
          value={round(value.y)}
          step={step}
          onChange={(e) => onChange({ ...value, y: Number(e.target.value) })}
        />
      </div>
      <div className="editor-properties__row">
        <span className="editor-properties__label">Z</span>
        <input
          type="number"
          className="editor-properties__input"
          value={round(value.z)}
          step={step}
          onChange={(e) => onChange({ ...value, z: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}

function formatLaneId(id: string): string {
  return id
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function round(n: number): string {
  return Number(n.toFixed(4)).toString();
}
