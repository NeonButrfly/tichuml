import { type Texture } from "three";
import { DESIGN_H, DESIGN_W, type DemoCard, type DemoSeat, type Tv7CardAnchor } from "./tv7-runtime";

export type HiddenSeat = Exclude<DemoSeat, "south">;

export type HiddenHandCard = {
  anchor: Tv7CardAnchor;
  card: DemoCard;
  handCount: number;
  seat: HiddenSeat;
  slotIndex: number;
  zone: string;
};

const CARD_WIDTH = 0.46;
const CARD_HEIGHT = 0.644;
const CARD_ASPECT = 2.5 / 3.5;
const CARD_BACK_INSET = 0.02;
const CARD_FRONT_INSET = 0.028;
const CARD_FRAME = 0.012;
const CARD_THICKNESS = 0.014;
const RACK_FLOOR_Y = 0.096;
const RACK_BURY_DEPTH = 0.03;
const TABLE_WORLD_W = 11.4;
const TABLE_WORLD_H = 7.6;

export function getAltHiddenCardMaterialConfig() {
  return {
    bodyColor: "#43523b",
    backTint: "#fff6d7",
    backEmissive: "#315335",
    backEmissiveIntensity: 1.08,
    backMetalness: 0.08,
    backRoughness: 0.18,
    frontColor: "#263823",
    frameColor: "#d6b86f"
  } as const;
}

export function getHiddenHandSeatLayoutConfig() {
  return {
    northTilt: 0.19,
    northYawSpread: 0.018,
    northForwardOffset: 0.29,
    sideTilt: 0.11,
    sideYaw: 0.68,
    sideYawSpread: 0.006,
    sideRowSpacing: 0.02,
    sideInboardOffset: 0.3
  } as const;
}

export function getHiddenHandPresenceConfig() {
  const seatLayout = getHiddenHandSeatLayoutConfig();
  return {
    cardWidth: CARD_WIDTH,
    cardHeight: CARD_HEIGHT,
    rackFloorY: RACK_FLOOR_Y,
    rackBuryDepth: RACK_BURY_DEPTH,
    northTilt: seatLayout.northTilt,
    sideYaw: seatLayout.sideYaw
  } as const;
}

export function AltTableCards3D(props: {
  cards: HiddenHandCard[];
  texture: Texture;
}) {
  return (
    <>
      {props.cards.map((card) => (
        <HiddenHandCardMesh
          key={`${card.zone}-${card.card.id}`}
          card={card}
          texture={props.texture}
        />
      ))}
    </>
  );
}

function HiddenHandCardMesh(props: {
  card: HiddenHandCard;
  texture: Texture;
}) {
  const placement = resolveHiddenHandPlacement(props.card);
  const size = getHiddenCardWorldSize(props.card.anchor);
  const material = getAltHiddenCardMaterialConfig();
  const backZ = CARD_THICKNESS / 2 + 0.0006;
  const frontZ = -CARD_THICKNESS / 2 - 0.0006;

  return (
    <group
      position={placement.position}
      rotation={placement.rotation}
      data-seat={props.card.seat}
    >
      <mesh castShadow receiveShadow renderOrder={1}>
        <boxGeometry args={[size.width, size.height, CARD_THICKNESS]} />
        <meshStandardMaterial color={material.bodyColor} metalness={0.03} roughness={0.88} />
      </mesh>
      <mesh castShadow position={[0, 0, backZ]} receiveShadow renderOrder={3}>
        <planeGeometry args={[size.width - CARD_BACK_INSET, size.height - CARD_BACK_INSET]} />
        <meshStandardMaterial
          map={props.texture}
          color={material.backTint}
          emissive={material.backEmissive}
          emissiveIntensity={material.backEmissiveIntensity}
          metalness={material.backMetalness}
          roughness={material.backRoughness}
        />
      </mesh>
      <mesh castShadow position={[0, 0, frontZ]} receiveShadow renderOrder={2} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[size.width - CARD_FRONT_INSET, size.height - CARD_FRONT_INSET]} />
        <meshStandardMaterial
          color={material.frontColor}
          metalness={0.02}
          roughness={0.9}
        />
      </mesh>
      <mesh castShadow position={[0, 0, backZ - 0.0003]} receiveShadow renderOrder={2}>
        <planeGeometry args={[size.width + CARD_FRAME, size.height + CARD_FRAME]} />
        <meshStandardMaterial color={material.frameColor} metalness={0.06} roughness={0.62} />
      </mesh>
    </group>
  );
}

export function resolveHiddenHandPlacement(card: HiddenHandCard) {
  const base = designToWorld(card.anchor.center_px.x, card.anchor.center_px.y);
  const size = getHiddenCardWorldSize(card.anchor);
  const layout = getHiddenHandSeatLayoutConfig();
  const seatOffset = card.slotIndex - (card.handCount - 1) / 2;
  const seatCurve = Math.abs(seatOffset);
  const seatedY = RACK_FLOOR_Y + size.height / 2 - RACK_BURY_DEPTH + seatCurve * 0.0012;

  switch (card.seat) {
    case "north":
      return {
        position: [
          base[0],
          seatedY,
          base[2] + size.width * (layout.northForwardOffset - Math.min(seatCurve * 0.006, 0.03))
        ] as const,
        rotation: [
          layout.northTilt - Math.min(seatCurve * 0.005, 0.034),
          seatOffset * layout.northYawSpread,
          0
        ] as const
      };
    case "east":
      return {
        position: [
          base[0] - size.width * (layout.sideInboardOffset - Math.min(seatCurve * 0.005, 0.024)),
          seatedY,
          base[2] + seatOffset * layout.sideRowSpacing
        ] as const,
        rotation: [
          layout.sideTilt - Math.min(seatCurve * 0.004, 0.03),
          -layout.sideYaw - seatOffset * layout.sideYawSpread,
          0
        ] as const
      };
    case "west":
      return {
        position: [
          base[0] + size.width * (layout.sideInboardOffset - Math.min(seatCurve * 0.005, 0.024)),
          seatedY,
          base[2] + seatOffset * layout.sideRowSpacing
        ] as const,
        rotation: [
          layout.sideTilt - Math.min(seatCurve * 0.004, 0.03),
          layout.sideYaw - seatOffset * layout.sideYawSpread,
          0
        ] as const
      };
  }
}

export function getHiddenCardWorldSize(anchor: Tv7CardAnchor) {
  void anchor;
  return {
    width: CARD_WIDTH,
    height: CARD_HEIGHT
  } as const;
}

export function getHiddenCardAspectRatio() {
  return CARD_ASPECT;
}

export function designToWorld(x: number, y: number) {
  return [
    ((x / DESIGN_W) - 0.5) * TABLE_WORLD_W,
    0,
    ((y / DESIGN_H) - 0.5) * TABLE_WORLD_H
  ] as const;
}

export function getTableWorldSize() {
  return {
    width: TABLE_WORLD_W,
    height: TABLE_WORLD_H
  } as const;
}
