import { useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { TextureLoader, LinearFilter, SRGBColorSpace, DoubleSide, type Texture } from "three";
import {
  DESIGN_H,
  DESIGN_W,
  type DemoCard,
  type DemoSeat,
  type Tv7CardAnchor
} from "./tv7-runtime";

const CAMERA_Z = 1024;
const CAMERA_FOV_DEG = (2 * Math.atan(DESIGN_H / (2 * CAMERA_Z)) * 180) / Math.PI;

type HiddenSeat = Exclude<DemoSeat, "south">;

export type HiddenHandCard = {
  anchor: Tv7CardAnchor;
  card: DemoCard;
  handCount: number;
  seat: HiddenSeat;
  slotIndex: number;
  zone: string;
};

export function AltHiddenHands3D(props: {
  cards: HiddenHandCard[];
  backSrc: string;
}) {
  const canRender3d = useMemo(() => supportsWebGlCanvas(), []);

  return (
    <div
      className="alt-table-hidden-hands"
      data-alt-hidden-hands-layer="true"
      data-alt-hidden-hands-mode={canRender3d ? "r3f" : "meta-only"}
    >
      <div
        aria-hidden="true"
        className="alt-table-hidden-hands__meta"
        data-alt-hidden-hands-meta="true"
      >
        {props.cards.map((card) => (
          <span
            key={`${card.zone}-${card.card.id}`}
            data-card-id={card.card.id}
            data-facing-seat={card.seat}
            data-layout-source="prototype_layer"
            data-render-mode="r3f-hidden-hand"
            data-seat={card.seat}
            data-zone={card.zone}
            style={{
              left: `${card.anchor.bbox_px.x}px`,
              top: `${card.anchor.bbox_px.y}px`,
              width: `${card.anchor.bbox_px.w}px`,
              height: `${card.anchor.bbox_px.h}px`
            }}
          />
        ))}
      </div>

      {canRender3d ? (
        <Canvas
          className="alt-table-hidden-hands__canvas"
          dpr={[1, 2]}
          frameloop="demand"
          gl={{ alpha: true, antialias: true }}
          camera={{
            position: [0, 0, CAMERA_Z],
            fov: CAMERA_FOV_DEG,
            near: 1,
            far: 4096
          }}
          onCreated={({ gl }) => {
            gl.setClearAlpha(0);
          }}
        >
          <HiddenHandsScene backSrc={props.backSrc} cards={props.cards} />
        </Canvas>
      ) : null}
    </div>
  );
}

function HiddenHandsScene(props: {
  cards: HiddenHandCard[];
  backSrc: string;
}) {
  const texture = useLoader(TextureLoader, props.backSrc);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;

  return (
    <>
      {props.cards.map((card) => (
        <HiddenHandCardMesh
          key={`${card.zone}-${card.card.id}`}
          card={card}
          seat={card.seat}
          texture={texture}
        />
      ))}
    </>
  );
}

function HiddenHandCardMesh(props: {
  card: HiddenHandCard;
  seat: HiddenSeat;
  texture: Texture;
}) {
  const placement = resolveHiddenHandPlacement(props.card, props.seat);

  return (
    <group
      position={[
        placement.centerX - DESIGN_W / 2,
        DESIGN_H / 2 - placement.centerY,
        placement.depth
      ]}
      rotation={[placement.rotateX, placement.rotateY, placement.rotateZ]}
    >
      <mesh position={[0, 0, 0]} renderOrder={3}>
        <planeGeometry args={[placement.width, placement.height]} />
        <meshBasicMaterial map={props.texture} side={DoubleSide} />
      </mesh>
    </group>
  );
}

function resolveHiddenHandPlacement(card: HiddenHandCard, seat: HiddenSeat) {
  const offset = card.slotIndex - (card.handCount - 1) / 2;

  switch (seat) {
    case "north":
      return {
        centerX: DESIGN_W / 2 + offset * 34,
        centerY: 42,
        width: 84,
        height: 128,
        rotateX: -0.08,
        rotateY: 0,
        rotateZ: 0,
        depth: 8 + card.slotIndex * 0.02
      };
    case "east":
      return {
        centerX: 1498,
        centerY: 342 + offset * 21,
        width: 74,
        height: 116,
        rotateX: 0,
        rotateY: 0.56,
        rotateZ: 0,
        depth: 8 + card.slotIndex * 0.02
      };
    case "west":
      return {
        centerX: 174,
        centerY: 342 + offset * 21,
        width: 74,
        height: 116,
        rotateX: 0,
        rotateY: -0.56,
        rotateZ: 0,
        depth: 8 + card.slotIndex * 0.02
      };
  }
}

function supportsWebGlCanvas() {
  if (typeof document === "undefined") {
    return false;
  }

  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    return false;
  }

  const canvas = document.createElement("canvas");
  if (typeof canvas.getContext !== "function") {
    return false;
  }

  try {
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}
