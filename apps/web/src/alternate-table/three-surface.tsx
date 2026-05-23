import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, RoundedBox } from "@react-three/drei";
import { memo, useMemo } from "react";
import * as THREE from "three";
import type { AlternateTableLayout } from "./layout";
import { resolveAlternateTableSceneLayout } from "./scene-layout";

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
    position: new THREE.Vector3(-4.9, 5, 9.1),
    lookAt: new THREE.Vector3(-0.45, 0.32, 1.12)
  },
  center: {
    position: new THREE.Vector3(0, 5.1, 9.35),
    lookAt: new THREE.Vector3(0, 0.32, 1.18)
  },
  right: {
    position: new THREE.Vector3(4.9, 5, 9.1),
    lookAt: new THREE.Vector3(0.45, 0.32, 1.12)
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

function FeatureTray({
  feature,
  shellMaterial,
  insetMaterial,
  insetWidth = 0.82,
  insetDepth = 0.72,
  insetHeight = 0.04
}: {
  feature: ReturnType<typeof resolveAlternateTableSceneLayout>["northTray"];
  shellMaterial: THREE.Material;
  insetMaterial: THREE.Material;
  insetWidth?: number;
  insetDepth?: number;
  insetHeight?: number;
}) {
  return (
    <group position={[feature.center.x, feature.center.y, feature.center.z]}>
      <RoundedBox
        args={[feature.size.x, feature.size.y, feature.size.z]}
        radius={feature.radius}
        smoothness={6}
      >
        <primitive object={shellMaterial} attach="material" />
      </RoundedBox>
      <RoundedBox
        args={[feature.size.x * insetWidth, insetHeight, feature.size.z * insetDepth]}
        radius={feature.radius * 0.72}
        smoothness={6}
        position={[0, feature.size.y * 0.34, 0]}
      >
        <primitive object={insetMaterial} attach="material" />
      </RoundedBox>
    </group>
  );
}

const TableScene = memo(function TableScene({
  layout,
  cameraPreset
}: {
  layout: AlternateTableLayout;
  cameraPreset: AlternateCameraPreset;
}) {
  const sceneLayout = useMemo(() => resolveAlternateTableSceneLayout(layout), [layout]);
  const wood = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#6b3d1d",
        roughness: 0.5,
        metalness: 0.14
      }),
    []
  );
  const woodDark = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#45230f",
        roughness: 0.62,
        metalness: 0.08
      }),
    []
  );
  const felt = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#155846",
        roughness: 0.9,
        metalness: 0.02
      }),
    []
  );
  const feltDark = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0d382c",
        roughness: 0.94,
        metalness: 0.01
      }),
    []
  );
  const gold = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#bf9550",
        roughness: 0.38,
        metalness: 0.68
      }),
    []
  );
  const trickBowlRadius = Math.max(
    Math.min(sceneLayout.trickBowl.size.x, sceneLayout.trickBowl.size.z) * 0.42,
    0.72
  );

  return (
    <>
      <ambientLight intensity={1.15} color="#f7e4bf" />
      <directionalLight
        position={[4.5, 8.8, 7.2]}
        intensity={1.45}
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

      <group position={[0, 0.08, 0.34]} rotation={[-0.12, 0, 0]} scale={0.95}>
        <mesh position={[0, -0.42, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
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
        <mesh material={feltDark} position={[0, 0.18, 0]}>
          <boxGeometry args={[11.15, 0.02, 8.78]} />
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
          <torusGeometry args={[1.28, 0.03, 18, 96]} />
        </mesh>
        <mesh material={gold} position={[0, 0.19, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.58, 0.7, 64]} />
        </mesh>
        <mesh material={gold} position={[0, 0.205, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.85, 0.06]} />
        </mesh>

        <FeatureTray
          feature={sceneLayout.northTray}
          shellMaterial={woodDark}
          insetMaterial={feltDark}
          insetWidth={0.88}
          insetDepth={0.68}
        />
        <FeatureTray
          feature={sceneLayout.westTray}
          shellMaterial={woodDark}
          insetMaterial={feltDark}
          insetWidth={0.72}
          insetDepth={0.82}
        />
        <FeatureTray
          feature={sceneLayout.eastTray}
          shellMaterial={woodDark}
          insetMaterial={feltDark}
          insetWidth={0.72}
          insetDepth={0.82}
        />
        <FeatureTray
          feature={sceneLayout.southShelf}
          shellMaterial={wood}
          insetMaterial={feltDark}
          insetWidth={0.9}
          insetDepth={0.64}
        />

        <mesh
          material={woodDark}
          position={[
            sceneLayout.trickBowl.center.x,
            sceneLayout.trickBowl.center.y,
            sceneLayout.trickBowl.center.z
          ]}
        >
          <cylinderGeometry
            args={[trickBowlRadius, trickBowlRadius * 1.06, 0.08, 48]}
          />
        </mesh>
        <mesh
          material={gold}
          position={[
            sceneLayout.trickBowl.center.x,
            sceneLayout.trickBowl.center.y + 0.045,
            sceneLayout.trickBowl.center.z
          ]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[trickBowlRadius * 0.88, trickBowlRadius * 1.02, 48]} />
        </mesh>

        {sceneLayout.passCups.map((cup) => (
          <group
            key={cup.key}
            position={[cup.center.x, cup.center.y, cup.center.z]}
            rotation={[0, THREE.MathUtils.degToRad(-cup.rotationDeg), 0]}
          >
            <RoundedBox
              args={[cup.size.x, cup.size.y, cup.size.z]}
              radius={cup.radius}
              smoothness={6}
            >
              <primitive object={woodDark} attach="material" />
            </RoundedBox>
            <RoundedBox
              args={[cup.size.x * 0.78, 0.035, cup.size.z * 0.72]}
              radius={cup.radius * 0.72}
              smoothness={6}
              position={[0, cup.size.y * 0.34, 0]}
            >
              <primitive object={feltDark} attach="material" />
            </RoundedBox>
          </group>
        ))}

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
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) {
    return <div className="alternate-three-surface" data-alt-renderer="three" aria-hidden="true" />;
  }

  return (
    <div className="alternate-three-surface" data-alt-renderer="three" aria-hidden="true">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: 28, near: 0.1, far: 50, position: [0, 5.1, 9.35] }}
      >
        <TableScene layout={props.layout} cameraPreset={props.cameraPreset} />
      </Canvas>
    </div>
  );
}
