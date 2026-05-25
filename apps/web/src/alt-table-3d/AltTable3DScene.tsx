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
        <color attach="background" args={["#2f1b12"]} />
        <ambientLight intensity={1.46} color="#f7efdf" />
        <hemisphereLight intensity={0.72} color="#f0e5cf" groundColor="#52311f" />
        <directionalLight
          position={[6.8, 11.8, 7.2]}
          intensity={1.7}
          color="#fff6e4"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <spotLight
          position={[0, 10.6, 7.2]}
          intensity={1.05}
          angle={0.46}
          penumbra={0.76}
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
