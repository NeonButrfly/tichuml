import { RoundedBox } from "@react-three/drei";
import { DoubleSide, type CanvasTexture } from "three";
import {
  ALT_SCENE_MARKERS,
  EAST_X,
  FELT_Y,
  LABEL_Y_OFFSET,
  NORTH_RAIL_W,
  NORTH_Z,
  RAIL_DEPTH,
  RAIL_H,
  SOUTH_RAIL_W,
  SOUTH_Z,
  SIDE_RAIL_W,
  WEST_X
} from "./sceneConstants";

type RailProps = {
  label: "NORTH" | "SOUTH" | "EAST" | "WEST";
  width: number;
  position: [number, number, number];
  rotation: [number, number, number];
  woodTexture: CanvasTexture;
  labelTexture: CanvasTexture;
  labelSize: [number, number];
  labelDepthSign?: 1 | -1;
  labelRotation?: [number, number, number];
  marker: string;
  labelMarker: string;
};

function TableRail({
  label,
  width,
  position,
  rotation,
  woodTexture,
  labelTexture,
  labelSize,
  labelDepthSign = 1,
  labelRotation = [0, 0, 0],
  marker,
  labelMarker
}: RailProps) {
  const isSideRail = label === "EAST" || label === "WEST";

  return (
    <group position={position} rotation={rotation} userData={{ meshRole: marker }}>
      <RoundedBox args={[width, RAIL_H, RAIL_DEPTH]} radius={0.1} smoothness={10} castShadow receiveShadow>
        <meshStandardMaterial
          map={woodTexture}
          color="#5a240b"
          roughness={0.58}
          metalness={0.04}
          emissive="#120603"
          emissiveIntensity={0.12}
        />
      </RoundedBox>

      <mesh position={[0, RAIL_H / 2 + 0.018, -0.02]} castShadow receiveShadow>
        <boxGeometry args={[width - 0.55, 0.035, RAIL_DEPTH * 0.46]} />
        <meshStandardMaterial color="#2d1207" roughness={0.68} metalness={0.03} emissive="#0e0402" emissiveIntensity={0.08} />
      </mesh>

      <RoundedBox
        args={[width, 0.18, 0.09]}
        radius={0.06}
        smoothness={8}
        position={[0, 0.16, RAIL_DEPTH / 2 - 0.03]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial map={woodTexture} color="#2a0e04" roughness={0.68} metalness={0.03} emissive="#100402" emissiveIntensity={0.08} />
      </RoundedBox>

      <RoundedBox
        args={[width, 0.14, 0.075]}
        radius={0.05}
        smoothness={8}
        position={[0, 0.15, -RAIL_DEPTH / 2 + 0.04]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial map={woodTexture} color="#2a0e04" roughness={0.68} metalness={0.03} emissive="#100402" emissiveIntensity={0.08} />
      </RoundedBox>

      <mesh position={[0, 0.255, RAIL_DEPTH / 2 + 0.004]} receiveShadow>
        <boxGeometry args={[width - 0.2, 0.022, 0.018]} />
        <meshStandardMaterial color="#c58b2c" roughness={0.36} metalness={0.72} />
      </mesh>

      <mesh position={[0, 0.235, -RAIL_DEPTH / 2 - 0.004]} receiveShadow>
        <boxGeometry args={[width - 0.2, 0.018, 0.014]} />
        <meshStandardMaterial color="#c58b2c" roughness={0.36} metalness={0.72} />
      </mesh>

      <RoundedBox
        args={[0.18, 0.46, RAIL_DEPTH + 0.08]}
        radius={0.06}
        smoothness={8}
        position={[-(width / 2 - 0.06), 0.02, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial map={woodTexture} color="#5a240b" roughness={0.58} metalness={0.04} emissive="#120603" emissiveIntensity={0.12} />
      </RoundedBox>

      <RoundedBox
        args={[0.18, 0.46, RAIL_DEPTH + 0.08]}
        radius={0.06}
        smoothness={8}
        position={[width / 2 - 0.06, 0.02, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial map={woodTexture} color="#5a240b" roughness={0.58} metalness={0.04} emissive="#120603" emissiveIntensity={0.12} />
      </RoundedBox>

      <mesh
        position={[
          0,
          LABEL_Y_OFFSET,
          labelDepthSign * (RAIL_DEPTH / 2 + (isSideRail ? 0.014 : 0.011))
        ]}
        rotation={labelRotation}
        castShadow
        receiveShadow
        userData={{ meshRole: labelMarker }}
      >
        <planeGeometry args={labelSize} />
        <meshStandardMaterial
          map={labelTexture}
          transparent
          roughness={0.48}
          metalness={0.08}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

type Props = {
  woodTexture: CanvasTexture;
  northLabelTexture: CanvasTexture;
  southLabelTexture: CanvasTexture;
  eastLabelTexture: CanvasTexture;
  westLabelTexture: CanvasTexture;
};

export function RailMeshes({
  woodTexture,
  northLabelTexture,
  southLabelTexture,
  eastLabelTexture,
  westLabelTexture
}: Props) {
  return (
    <>
      <TableRail
        label="NORTH"
        width={NORTH_RAIL_W}
        position={[0, FELT_Y + 0.16, NORTH_Z]}
        rotation={[0, Math.PI, 0]}
        woodTexture={woodTexture}
        labelTexture={northLabelTexture}
        labelSize={[1.6, 0.33]}
        labelDepthSign={-1}
        labelRotation={[0, Math.PI, 0]}
        marker={ALT_SCENE_MARKERS.northRail}
        labelMarker={ALT_SCENE_MARKERS.northLabel}
      />
      <TableRail
        label="SOUTH"
        width={SOUTH_RAIL_W}
        position={[0, FELT_Y + 0.19, SOUTH_Z]}
        rotation={[0, 0, 0]}
        woodTexture={woodTexture}
        labelTexture={southLabelTexture}
        labelSize={[2.5, 0.43]}
        marker={ALT_SCENE_MARKERS.southRail}
        labelMarker={ALT_SCENE_MARKERS.southLabel}
      />
      <TableRail
        label="EAST"
        width={SIDE_RAIL_W}
        position={[EAST_X, FELT_Y + 0.16, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        woodTexture={woodTexture}
        labelTexture={eastLabelTexture}
        labelSize={[0.45, 1.55]}
        marker={ALT_SCENE_MARKERS.eastRail}
        labelMarker={ALT_SCENE_MARKERS.eastLabel}
      />
      <TableRail
        label="WEST"
        width={SIDE_RAIL_W}
        position={[WEST_X, FELT_Y + 0.16, 0]}
        rotation={[0, Math.PI / 2, 0]}
        woodTexture={woodTexture}
        labelTexture={westLabelTexture}
        labelSize={[0.45, 1.55]}
        marker={ALT_SCENE_MARKERS.westRail}
        labelMarker={ALT_SCENE_MARKERS.westLabel}
      />
    </>
  );
}
