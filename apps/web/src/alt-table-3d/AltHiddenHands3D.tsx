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
  seat: HiddenSeat;
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
          anchor={card.anchor}
          seat={card.seat}
          texture={texture}
        />
      ))}
    </>
  );
}

function HiddenHandCardMesh(props: {
  anchor: Tv7CardAnchor;
  seat: HiddenSeat;
  texture: Texture;
}) {
  const placement = resolveHiddenHandPlacement(props.anchor, props.seat);

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

function resolveHiddenHandPlacement(anchor: Tv7CardAnchor, seat: HiddenSeat) {
  switch (seat) {
    case "north":
      return {
        centerX: anchor.center_px.x,
        centerY: anchor.center_px.y - 10,
        width: anchor.w_px * 1.55,
        height: anchor.h_px * 1.55,
        rotateX: -0.24,
        rotateY: 0,
        rotateZ: 0,
        depth: 12 + anchor.slot * 0.05
      };
    case "east":
      return {
        centerX: anchor.center_px.x + 48,
        centerY: anchor.center_px.y + 4,
        width: anchor.w_px * 1.65,
        height: anchor.h_px * 1.65,
        rotateX: 0,
        rotateY: 0.42,
        rotateZ: 0,
        depth: 10 + anchor.slot * 0.05
      };
    case "west":
      return {
        centerX: anchor.center_px.x - 48,
        centerY: anchor.center_px.y + 4,
        width: anchor.w_px * 1.65,
        height: anchor.h_px * 1.65,
        rotateX: 0,
        rotateY: -0.42,
        rotateZ: 0,
        depth: 10 + anchor.slot * 0.05
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
