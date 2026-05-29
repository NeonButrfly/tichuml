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

const CARD_WIDTH = 0.42;
const CARD_HEIGHT = 0.588;
const CARD_ASPECT = 2.5 / 3.5;
const CARD_BACK_INSET = 0.02;
const CARD_FRONT_INSET = 0.028;
const CARD_FRAME = 0.012;
const CARD_THICKNESS = 0.014;
const RACK_FLOOR_Y = 0.082;
const RACK_BURY_DEPTH = 0.056;
const TABLE_WORLD_W = 11.4;
const TABLE_WORLD_H = 7.6;

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
        <meshStandardMaterial color="#bda77c" metalness={0.03} roughness={0.92} />
      </mesh>
      <mesh castShadow position={[0, 0, backZ]} receiveShadow renderOrder={3}>
        <planeGeometry args={[size.width - CARD_BACK_INSET, size.height - CARD_BACK_INSET]} />
        <meshStandardMaterial
          map={props.texture}
          emissive="#152518"
          emissiveIntensity={0.28}
          metalness={0.08}
          roughness={0.46}
        />
      </mesh>
      <mesh castShadow position={[0, 0, frontZ]} receiveShadow renderOrder={2} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[size.width - CARD_FRONT_INSET, size.height - CARD_FRONT_INSET]} />
        <meshStandardMaterial
          color="#d7c7a8"
          metalness={0.02}
          roughness={0.94}
        />
      </mesh>
      <mesh castShadow position={[0, 0, backZ - 0.0003]} receiveShadow renderOrder={2}>
        <planeGeometry args={[size.width + CARD_FRAME, size.height + CARD_FRAME]} />
        <meshStandardMaterial color="#efe0b8" metalness={0.04} roughness={0.82} />
      </mesh>
    </group>
  );
}

function resolveHiddenHandPlacement(card: HiddenHandCard) {
  const base = designToWorld(card.anchor.center_px.x, card.anchor.center_px.y);
  const size = getHiddenCardWorldSize(card.anchor);
  const seatOffset = card.slotIndex - (card.handCount - 1) / 2;
  const seatCurve = Math.abs(seatOffset);
  const seatedY = RACK_FLOOR_Y + size.height / 2 - RACK_BURY_DEPTH + seatCurve * 0.0012;

  switch (card.seat) {
    case "north":
      return {
        position: [
          base[0],
          seatedY,
          base[2] - size.width * (0.4 - Math.min(seatCurve * 0.006, 0.032))
        ] as const,
        rotation: [0.12 - Math.min(seatCurve * 0.003, 0.018), seatOffset * 0.018, 0] as const
      };
    case "east":
      return {
        position: [
          base[0] + size.width * (0.36 - Math.min(seatCurve * 0.004, 0.018)),
          seatedY,
          base[2] + seatOffset * 0.01
        ] as const,
        rotation: [0.08 - Math.min(seatCurve * 0.003, 0.016), -1.02 - seatOffset * 0.014, 0] as const
      };
    case "west":
      return {
        position: [
          base[0] - size.width * (0.36 - Math.min(seatCurve * 0.004, 0.018)),
          seatedY,
          base[2] + seatOffset * 0.01
        ] as const,
        rotation: [0.08 - Math.min(seatCurve * 0.003, 0.016), 1.02 - seatOffset * 0.014, 0] as const
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
