import { useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { LinearFilter, SRGBColorSpace, TextureLoader } from "three";
import { AltTableCards3D, type HiddenHandCard } from "./AltTableCards3D";

export function AltTableScene(props: {
  cards: HiddenHandCard[];
  backSrc: string;
}) {
  const canRender3d = useMemo(() => supportsWebGlCanvas(), []);

  return (
    <div
      className="alt-table-world-scene"
      data-alt-hidden-hands-layer="true"
      data-alt-hidden-hands-mode={canRender3d ? "r3f" : "meta-only"}
    >
      <div
        aria-hidden="true"
        className="alt-table-world-scene__meta"
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
          className="alt-table-world-scene__canvas"
          dpr={[1, 2]}
          frameloop="demand"
          gl={{ alpha: true, antialias: true }}
          camera={{
            position: [0, 7.5, 7.5],
            fov: 40,
            near: 0.1,
            far: 64
          }}
          onCreated={({ camera, gl }) => {
            camera.lookAt(0, 0, 0);
            gl.setClearAlpha(0);
          }}
        >
          <AltTableWorld backSrc={props.backSrc} cards={props.cards} />
        </Canvas>
      ) : null}
    </div>
  );
}

function AltTableWorld(props: {
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
      <ambientLight intensity={1.08} />
      <directionalLight intensity={1.55} position={[2.5, 8.2, 4.8]} />
      <directionalLight intensity={0.55} position={[-3.2, 6.4, -4.6]} />

      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
          <planeGeometry args={[11.4, 7.5]} />
          <meshStandardMaterial
            color="#163126"
            metalness={0.02}
            roughness={0.96}
            opacity={0.08}
            transparent
          />
        </mesh>

        <RackShell seat="north" />
        <RackShell seat="east" />
        <RackShell seat="west" />

        <AltTableCards3D cards={props.cards} texture={texture} />
      </group>
    </>
  );
}

function RackShell(props: {
  seat: "north" | "east" | "west";
}) {
  const commonMaterial = (
    <meshStandardMaterial color="#6b4125" metalness={0.12} roughness={0.7} />
  );

  if (props.seat === "north") {
    return (
      <group position={[0, 0.05, -3.14]}>
        <mesh>
          <boxGeometry args={[3.9, 0.14, 0.68]} />
          {commonMaterial}
        </mesh>
        <mesh position={[0, 0.12, 0.18]}>
          <boxGeometry args={[3.66, 0.12, 0.14]} />
          {commonMaterial}
        </mesh>
      </group>
    );
  }

  const sideX = props.seat === "east" ? 4.42 : -4.42;
  return (
    <group position={[sideX, 0.05, 0]}>
      <mesh>
        <boxGeometry args={[0.68, 0.14, 3.45]} />
        {commonMaterial}
      </mesh>
      <mesh position={[props.seat === "east" ? -0.18 : 0.18, 0.12, 0]}>
        <boxGeometry args={[0.14, 0.12, 3.18]} />
        {commonMaterial}
      </mesh>
    </group>
  );
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
