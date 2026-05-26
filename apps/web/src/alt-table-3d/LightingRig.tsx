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
      <ambientLight color="#fff2d0" intensity={0.66} />
      <hemisphereLight color="#ffe7bb" groundColor="#160804" intensity={0.5} />
      <spotLight
        ref={spotlightRef}
        color="#fff0cb"
        intensity={8.8}
        position={[1.2, 8.4, 3.8]}
        angle={0.44}
        penumbra={0.68}
        decay={1.25}
        distance={22}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00018}
      />
      <directionalLight
        color="#f2dcb2"
        intensity={1.05}
        position={[-1.5, 6.6, 4.6]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00018}
      />
      <pointLight color="#ffbb78" intensity={1.18} position={[-6.2, 3.6, 2.9]} />
      <pointLight color="#9fbfff" intensity={0.26} position={[5.8, 3.5, -2.2]} />
      <pointLight color="#f6a84f" intensity={0.82} position={[0, 1.6, 6.3]} />
      <object3D ref={targetRef} position={[0, 0, 0]} />
    </>
  );
}
