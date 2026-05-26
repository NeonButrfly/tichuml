import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, Color } from "three";
import { CameraRig } from "./CameraRig";
import { EmptyPhotorealisticTableScene } from "./EmptyPhotorealisticTableScene";
import { LightingRig } from "./LightingRig";
import { ALT_SCENE_MARKERS, ALT_TABLE_BACKGROUND, ALT_TABLE_CAMERA } from "./sceneConstants";

export function AltTichuTable3D() {
  return (
    <div className="alt-table-3d-shell">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={ALT_TABLE_CAMERA}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.56;
          gl.setClearColor(new Color(ALT_TABLE_BACKGROUND));
        }}
      >
        <color attach="background" args={[ALT_TABLE_BACKGROUND]} />
        <fog attach="fog" args={[ALT_TABLE_BACKGROUND, 10, 22]} />
        <CameraRig />
        <LightingRig />
        <EmptyPhotorealisticTableScene />
      </Canvas>

      <div hidden aria-hidden="true" data-alt-table-3d-scene="true">
        <span data-scene-node={ALT_SCENE_MARKERS.tableRoot} />
        <span data-scene-node={ALT_SCENE_MARKERS.feltInset} />
        <span data-scene-node="seat-rail" data-seat-position="top" />
        <span data-scene-node="seat-rail" data-seat-position="bottom" />
        <span data-scene-node="seat-rail" data-seat-position="left" />
        <span data-scene-node="seat-rail" data-seat-position="right" />
        <span data-scene-node="seat-label" data-seat-position="top" />
        <span data-scene-node="seat-label" data-seat-position="bottom" />
        <span data-scene-node="seat-label" data-seat-position="left" />
        <span data-scene-node="seat-label" data-seat-position="right" />
      </div>

      <div className="alt-table-3d__vignette" />
    </div>
  );
}
