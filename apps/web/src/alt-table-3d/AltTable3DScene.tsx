import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { AltTable3DTableRoot } from "./AltTable3DTableRoot";
import { ALT_TABLE_CAMERA } from "./AltTable3DLayout";
import type { AltTable3DSceneModel } from "./AltTable3DModel";

type Props = {
  model: AltTable3DSceneModel;
  onSouthCardClick?: (cardId: string) => void;
  onPassLaneClick?: (laneKey: string) => void;
};

export function AltTable3DScene({
  model,
  onSouthCardClick,
  onPassLaneClick
}: Props) {
  return (
    <div className="alt-table-3d__canvas-shell" data-alt-table-3d-canvas="true">
      <Canvas shadows camera={ALT_TABLE_CAMERA} dpr={[1, 1.75]}>
        <color attach="background" args={["#17110d"]} />
        <ambientLight intensity={1.15} color="#f3ead7" />
        <hemisphereLight intensity={0.52} color="#f0e6cf" groundColor="#2b1f16" />
        <directionalLight
          position={[7.5, 12, 6.5]}
          intensity={1.45}
          color="#fff6e4"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <spotLight
          position={[0, 11.5, 9]}
          intensity={0.75}
          angle={0.42}
          penumbra={0.7}
          color="#efd7a1"
        />
        <Suspense fallback={null}>
          <AltTable3DTableRoot
            model={model}
            onSouthCardClick={onSouthCardClick}
            onPassLaneClick={onPassLaneClick}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
