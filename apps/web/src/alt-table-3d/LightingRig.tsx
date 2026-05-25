import { useLayoutEffect, useRef } from "react";
import type { Object3D, SpotLight } from "three";

export function LightingRig() {
  const targetRef = useRef<Object3D>(null);
  const spotlightRef = useRef<SpotLight>(null);

  useLayoutEffect(() => {
    if (spotlightRef.current && targetRef.current) {
      spotlightRef.current.target = targetRef.current;
    }
  }, []);

  return (
    <>
      <ambientLight color="#fff2d0" intensity={0.48} />
      <hemisphereLight color="#ffe7bb" groundColor="#160804" intensity={0.38} />
      <spotLight
        ref={spotlightRef}
        color="#fff0cb"
        intensity={9.5}
        position={[1.4, 7.8, 4.8]}
        angle={0.48}
        penumbra={0.72}
        decay={1.45}
        distance={18}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00018}
      />
      <directionalLight
        color="#f2dcb2"
        intensity={1.15}
        position={[-1.2, 5.5, 4.2]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00018}
      />
      <pointLight color="#ffbb78" intensity={0.85} position={[-5.5, 3.0, 2.5]} />
      <pointLight color="#9fbfff" intensity={0.32} position={[5.0, 3.2, -2.4]} />
      <pointLight color="#f6a84f" intensity={0.55} position={[0, 1.4, 5.6]} />
      <object3D ref={targetRef} position={[0, 0, 0]} />
    </>
  );
}
