import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, RoundedBox } from "@react-three/drei";
import { memo, useMemo } from "react";
import * as THREE from "three";
import type { AlternateTableLayout } from "./layout";
import { resolveAlternateTableSceneLayout } from "./scene-layout";

export type AlternateCameraPreset = "left" | "center" | "right";

type AlternateTableThreeSurfaceProps = {
  layout: AlternateTableLayout;
  cameraYaw: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolveCameraPose(cameraYaw: number) {
  const yaw = clamp(cameraYaw, -1, 1);
  const angle = yaw * 0.34;
  const radius = 8.95 - Math.abs(yaw) * 0.28;

  return {
    position: new THREE.Vector3(
      Math.sin(angle) * radius,
      4.46 - Math.abs(yaw) * 0.1,
      Math.cos(angle) * radius
    ),
    lookAt: new THREE.Vector3(yaw * 0.68, 0.38 - Math.abs(yaw) * 0.03, 0.66)
  };
}

function CameraRig({ yaw }: { yaw: number }) {
  const target = resolveCameraPose(yaw);

  useFrame(({ camera }) => {
    camera.position.lerp(target.position, 0.1);
    camera.lookAt(target.lookAt);
  });

  return null;
}

function FeatureTray({
  feature,
  shellMaterial,
  insetMaterial,
  insetWidth = 0.82,
  insetDepth = 0.72
}: {
  feature: ReturnType<typeof resolveAlternateTableSceneLayout>["northTray"];
  shellMaterial: THREE.Material;
  insetMaterial: THREE.Material;
  insetWidth?: number;
  insetDepth?: number;
}) {
  return (
    <group
      position={[
        feature.center.x,
        feature.center.y - feature.size.y * 0.75,
        feature.center.z
      ]}
    >
      <RoundedBox
        args={[feature.size.x, 0.05, feature.size.z]}
        radius={feature.radius}
        smoothness={6}
      >
        <primitive object={shellMaterial} attach="material" />
      </RoundedBox>
      <RoundedBox
        args={[feature.size.x * insetWidth, 0.02, feature.size.z * insetDepth]}
        radius={feature.radius * 0.72}
        smoothness={6}
        position={[0, 0.02, 0]}
      >
        <primitive object={insetMaterial} attach="material" />
      </RoundedBox>
    </group>
  );
}

const TableScene = memo(function TableScene({
  layout,
  cameraYaw
}: {
  layout: AlternateTableLayout;
  cameraYaw: number;
}) {
  const sceneLayout = useMemo(() => resolveAlternateTableSceneLayout(layout), [layout]);
  const wood = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#6c3c1d",
        roughness: 0.48,
        metalness: 0.12
      }),
    []
  );
  const woodDark = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#34180c",
        roughness: 0.66,
        metalness: 0.06
      }),
    []
  );
  const felt = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#165847",
        roughness: 0.94,
        metalness: 0.02
      }),
    []
  );
  const feltDark = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0e352a",
        roughness: 0.96,
        metalness: 0.01
      }),
    []
  );
  const railHighlight = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#7f4d28",
        roughness: 0.45,
        metalness: 0.08
      }),
    []
  );

  return (
    <>
      <ambientLight intensity={1.05} color="#f7e4bf" />
      <directionalLight
        position={[4.8, 8.5, 7]}
        intensity={1.35}
        color="#ffe0a6"
        castShadow={false}
      />
      <directionalLight
        position={[-6.8, 5.2, -4.2]}
        intensity={0.55}
        color="#7da08d"
        castShadow={false}
      />
      <Environment preset="sunset" />
      <CameraRig yaw={cameraYaw} />

      <group position={[0, 0.24, 0.5]} rotation={[-0.18, 0, 0]} scale={0.98}>
        <mesh position={[0, -0.44, 0.34]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[26, 22]} />
          <shadowMaterial transparent opacity={0.14} />
        </mesh>

        <mesh material={wood} position={[0, -0.17, 0]}>
          <boxGeometry args={[15.05, 0.38, 12.15]} />
        </mesh>
        <mesh material={woodDark} position={[0, 0.03, 0]}>
          <boxGeometry args={[14.6, 0.16, 11.62]} />
        </mesh>
        <mesh material={felt} position={[0, 0.145, 0]}>
          <boxGeometry args={[12.92, 0.06, 10.34]} />
        </mesh>
        <mesh material={feltDark} position={[0, 0.168, 0]}>
          <boxGeometry args={[12.08, 0.018, 9.42]} />
        </mesh>

        <mesh material={railHighlight} position={[0, 0.19, 5.23]}>
          <boxGeometry args={[14.58, 0.12, 0.28]} />
        </mesh>
        <mesh material={railHighlight} position={[0, 0.19, -5.23]}>
          <boxGeometry args={[14.58, 0.12, 0.28]} />
        </mesh>
        <mesh material={railHighlight} position={[-6.88, 0.19, 0]}>
          <boxGeometry args={[0.28, 0.12, 10.76]} />
        </mesh>
        <mesh material={railHighlight} position={[6.88, 0.19, 0]}>
          <boxGeometry args={[0.28, 0.12, 10.76]} />
        </mesh>

        <FeatureTray
          feature={sceneLayout.northTray}
          shellMaterial={woodDark}
          insetMaterial={feltDark}
          insetWidth={0.9}
          insetDepth={0.66}
        />
        <FeatureTray
          feature={sceneLayout.westTray}
          shellMaterial={woodDark}
          insetMaterial={feltDark}
          insetWidth={0.66}
          insetDepth={0.84}
        />
        <FeatureTray
          feature={sceneLayout.eastTray}
          shellMaterial={woodDark}
          insetMaterial={feltDark}
          insetWidth={0.66}
          insetDepth={0.84}
        />
        <FeatureTray
          feature={sceneLayout.southShelf}
          shellMaterial={wood}
          insetMaterial={feltDark}
          insetWidth={0.92}
          insetDepth={0.62}
        />
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
        camera={{ fov: 30, near: 0.1, far: 50, position: [0, 4.46, 8.95] }}
      >
        <TableScene layout={props.layout} cameraYaw={props.cameraYaw} />
      </Canvas>
    </div>
  );
}
