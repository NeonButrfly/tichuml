import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Grid, Text } from "@react-three/drei";
import { useMemo, Suspense } from "react";
import * as THREE from "three";
import type { AltTableLayout, SideHandId, PassingLaneId } from "@tichuml/table-layout-schema";
import { generateFanLocalTransforms, SIDE_HAND_IDS, PASSING_LANE_IDS } from "@tichuml/table-layout-schema";
import type { EditorSelection } from "../state/editorState";

interface EditorPreviewProps {
  layout: AltTableLayout;
  selection: EditorSelection | null;
  onLayoutChange: (layout: AltTableLayout, description?: string) => void;
  onSelectHand: (side: SideHandId) => void;
  onSelectLane: (laneId: PassingLaneId) => void;
  onSelectArrow: (laneId: PassingLaneId) => void;
  onClearSelection: () => void;
}

export function EditorPreview(props: EditorPreviewProps) {
  const { layout, selection, onSelectHand, onSelectLane, onSelectArrow, onClearSelection } = props;

  return (
    <Canvas
      camera={{ position: [0, 12, 8], fov: 35, near: 0.1, far: 100 }}
      onPointerMissed={onClearSelection}
      gl={{ antialias: true }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 15, 5]} intensity={1.5} castShadow />
        <directionalLight position={[-5, 10, -5]} intensity={0.8} />
        <pointLight position={[0, 8, 0]} intensity={1.0} color="#fff5e6" />

        <TableSurfaceWithImage layout={layout} />

        {SIDE_HAND_IDS.map((side) => (
          <HandGroup
            key={side}
            layout={layout}
            side={side}
            selected={selection?.type === "hand" && selection.id === side}
            onSelect={() => onSelectHand(side)}
          />
        ))}

        <PassingLanesGroup
          layout={layout}
          selection={selection}
          onSelectLane={onSelectLane}
          onSelectArrow={onSelectArrow}
        />

        <Grid
          args={[20, 20]}
          position={[0, -0.01, 0]}
          cellSize={0.5}
          cellThickness={0.3}
          cellColor="#444466"
          sectionSize={2}
          sectionThickness={0.8}
          sectionColor="#666688"
          fadeDistance={25}
          fadeStrength={1}
          followCamera={false}
        />

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={5}
          maxDistance={30}
          maxPolarAngle={Math.PI / 2.2}
        />
      </Suspense>
    </Canvas>
  );
}

function TableSurfaceWithImage({ layout }: { layout: AltTableLayout }) {
  const { worldWidth, worldHeight } = layout.table;

  const texture = useLoader(
    THREE.TextureLoader,
    "/table/table.png",
    (xhr) => {
      console.log(`Table image ${(xhr.loaded / xhr.total * 100).toFixed(0)}% loaded`);
    },
    (error) => {
      console.warn("Failed to load table image, using fallback color", error);
    }
  );

  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
  }

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[worldWidth, worldHeight]} />
        {texture ? (
          <meshStandardMaterial
            map={texture}
            roughness={0.7}
            metalness={0.05}
            envMapIntensity={0.3}
          />
        ) : (
          <meshStandardMaterial color="#3d5a3e" roughness={0.8} metalness={0.1} />
        )}
      </mesh>
    </group>
  );
}

function HandGroup({
  layout,
  side,
  selected,
  onSelect
}: {
  layout: AltTableLayout;
  side: SideHandId;
  selected: boolean;
  onSelect: () => void;
}) {
  const hand = layout.hands[side];
  const { master, fan } = hand;

  const cardLocalTransforms = useMemo(() => generateFanLocalTransforms(fan), [fan]);

  const cardBackTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 180;
    const ctx = canvas.getContext("2d")!;

    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, "#1a4d3e");
    gradient.addColorStop(0.5, "#0f3a2e");
    gradient.addColorStop(1, "#1a4d3e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 180);

    ctx.strokeStyle = "#d4b86a";
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 116, 168);

    ctx.strokeStyle = "#a89050";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(12, 12, 104, 156);

    ctx.fillStyle = "#d4b86a";
    ctx.font = "bold 28px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("T", 64, 90);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, []);

  return (
    <group
      position={[master.position.x, master.position.y, master.position.z]}
      rotation={[master.rotation.x, master.rotation.y, master.rotation.z]}
    >
      <group
        position={[-master.pivot.x, -master.pivot.y, -master.pivot.z]}
        scale={[master.scale.x, master.scale.y, master.scale.z]}
      >
        {cardLocalTransforms.map((card) => (
          <mesh
            key={card.index}
            position={[card.position.x, card.position.y + fan.cardHeight / 2, card.position.z]}
            rotation={[card.rotation.x, card.rotation.y, card.rotation.z]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            castShadow
          >
            <boxGeometry args={[fan.cardWidth - fan.overlap, fan.cardHeight, 0.015]} />
            <meshStandardMaterial
              map={cardBackTexture}
              roughness={0.4}
              metalness={0.1}
              envMapIntensity={0.5}
            />
          </mesh>
        ))}

        {selected && (
          <>
            <PivotMarker pivot={master.pivot} />
            <SelectionBox
              width={fan.spread * (fan.cardCount - 1) + fan.cardWidth}
              height={fan.cardHeight + 0.2}
              depth={0.3}
            />
          </>
        )}
      </group>
    </group>
  );
}

