import { DoubleSide, type Texture } from "three";
import type { DemoCard, DemoSeat, Tv7CardAnchor } from "./tv7-runtime";

export type HiddenSeat = Exclude<DemoSeat, "south">;

export type HiddenHandCard = {
  anchor: Tv7CardAnchor;
  card: DemoCard;
  handCount: number;
  seat: HiddenSeat;
  slotIndex: number;
  zone: string;
};

const CARD_WIDTH = 0.32;
const CARD_HEIGHT = 0.448;
const CARD_FRAME = 0.012;
const RACK_FLOOR_Y = 0.082;

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

  return (
    <group
      position={placement.position}
      rotation={placement.rotation}
      data-seat={props.card.seat}
    >
      <mesh position={[0, 0, -CARD_FRAME]} renderOrder={2}>
        <planeGeometry args={[CARD_WIDTH + CARD_FRAME, CARD_HEIGHT + CARD_FRAME]} />
        <meshStandardMaterial color="#ede1bc" metalness={0.08} roughness={0.66} />
      </mesh>
      <mesh renderOrder={3}>
        <planeGeometry args={[CARD_WIDTH, CARD_HEIGHT]} />
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
  const offset = card.slotIndex - (card.handCount - 1) / 2;

  switch (card.seat) {
    case "north":
      return {
        position: [offset * 0.24, RACK_FLOOR_Y + CARD_HEIGHT / 2, -2.9] as const,
        rotation: [0.035, 0, 0] as const
      };
    case "east":
      return {
        position: [4.22, RACK_FLOOR_Y + CARD_HEIGHT / 2, offset * 0.2] as const,
        rotation: [0.015, -1.14, 0] as const
      };
    case "west":
      return {
        position: [-4.22, RACK_FLOOR_Y + CARD_HEIGHT / 2, offset * 0.2] as const,
        rotation: [0.015, 1.14, 0] as const
      };
  }
}
