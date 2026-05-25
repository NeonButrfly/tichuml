import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useLayoutEffect } from "react";
import { AltTable3DTableRoot } from "./AltTable3DTableRoot";
import { ALT_TABLE_CAMERA, ALT_TABLE_CAMERA_TARGET } from "./AltTable3DLayout";
import type { AltTable3DSceneModel } from "./AltTable3DModel";

type Props = {
  model: AltTable3DSceneModel;
  onSouthCardClick?: (cardId: string) => void;
  onPassLaneClick?: (laneKey: string) => void;
};

function AltTable3DCameraTarget() {
  const camera = useThree((state) => state.camera);

  useLayoutEffect(() => {
    camera.lookAt(...ALT_TABLE_CAMERA_TARGET);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

export function AltTable3DScene({
  model,
  onSouthCardClick,
  onPassLaneClick
}: Props) {
  return (
    <div className="alt-table-3d__canvas-shell" data-alt-table-3d-canvas="true">
      <Canvas shadows camera={ALT_TABLE_CAMERA} dpr={[1, 1.75]}>
        <color attach="background" args={["#17110d"]} />
        <ambientLight intensity={1.28} color="#f6edd9" />
        <hemisphereLight intensity={0.62} color="#f5ecd7" groundColor="#2f241a" />
        <directionalLight
          position={[7.5, 12.8, 7.8]}
          intensity={1.58}
          color="#fff6e4"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <spotLight
          position={[0, 11.8, 8.6]}
          intensity={0.92}
          angle={0.5}
          penumbra={0.82}
          color="#efd7a1"
        />
        <Suspense fallback={null}>
          <AltTable3DCameraTarget />
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
