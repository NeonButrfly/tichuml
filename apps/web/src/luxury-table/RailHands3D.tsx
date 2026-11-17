import { Suspense, useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { SRGBColorSpace, TextureLoader, FrontSide } from "three";
import type { FreshRenderableCard } from "./FreshCardsLayer";
import type { TableFit } from "./tableFit";
import {
  createRailCamera,
  getRailCardPlacement,
  RAIL_CARD_THICKNESS
} from "./rail-card-geometry";
import { FRESH_ALT_CARD_BACK_SRC } from "./freshAltTableChecks";

function StandingCards({ cards }: { cards: FreshRenderableCard[] }) {
  const back = useLoader(TextureLoader, FRESH_ALT_CARD_BACK_SRC);
  back.colorSpace = SRGBColorSpace;
  return (
    <>
      {cards.map((card) => {
        if (card.seat === "south") return null;
        const placement = getRailCardPlacement(
          card.seat,
          card.anchor.index - 1
        );
        const width = placement.width;
        return (
          <group
            key={card.id}
            position={placement.position}
            rotation={[0, placement.yaw, 0]}
          >
            <mesh>
              <boxGeometry
                args={[width, placement.height, RAIL_CARD_THICKNESS]}
              />
              <meshStandardMaterial color="#d6cba6" roughness={0.8} />
            </mesh>
            {/* +Z is the physical BACK; yaw rotates its normal toward the recipient. */}
            <mesh position={[0, 0, RAIL_CARD_THICKNESS / 2 + 0.1]}>
              <planeGeometry args={[width - 2, placement.height - 2]} />
              <meshStandardMaterial
                map={back}
                side={FrontSide}
                roughness={0.75}
              />
            </mesh>
            {/* A separate, outward-facing front. Never paint the back on both sides. */}
            <mesh
              position={[0, 0, -RAIL_CARD_THICKNESS / 2 - 0.1]}
              rotation={[0, Math.PI, 0]}
            >
              <planeGeometry args={[width - 2, placement.height - 2]} />
              <meshStandardMaterial
                color="#ece1c4"
                side={FrontSide}
                roughness={0.8}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

export function RailHands3D({
  cards,
  fit
}: {
  cards: FreshRenderableCard[];
  fit: TableFit;
}) {
  const camera = useMemo(createRailCamera, []);
  return (
    <div
      data-testid="luxury-rail-hands-3d"
      data-card-count={cards.length}
      aria-hidden="true"
      style={{
        position: "absolute",
        left: fit.offsetX,
        top: fit.offsetY,
        width: fit.renderedW,
        height: fit.renderedH,
        pointerEvents: "none",
        zIndex: 60
      }}
    >
      <Canvas
        camera={camera}
        frameloop="demand"
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={1.8} />
        <directionalLight position={[0, 1400, 1000]} intensity={2} />
        <Suspense fallback={null}>
          <StandingCards cards={cards} />
        </Suspense>
      </Canvas>
    </div>
  );
}
