import { Canvas, useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { memo, useMemo } from "react";
import * as THREE from "three";
import type { AlternateTableLayout } from "./layout";

export type AlternateCameraPreset = "left" | "center" | "right";

type AlternateTableThreeSurfaceProps = {
  layout: AlternateTableLayout;
  cameraPreset: AlternateCameraPreset;
};

const CAMERA_PRESETS: Record<
  AlternateCameraPreset,
  { position: THREE.Vector3; lookAt: THREE.Vector3 }
> = {
  left: {
    position: new THREE.Vector3(-4.2, 7.2, 8.2),
    lookAt: new THREE.Vector3(0, 0.45, 0)
  },
  center: {
    position: new THREE.Vector3(0, 7.5, 8.6),
    lookAt: new THREE.Vector3(0, 0.48, 0)
  },
  right: {
    position: new THREE.Vector3(4.2, 7.2, 8.2),
    lookAt: new THREE.Vector3(0, 0.45, 0)
  }
};

function CameraRig({ preset }: { preset: AlternateCameraPreset }) {
  const target = CAMERA_PRESETS[preset];
  const lookAt = target.lookAt;

  useFrame(({ camera }) => {
    camera.position.lerp(target.position, 0.09);
    camera.lookAt(lookAt);
  });

  return null;
}

const TableScene = memo(function TableScene({
  cameraPreset
}: {
  cameraPreset: AlternateCameraPreset;
}) {
  const wood = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#6b3d1d",
        roughness: 0.52,
        metalness: 0.12
      }),
    []
  );
  const woodDark = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#45230f",
        roughness: 0.65,
        metalness: 0.08
      }),
    []
  );
  const felt = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#134e3d",
        roughness: 0.92,
        metalness: 0.02
      }),
    []
  );
  const gold = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#bf9550",
        roughness: 0.42,
        metalness: 0.62
      }),
    []
  );

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <ambientLight intensity={1.15} color="#f7e4bf" />
      <directionalLight
        position={[4.5, 9.5, 6.5]}
        intensity={1.5}
        color="#ffe0a6"
        castShadow={false}
      />
      <directionalLight
        position={[-7.5, 5.5, -4.5]}
        intensity={0.65}
        color="#87a18d"
        castShadow={false}
      />
      <Environment preset="sunset" />
      <CameraRig preset={cameraPreset} />

      <group position={[0, -0.2, 0]} rotation={[-0.08, 0, 0]}>
        <mesh position={[0, -0.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[26, 22]} />
          <shadowMaterial transparent opacity={0.18} />
        </mesh>

        <mesh material={wood} position={[0, -0.18, 0]}>
          <boxGeometry args={[14.8, 0.4, 11.8]} />
        </mesh>
        <mesh material={woodDark} position={[0, 0.05, 0]}>
          <boxGeometry args={[14.1, 0.16, 11.1]} />
        </mesh>
        <mesh material={felt} position={[0, 0.16, 0]}>
          <boxGeometry args={[12.1, 0.07, 9.7]} />
        </mesh>

        <mesh material={woodDark} position={[0, 0.2, 5.15]}>
          <boxGeometry args={[14.2, 0.18, 0.76]} />
        </mesh>
        <mesh material={woodDark} position={[0, 0.2, -5.15]}>
          <boxGeometry args={[14.2, 0.18, 0.76]} />
        </mesh>
        <mesh material={woodDark} position={[-6.65, 0.2, 0]}>
          <boxGeometry args={[0.76, 0.18, 10.3]} />
        </mesh>
        <mesh material={woodDark} position={[6.65, 0.2, 0]}>
          <boxGeometry args={[0.76, 0.18, 10.3]} />
        </mesh>

        <mesh material={gold} position={[0, 0.19, 0]}>
          <torusGeometry args={[2.5, 0.045, 18, 96]} />
        </mesh>
        <mesh material={gold} position={[0, 0.19, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.1, 1.22, 64]} />
        </mesh>

        <mesh material={gold} position={[0, 0.205, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3.4, 0.08]} />
        </mesh>

        {[
          [-6.25, 0.09, -4.75],
          [6.25, 0.09, -4.75],
          [-6.25, 0.09, 4.75],
          [6.25, 0.09, 4.75]
        ].map(([x, y, z], index) => (
          <group key={index} position={[x, y, z]}>
            <mesh material={woodDark}>
              <cylinderGeometry args={[0.52, 0.6, 0.22, 32]} />
            </mesh>
            <mesh material={gold} position={[0, 0.12, 0]}>
              <torusGeometry args={[0.46, 0.05, 16, 40]} />
            </mesh>
          </group>
        ))}

        <mesh material={gold} position={[0, 0.22, -5.12]}>
          <boxGeometry args={[2.05, 0.12, 0.26]} />
        </mesh>
      </group>
    </>
  );
});

export function AlternateTableThreeSurface(
  props: AlternateTableThreeSurfaceProps
) {
  void props.layout;

  if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) {
    return <div className="alternate-three-surface" data-alt-renderer="three" aria-hidden="true" />;
  }

  return (
    <div className="alternate-three-surface" data-alt-renderer="three" aria-hidden="true">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: 34, near: 0.1, far: 50, position: [0, 7.5, 8.6] }}
      >
        <TableScene cameraPreset={props.cameraPreset} />
      </Canvas>
    </div>
  );
}
