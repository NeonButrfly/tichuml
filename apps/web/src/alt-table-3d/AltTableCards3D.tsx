import { DoubleSide, type Texture } from "three";
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

const WORLD_UNITS_PER_PX = 11.4 / DESIGN_W;
const CARD_FRAME = 0.012;
const RACK_FLOOR_Y = 0.082;
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

  return (
    <group
      position={placement.position}
      rotation={placement.rotation}
      data-seat={props.card.seat}
    >
      <mesh position={[0, 0, -CARD_FRAME]} renderOrder={2}>
        <planeGeometry args={[size.width + CARD_FRAME, size.height + CARD_FRAME]} />
        <meshStandardMaterial color="#ede1bc" metalness={0.08} roughness={0.66} />
      </mesh>
      <mesh renderOrder={3}>
        <planeGeometry args={[size.width, size.height]} />
        <meshStandardMaterial
          map={props.texture}
          metalness={0.06}
          roughness={0.54}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

function resolveHiddenHandPlacement(card: HiddenHandCard) {
  const base = designToWorld(card.anchor.center_px.x, card.anchor.center_px.y);
  const size = getHiddenCardWorldSize(card.anchor);

  switch (card.seat) {
    case "north":
      return {
        position: [
          base[0],
          RACK_FLOOR_Y + size.height / 2,
          base[2] - size.width * 0.38
        ] as const,
        rotation: [0.16, Math.PI, 0] as const
      };
    case "east":
      return {
        position: [
          base[0] + size.width * 0.48,
          RACK_FLOOR_Y + size.height / 2,
          base[2]
        ] as const,
        rotation: [0.08, -1.42, 0] as const
      };
    case "west":
      return {
        position: [
          base[0] - size.width * 0.48,
          RACK_FLOOR_Y + size.height / 2,
          base[2]
        ] as const,
        rotation: [0.08, 1.42, 0] as const
      };
  }
}

export function getHiddenCardWorldSize(anchor: Tv7CardAnchor) {
  return {
    width: anchor.w_px * WORLD_UNITS_PER_PX,
    height: anchor.h_px * WORLD_UNITS_PER_PX
  } as const;
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