function PassingLanesGroup({
  layout,
  selection,
  onSelectLane,
  onSelectArrow
}: {
  layout: AltTableLayout;
  selection: EditorSelection | null;
  onSelectLane: (id: PassingLaneId) => void;
  onSelectArrow: (id: PassingLaneId) => void;
}) {
  return (
    <group>
      {PASSING_LANE_IDS.map((laneId) => {
        const lane = layout.passingLanes[laneId];
        if (!lane) return null;

        const isSelectedLane = selection?.type === "lane" && selection.id === lane.id;
        const isSelectedArrow = selection?.type === "arrow" && selection.id === lane.id;

        return (
          <group key={lane.id}>
            {lane.visible && (
              <PassingLaneMesh
                lane={lane}
                selected={isSelectedLane}
                onSelect={() => onSelectLane(lane.id)}
              />
            )}

            {lane.visible && (
              <ArrowMesh
                position={[
                  lane.position.x + lane.arrowOffset.x,
                  lane.position.y + 0.03,
                  lane.position.z + lane.arrowOffset.z
                ]}
                rotation={lane.arrowRotation}
                scale={lane.arrowScale}
                selected={isSelectedArrow}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectArrow(lane.id);
                }}
              />
            )}

            {(isSelectedLane || isSelectedArrow) && (
              <mesh position={[lane.position.x, lane.position.y + 0.04, lane.position.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[lane.width + 0.08, lane.height + 0.08]} />
                <meshBasicMaterial color="#f5be28" wireframe transparent opacity={0.8} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function PassingLaneMesh({
  lane,
  selected,
  onSelect
}: {
  lane: {
    id: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    width: number;
    height: number;
    borderThickness: number;
    borderOpacity: number;
    fillOpacity: number;
  };
  selected: boolean;
  onSelect: () => void;
}) {
  const borderColor = selected ? "#f5e680" : "#f5be28";
  const fillColor = selected ? "rgba(40, 60, 45, 0.7)" : "rgba(20, 40, 28, 0.6)";

  return (
    <group
      position={[lane.position.x, lane.position.y, lane.position.z]}
      rotation={[lane.rotation.x, lane.rotation.y, lane.rotation.z]}
    >
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <planeGeometry args={[lane.width, lane.height]} />
        <meshStandardMaterial
          color={fillColor}
          transparent
          opacity={lane.fillOpacity + 0.1}
          roughness={0.6}
          metalness={0.1}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry
          args={[
            Math.min(lane.width, lane.height) / 2 - lane.borderThickness,
            Math.min(lane.width, lane.height) / 2,
            4,
            1,
            0,
            Math.PI * 2
          ]}
        />
        <meshBasicMaterial color={borderColor} transparent opacity={lane.borderOpacity} side={THREE.DoubleSide} />
      </mesh>

      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(lane.width, lane.height)]} />
        <lineBasicMaterial color={borderColor} linewidth={2} transparent opacity={lane.borderOpacity} />
      </lineSegments>

      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <edgesGeometry
          args={[
            new THREE.PlaneGeometry(
              lane.width - lane.borderThickness * 4,
              lane.height - lane.borderThickness * 4
            )
          ]}
        />
        <lineDashedMaterial
          color={borderColor}
          dashSize={0.05}
          gapSize={0.03}
          linewidth={1}
          transparent
          opacity={lane.borderOpacity * 0.8}
        />
      </lineSegments>
    </group>
  );
}

function ArrowMesh({
  position,
  rotation,
  scale,
  selected,
  onClick
}: {
  position: [number, number, number];
  rotation: number;
  scale: number;
  selected: boolean;
  onClick: (e: { stopPropagation: () => void }) => void;
}) {
  const arrowShape = useMemo(() => {
    const shape = new THREE.Shape();
    const size = 0.18;
    shape.moveTo(0, size);
    shape.lineTo(size * 0.7, 0);
    shape.lineTo(size * 0.3, 0);
    shape.lineTo(size * 0.3, -size);
    shape.lineTo(-size * 0.3, -size);
    shape.lineTo(-size * 0.3, 0);
    shape.lineTo(-size * 0.7, 0);
    shape.closePath();
    return shape;
  }, []);

  const arrowColor = selected ? "#ffcc00" : "#f5be28";

  return (
    <group position={position} rotation={[0, -rotation, 0]} scale={[scale, 1, scale]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={onClick}>
        <shapeGeometry args={[arrowShape]} />
        <meshStandardMaterial
          color={arrowColor}
          emissive={arrowColor}
          emissiveIntensity={selected ? 0.4 : 0.2}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>
    </group>
  );
}

function PivotMarker({ pivot }: { pivot: { x: number; y: number; z: number } }) {
  return (
    <group position={[pivot.x, pivot.y, pivot.z]}>
      <mesh>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color="#ff3333" emissive="#ff0000" emissiveIntensity={0.5} />
      </mesh>
      <mesh rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.4, 8]} />
        <meshBasicMaterial color="#ff3333" />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.4, 8]} />
        <meshBasicMaterial color="#33ff33" />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.015, 0.4, 8]} />
        <meshBasicMaterial color="#3333ff" />
      </mesh>
    </group>
  );
}

function SelectionBox({ width, height, depth }: { width: number; height: number; depth: number }) {
  return (
    <mesh position={[0, height / 2, 0]}>
      <boxGeometry args={[width, height, depth]} />
      <meshBasicMaterial color="#f5be28" wireframe transparent opacity={0.6} />
    </mesh>
  );
}
