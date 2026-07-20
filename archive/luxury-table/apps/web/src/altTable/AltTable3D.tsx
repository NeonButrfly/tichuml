import { Suspense } from "react";

import { OrthographicCamera } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import * as THREE from "three";

import {
  DESIGN_H,
  DESIGN_W,
  type CardRackAnchor
} from "./v18CardRackMath";

export const ALT_TABLE_RENDERER = "react-three-fiber";
export const ALT_TABLE_MODE = "single_image_plane";

export type AltTablePlaneCard = {
  id: string;
  seat: CardRackAnchor["seat"];
  zone: CardRackAnchor["zone"];
  src: string;
  anchor: CardRackAnchor;
  selectedLiftPx?: number;
};

type Props = {
  cards: AltTablePlaneCard[];
};

function designToWorld(x: number, y: number, z = 0) {
  return new THREE.Vector3(x - DESIGN_W / 2, DESIGN_H / 2 - y, z);
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function ImagePlane(props: {
  src: string;
  width: number;
  height: number;
  x: number;
  y: number;
  z: number;
  rot?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
}) {
  const texture = useLoader(THREE.TextureLoader, props.src);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  return (
      <mesh
      position={designToWorld(props.x, props.y, props.z)}
      rotation={[0, 0, degToRad(-(props.rot ?? 0))]}
      scale={[props.scaleX ?? 1, props.scaleY ?? 1, 1]}
    >
      <planeGeometry args={[props.width, props.height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={props.opacity ?? 1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function CardPlane({ card }: { card: AltTablePlaneCard }) {
  let height = card.anchor.hPx;
  let y = card.anchor.centerPx.y - (card.selectedLiftPx ?? 0);

  if (card.anchor.renderMode === "north_rack_back_mostly_visible") {
    const hiddenBottom = card.anchor.hiddenBottomPx ?? 10;
    height = card.anchor.hPx - hiddenBottom;
    y = y - hiddenBottom / 2;
  }

  return (
    <ImagePlane
      src={card.src}
      width={card.anchor.wPx}
      height={height}
      x={card.anchor.centerPx.x}
      y={y}
      z={card.anchor.zIndex / 10}
      rot={card.anchor.rotationDeg}
      scaleX={card.anchor.scaleX}
      scaleY={card.anchor.scaleY}
    />
  );
}

function Scene({ cards }: Props) {
  return (
    <>
      <OrthographicCamera
        makeDefault
        left={-DESIGN_W / 2}
        right={DESIGN_W / 2}
        top={DESIGN_H / 2}
        bottom={-DESIGN_H / 2}
        near={0.1}
        far={2000}
        position={[0, 0, 1000]}
        zoom={1}
      />
      <ambientLight intensity={1} />
      {cards.map((card) => (
        <CardPlane key={card.id} card={card} />
      ))}
    </>
  );
}

export default function AltTable3D({ cards }: Props) {
  return (
    <div
      className="alt-table-board__canvas"
      data-alt-table-renderer={ALT_TABLE_RENDERER}
      data-table-mode={ALT_TABLE_MODE}
      data-testid="alt-table-3d"
      style={{ aspectRatio: "1536 / 1024" }}
    >
      <Canvas
        orthographic
        gl={{
          antialias: true,
          alpha: true
        }}
        resize={{
          scroll: false,
          debounce: { scroll: 50, resize: 50 }
        }}
      >
        <Suspense fallback={null}>
          <Scene cards={cards} />
        </Suspense>
      </Canvas>
    </div>
  );
}
