import { ContactShadows, RoundedBox, Text, useTexture } from "@react-three/drei";
import { useMemo } from "react";
import { RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import type { SeatVisualPosition } from "../table-layout";
import { ALT_TABLE_TEXTURE_URLS } from "./AltTable3DAssets";
import { AltTable3DCardMesh } from "./AltTable3DCardMesh";
import {
  ALT_TABLE_ROOT_POSITION,
  getSeatLabelPosition,
  getSeatStatusPosition,
  SEAT_TRAY_POSITIONS
} from "./AltTable3DLayout";
import type { AltTable3DSceneModel } from "./AltTable3DModel";

type Props = {
  model: AltTable3DSceneModel;
  onSouthCardClick?: (cardId: string) => void;
  onPassLaneClick?: (laneKey: string) => void;
};

function configureTexture(texture: Texture, repeatX = 1, repeatY = 1) {
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.needsUpdate = true;
  return texture;
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
      <RoundedBox args={[15.2, 0.82, 11.6]} radius={0.48} smoothness={5} castShadow receiveShadow>
        <meshStandardMaterial map={materials.walnut} roughness={0.48} metalness={0.08} />
      </RoundedBox>

      <RoundedBox
        args={[13.7, 0.42, 10.1]}
        radius={0.34}
        smoothness={5}
        position={[0, 0.24, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#2b2118" roughness={0.44} metalness={0.08} />
      </RoundedBox>

      <mesh
        position={[0, 0.445, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        userData={{ meshRole: "felt-inset" }}
      >
        <planeGeometry args={[11.8, 8.6]} />
        <meshStandardMaterial
          map={materials.felt}
          color="#36684b"
          emissive="#102219"
          emissiveIntensity={0.16}
          roughness={0.94}
          metalness={0.01}
        />
      </mesh>

      <mesh
        position={[0, 0.455, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        userData={{ meshRole: "trick-zone" }}
      >
        <ringGeometry args={[1.02, 1.7, 64]} />
        <meshStandardMaterial color="#5b4628" roughness={0.85} metalness={0.03} transparent opacity={0.72} />
      </mesh>

      <mesh position={[-1.8, 0.5, 0.15]} castShadow receiveShadow userData={{ meshRole: "deck-zone" }}>
        <boxGeometry args={[0.98, 0.22, 1.38]} />
        <meshStandardMaterial color="#f0e6cb" roughness={0.7} metalness={0.02} />
      </mesh>

      <mesh position={[1.95, 0.5, 0.18]} castShadow receiveShadow userData={{ meshRole: "discard-zone" }}>
        <boxGeometry args={[0.82, 0.12, 1.2]} />
        <meshStandardMaterial color="#ece0bf" roughness={0.72} metalness={0.02} />
      </mesh>

      {model.seats.map((seat) => {
        const trayPosition = SEAT_TRAY_POSITIONS[seat.position];
        const rotation = getSeatRotation(seat.position);
        const isActive = model.activeSeatPosition === seat.position;
        return (
          <group key={seat.position}>
            <RoundedBox
              args={[seat.position === "top" || seat.position === "bottom" ? 4.9 : 1.48, 0.66, seat.position === "top" || seat.position === "bottom" ? 1.46 : 4.4]}
              radius={0.2}
              smoothness={4}
              position={trayPosition}
              rotation={rotation}
              castShadow
              receiveShadow
              userData={{ meshRole: `seat-tray-${seat.position}` }}
            >
              <meshStandardMaterial map={materials.tray} roughness={0.56} metalness={0.06} />
            </RoundedBox>

            <mesh
              position={getSeatLabelPosition(seat.position)}
              rotation={[-Math.PI / 2, 0, 0]}
              castShadow
              receiveShadow
            >
              <planeGeometry args={[1.8, 0.48]} />
              <meshStandardMaterial map={materials.plaque} roughness={0.35} metalness={0.26} />
            </mesh>
            <Text
              position={getSeatLabelPosition(seat.position)}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.22}
              color="#faf2d5"
              anchorX="center"
              anchorY="middle"
            >
              {seat.title}
            </Text>

            <Text
              position={getSeatStatusPosition(seat.position)}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.18}
              color={isActive ? "#f5d98f" : "#d8cab0"}
              anchorX="center"
              anchorY="middle"
            >
              {seat.status}
            </Text>

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
          <planeGeometry args={[1.12, 0.64]} />
          <meshStandardMaterial
            color={lane.selected ? "#caa659" : lane.occupied ? "#8a6a3f" : "#4b5f46"}
            transparent
            opacity={lane.interactive ? 0.72 : 0.46}
            roughness={0.92}
            metalness={0.03}
          />
        </mesh>
      ))}

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

      <mesh position={[-3.6, 0.54, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, 0.44]} />
        <meshStandardMaterial map={materials.plaque} roughness={0.34} metalness={0.24} />
      </mesh>
      <Text position={[-3.6, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.18} color="#1e231d">
        {`WE ${model.score.we}`}
      </Text>

      <mesh position={[3.6, 0.54, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.56, 0.44]} />
        <meshStandardMaterial map={materials.plaque} roughness={0.34} metalness={0.24} />
      </mesh>
      <Text position={[3.6, 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.18} color="#1e231d">
        {`THEY ${model.score.they}`}
      </Text>

      <Text position={[0, 0.64, -0.05]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.26} color="#f6eed2">
        {model.phaseLabel}
      </Text>

      <ContactShadows position={[0, -0.38, 0]} scale={22} blur={2} opacity={0.3} far={8} />
    </group>
  );
}
