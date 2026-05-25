import type { Card } from "@tichuml/engine";
import { ContactShadows, RoundedBox, Text, useTexture } from "@react-three/drei";
import { useMemo } from "react";
import { RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import type { SeatVisualPosition } from "../table-layout";
import { ALT_TABLE_TEXTURE_URLS } from "./AltTable3DAssets";
import { AltTable3DCardMesh } from "./AltTable3DCardMesh";
import {
  ALT_TABLE_ROOT_POSITION,
  getSeatLabelPosition,
  SEAT_TRAY_POSITIONS
} from "./AltTable3DLayout";
import type { AltTable3DSceneModel } from "./AltTable3DModel";

type Props = {
  model: AltTable3DSceneModel;
  onSouthCardClick?: (cardId: string) => void;
  onPassLaneClick?: (laneKey: string) => void;
};

function Plaque({
  position,
  rotation = [-Math.PI / 2, 0, 0],
  size,
  material,
  color = "#37513f",
  label,
  fontSize,
  textColor = "#f7efd4"
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  size: [number, number];
  material: Texture;
  color?: string;
  label: string;
  fontSize: number;
  textColor?: string;
}) {
  return (
    <>
      <mesh position={position} rotation={rotation} castShadow receiveShadow>
        <planeGeometry args={size} />
        <meshStandardMaterial map={material} color={color} roughness={0.34} metalness={0.24} />
      </mesh>
      <Text
        position={[position[0], position[1] + 0.02, position[2]]}
        rotation={rotation}
        fontSize={fontSize}
        color={textColor}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </>
  );
}

function InfoBoard({
  position,
  title,
  lines
}: {
  position: [number, number, number];
  title: string;
  lines: string[];
}) {
  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0]} userData={{ meshRole: "info-board" }}>
      <mesh castShadow receiveShadow position={[0, -0.01, 0]}>
        <planeGeometry args={[2.44, 1.78]} />
        <meshStandardMaterial color="#7a542d" roughness={0.66} metalness={0.1} />
      </mesh>
      <mesh castShadow receiveShadow>
        <planeGeometry args={[2.24, 1.58]} />
        <meshStandardMaterial color="#151310" roughness={0.72} metalness={0.08} />
      </mesh>
      <Text position={[0, 0.02, -0.55]} fontSize={0.16} color="#e4c772" anchorX="center">
        {title}
      </Text>
      {lines.map((line, index) => (
        <Text
          key={line}
          position={[-0.86, 0.02, -0.12 + index * 0.28]}
          fontSize={0.12}
          color="#f2e4bf"
          anchorX="left"
        >
          {line}
        </Text>
      ))}
    </group>
  );
}

function configureTexture(texture: Texture, repeatX = 1, repeatY = 1) {
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.needsUpdate = true;
  return texture;
}

const DECK_PREVIEW_CARD = {
  id: "preview-dragon",
  kind: "special",
  special: "dragon"
} as Card;

const DISCARD_PREVIEW_CARD = {
  id: "preview-seven-spades",
  kind: "standard",
  rank: 7,
  suit: "spades"
} as Card;

function TableStack({
  center,
  count,
  faceDown,
  baseCard,
  spread = [0.022, 0.016, 0.022]
}: {
  center: [number, number, number];
  count: number;
  faceDown: boolean;
  baseCard: Card;
  spread?: [number, number, number];
}) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <AltTable3DCardMesh
          key={`${baseCard.id}-${index}`}
          card={{
            key: `${baseCard.id}-${index}`,
            card: baseCard,
            seat: "bottom",
            position: [
              center[0] + (index % 2 === 0 ? -spread[0] * index : spread[0] * index * 0.7),
              center[1] + spread[1] * index,
              center[2] + spread[2] * index
            ],
            rotation: [-Math.PI / 2 + (faceDown ? 0.015 * index : -0.025 * index), 0, faceDown ? 0 : 0.03 * index],
            faceDown,
            selected: false,
            interactive: false,
            cardId: `${baseCard.id}-${index}`
          }}
        />
      ))}
    </>
  );
}

function getSeatRotation(position: SeatVisualPosition) {
  switch (position) {
    case "top":
      return [0, Math.PI, 0] as const;
    case "right":
      return [0, -Math.PI / 2, 0] as const;
    case "bottom":
      return [0, 0, 0] as const;
    case "left":
      return [0, Math.PI / 2, 0] as const;
  }
}

