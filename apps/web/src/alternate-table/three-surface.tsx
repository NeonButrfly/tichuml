import type { CSSProperties } from "react";
import type { SouthPerspectiveTableGeometry } from "./south-perspective-projection";

export type AlternateCameraPreset = "left" | "center" | "right";

type AlternateTableThreeSurfaceProps = {
  geometry: SouthPerspectiveTableGeometry;
  cameraYaw: number;
};

function ellipseStyle(
  geometry: SouthPerspectiveTableGeometry,
  inset: number
): CSSProperties {
  return {
    left: `${geometry.tableRect.left + inset}px`,
    top: `${geometry.tableRect.top + inset * 0.72}px`,
    width: `${geometry.tableRect.width - inset * 2}px`,
    height: `${geometry.tableRect.height - inset * 1.44}px`
  };
}

export function AlternateTableThreeSurface(
  props: AlternateTableThreeSurfaceProps
) {
  return (
    <div
      className="alternate-three-surface"
      data-alt-renderer="three"
      data-camera-yaw={props.cameraYaw.toFixed(2)}
      aria-hidden="true"
    >
      <div className="alternate-three-surface__vignette" />
      <div
        className="alternate-three-surface__shadow"
        style={ellipseStyle(props.geometry, 12)}
      />
      <div
        className="alternate-three-surface__table-rim"
        style={ellipseStyle(props.geometry, 0)}
      />
      <div
        className="alternate-three-surface__table-face"
        style={ellipseStyle(props.geometry, 18)}
      />
      <div
        className="alternate-three-surface__table-sheen"
        style={ellipseStyle(props.geometry, 32)}
      />
    </div>
  );
}
