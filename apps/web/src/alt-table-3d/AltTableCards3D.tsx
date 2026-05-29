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

export function getHiddenHandPresenceConfig() {
  return {
    cardWidth: CARD_WIDTH,
    cardHeight: CARD_HEIGHT,
    rackFloorY: RACK_FLOOR_Y,
    rackBuryDepth: RACK_BURY_DEPTH,
    northTilt: 0.18,
    sideYaw: 0.74
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
        <meshStandardMaterial color="#31402b" metalness={0.02} roughness={0.94} />
      </mesh>
      <mesh castShadow position={[0, 0, backZ]} receiveShadow renderOrder={3}>
        <planeGeometry args={[size.width - CARD_BACK_INSET, size.height - CARD_BACK_INSET]} />
        <meshStandardMaterial
          map={props.texture}
          emissive="#152518"
          emissiveIntensity={0.62}
          metalness={0.08}
          roughness={0.32}
        />
      </mesh>
      <mesh castShadow position={[0, 0, frontZ]} receiveShadow renderOrder={2} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[size.width - CARD_FRONT_INSET, size.height - CARD_FRONT_INSET]} />
        <meshStandardMaterial
          color="#223120"
          metalness={0.02}
          roughness={0.9}
        />
      </mesh>
      <mesh castShadow position={[0, 0, backZ - 0.0003]} receiveShadow renderOrder={2}>
        <planeGeometry args={[size.width + CARD_FRAME, size.height + CARD_FRAME]} />
        <meshStandardMaterial color="#b69a56" metalness={0.04} roughness={0.78} />
      </mesh>
    </group>
  );
}

export function resolveHiddenHandPlacement(card: HiddenHandCard) {
  const base = designToWorld(card.anchor.center_px.x, card.anchor.center_px.y);
  const size = getHiddenCardWorldSize(card.anchor);
  const seatOffset = card.slotIndex - (card.handCount - 1) / 2;
  const seatCurve = Math.abs(seatOffset);
  const seatedY = RACK_FLOOR_Y + size.height / 2 - RACK_BURY_DEPTH + seatCurve * 0.0012;
  const northTilt = 0.18;
  const sideTilt = 0.12;
  const sideYaw = 0.74;

  switch (card.seat) {
    case "north":
      return {
        position: [
          base[0],
          seatedY,
          base[2] + size.width * (0.3 - Math.min(seatCurve * 0.008, 0.04))
        ] as const,
        rotation: [northTilt - Math.min(seatCurve * 0.006, 0.04), seatOffset * 0.024, 0] as const
      };
    case "east":
      return {
        position: [
          base[0] - size.width * (0.28 - Math.min(seatCurve * 0.006, 0.03)),
          seatedY,
          base[2] + seatOffset * 0.026
        ] as const,
        rotation: [sideTilt - Math.min(seatCurve * 0.004, 0.03), -sideYaw - seatOffset * 0.01, 0] as const
      };
    case "west":
      return {
        position: [
          base[0] + size.width * (0.28 - Math.min(seatCurve * 0.006, 0.03)),
          seatedY,
          base[2] + seatOffset * 0.026
        ] as const,
        rotation: [sideTilt - Math.min(seatCurve * 0.004, 0.03), sideYaw - seatOffset * 0.01, 0] as const
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