export function AltTable3DTableRoot({
  model,
  onSouthCardClick,
  onPassLaneClick
}: Props) {
  const walnutTexture = useTexture(ALT_TABLE_TEXTURE_URLS.walnut) as Texture;
  const feltTexture = useTexture(ALT_TABLE_TEXTURE_URLS.felt) as Texture;
  const trayTexture = useTexture(ALT_TABLE_TEXTURE_URLS.tray) as Texture;
  const plaqueTexture = useTexture(ALT_TABLE_TEXTURE_URLS.plaque) as Texture;

  const materials = useMemo(
    () => ({
      walnut: configureTexture(walnutTexture, 2.4, 2.4),
      felt: configureTexture(feltTexture, 2.2, 2.2),
      tray: configureTexture(trayTexture, 1.4, 1.4),
      plaque: configureTexture(plaqueTexture, 1, 1)
    }),
    [feltTexture, plaqueTexture, trayTexture, walnutTexture]
  );

  return (
    <group position={ALT_TABLE_ROOT_POSITION} userData={{ meshRole: "TableRoot" }}>
      <mesh position={[0, -0.48, 0.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[22, 16]} />
        <meshStandardMaterial map={materials.walnut} color="#8e5b35" roughness={0.72} metalness={0.04} />
      </mesh>

      <RoundedBox args={[15.6, 0.82, 11.9]} radius={0.5} smoothness={5} castShadow receiveShadow>
        <meshStandardMaterial
          map={materials.walnut}
          color="#a86d40"
          roughness={0.52}
          metalness={0.08}
        />
      </RoundedBox>

      <RoundedBox
        args={[14.15, 0.42, 10.5]}
        radius={0.34}
        smoothness={5}
        position={[0, 0.24, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#3f2a17" roughness={0.4} metalness={0.08} />
      </RoundedBox>

      <mesh
        position={[0, 0.452, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        userData={{ meshRole: "felt-inset" }}
      >
        <planeGeometry args={[13.2, 9.32]} />
        <meshStandardMaterial
          map={materials.felt}
          color="#708f4a"
          emissive="#34582d"
          emissiveIntensity={0.38}
          roughness={0.94}
          metalness={0.01}
        />
      </mesh>

      <mesh
        position={[0.92, 0.458, 0.18]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        userData={{ meshRole: "trick-zone" }}
      >
        <ringGeometry args={[0.78, 1.32, 64]} />
        <meshStandardMaterial color="#847047" roughness={0.85} metalness={0.03} transparent opacity={0.34} />
      </mesh>

      <group userData={{ meshRole: "deck-zone" }}>
        <TableStack center={[-1.18, 0.62, 0.64]} count={7} faceDown baseCard={DECK_PREVIEW_CARD} />
      </group>

      <group userData={{ meshRole: "discard-zone" }}>
        <TableStack center={[1.52, 0.62, 0.62]} count={4} faceDown={false} baseCard={DISCARD_PREVIEW_CARD} />
      </group>

      {model.seats.map((seat) => {
        const trayPosition = SEAT_TRAY_POSITIONS[seat.position];
        const rotation = getSeatRotation(seat.position);
        const isActive = model.activeSeatPosition === seat.position;
        const traySize =
          seat.position === "top"
            ? ([6.1, 0.48, 0.98] as const)
            : seat.position === "bottom"
              ? ([8.1, 0.56, 0.96] as const)
              : ([0.96, 0.5, 4.82] as const);

        const labelRotation =
          seat.position === "top" || seat.position === "bottom"
            ? ([-Math.PI / 2, 0, 0] as [number, number, number])
            : ([-Math.PI / 2, 0, seat.position === "left" ? Math.PI / 2 : -Math.PI / 2] as [
                number,
                number,
                number
              ]);

        const labelSize =
          seat.position === "bottom" ? ([2.7, 0.68] as [number, number]) : ([1.84, 0.5] as [number, number]);

        return (
          <group key={seat.position}>
            <RoundedBox
              args={traySize}
              radius={0.2}
              smoothness={4}
              position={trayPosition}
              rotation={rotation}
              castShadow
              receiveShadow
              userData={{ meshRole: `seat-tray-${seat.position}` }}
            >
              <meshStandardMaterial
                map={materials.tray}
                color={isActive ? "#b4723f" : "#9f6238"}
                roughness={0.58}
                metalness={0.06}
              />
            </RoundedBox>

            <Plaque
              position={getSeatLabelPosition(seat.position)}
              rotation={labelRotation}
              size={labelSize}
              material={materials.plaque}
              label={seat.title}
              fontSize={seat.position === "bottom" ? 0.36 : 0.24}
              color="#284635"
            />

            {seat.tichuBadge && (
              <>
                <mesh
                  position={[
                    trayPosition[0] + (seat.position === "left" ? -0.72 : seat.position === "right" ? 0.72 : 0),
                    0.66,
                    trayPosition[2] + (seat.position === "top" ? -0.95 : seat.position === "bottom" ? 0.95 : 0)
                  ]}
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <cylinderGeometry args={[0.38, 0.38, 0.08, 32]} />
                  <meshStandardMaterial map={materials.plaque} color="#c4a050" metalness={0.34} roughness={0.38} />
                </mesh>
                <Text
                  position={[
                    trayPosition[0] + (seat.position === "left" ? -0.72 : seat.position === "right" ? 0.72 : 0),
                    0.72,
                    trayPosition[2] + (seat.position === "top" ? -0.95 : seat.position === "bottom" ? 0.95 : 0)
                  ]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  fontSize={0.11}
                  color="#1f2219"
                  anchorX="center"
                  anchorY="middle"
                >
                  {seat.tichuBadge}
                </Text>
              </>
            )}
          </group>
        );
      })}

      {model.passLanes.map((lane) => (
        <mesh
          key={lane.key}
          position={lane.position}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={() => onPassLaneClick?.(lane.key)}
          receiveShadow
          userData={{ meshRole: "pass-lane", laneKey: lane.key }}
        >
          <planeGeometry args={[0.98, 0.56]} />
          <meshStandardMaterial
            color={lane.selected ? "#caa659" : lane.occupied ? "#89653a" : "#53694b"}
            transparent
            opacity={lane.interactive ? 0.72 : 0.46}
            roughness={0.92}
            metalness={0.03}
          />
        </mesh>
      ))}

      <Plaque
        position={[-4.44, 0.72, -3.58]}
        size={[0.84, 0.76]}
        material={materials.plaque}
        label={"2\nPASS"}
        fontSize={0.17}
        color="#6b5226"
      />
      <Plaque
        position={[4.44, 0.72, -3.58]}
        size={[0.84, 0.76]}
        material={materials.plaque}
        label={"PASS\n1"}
        fontSize={0.17}
        color="#6b5226"
      />
      <Plaque
        position={[5.02, 0.72, 5.04]}
        size={[1.42, 0.82]}
        material={materials.plaque}
        label="PASS"
        fontSize={0.24}
        color="#2f3f30"
      />

      <InfoBoard
        position={[-4.5, 0.54, 2.56]}
        title="GRAND TICHU"
        lines={["1  DRAGON", "2  MAHJONG"]}
      />
      <InfoBoard
        position={[4.5, 0.54, 2.56]}
        title="SPECIAL CARDS"
        lines={["PHOENIX", "DRAGON", "DOG", "MAHJONG"]}
      />

      {model.southCards.map((card) => (
        <AltTable3DCardMesh key={card.key} card={card} onClick={onSouthCardClick} />
      ))}
      {model.opponentCards.map((card) => (
        <AltTable3DCardMesh key={card.key} card={card} />
      ))}
      {model.passLaneCards.map((card) => (
        <AltTable3DCardMesh key={card.key} card={card} />
      ))}
      {model.trickCards.map((card) => (
        <AltTable3DCardMesh key={card.key} card={card} />
      ))}

      <mesh position={[-4.58, 0.72, 5.02]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <planeGeometry args={[1.82, 0.76]} />
        <meshStandardMaterial map={materials.plaque} color="#2f3f30" roughness={0.34} metalness={0.24} />
      </mesh>
      <Text position={[-4.94, 0.76, 4.94]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.15} color="#f8efda">
        WE
      </Text>
      <Text position={[-4.22, 0.76, 4.94]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.15} color="#f8efda">
        THEY
      </Text>
      <Text position={[-4.94, 0.76, 5.16]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.24} color="#f8efda">
        {String(model.score.we)}
      </Text>
      <Text position={[-4.22, 0.76, 5.16]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.24} color="#f8efda">
        {String(model.score.they)}
      </Text>

      <Text position={[0, 0.56, 3.68]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.15} color="#f3df99">
        {model.phaseLabel}
      </Text>

      <ContactShadows position={[0, -0.38, 0]} scale={22} blur={2} opacity={0.3} far={8} />
    </group>
  );
}
