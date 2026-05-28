import { useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { LinearFilter, SRGBColorSpace, TextureLoader } from "three";
import { AltTableCards3D, designToWorld, getTableWorldSize, type HiddenHandCard } from "./AltTableCards3D";

export function AltTableScene(props: {
  cards: HiddenHandCard[];
  backSrc: string;
  tableSrc: string;
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
          <AltTableWorld backSrc={props.backSrc} cards={props.cards} tableSrc={props.tableSrc} />
        </Canvas>
      ) : null}
    </div>
  );
}

function AltTableWorld(props: {
  cards: HiddenHandCard[];
  backSrc: string;
  tableSrc: string;
}) {
  const [backTexture, tableTexture] = useLoader(TextureLoader, [
    props.backSrc,
    props.tableSrc
  ]);
  backTexture.colorSpace = SRGBColorSpace;
  backTexture.minFilter = LinearFilter;
  backTexture.magFilter = LinearFilter;
  backTexture.needsUpdate = true;
  tableTexture.colorSpace = SRGBColorSpace;
  tableTexture.minFilter = LinearFilter;
  tableTexture.magFilter = LinearFilter;
  tableTexture.needsUpdate = true;
  const tableSize = getTableWorldSize();

  return (
    <>
      <ambientLight intensity={1.08} />
      <directionalLight intensity={1.55} position={[2.5, 8.2, 4.8]} />
      <directionalLight intensity={0.55} position={[-3.2, 6.4, -4.6]} />

      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
          <planeGeometry args={[tableSize.width, tableSize.height]} />
          <meshStandardMaterial map={tableTexture} metalness={0.04} roughness={0.9} />
        </mesh>

        <RackShell cards={props.cards} seat="north" />
        <RackShell cards={props.cards} seat="east" />
        <RackShell cards={props.cards} seat="west" />

        <AltTableCards3D cards={props.cards} texture={backTexture} />
      </group>
    </>
  );
}

function RackShell(props: {
  cards: HiddenHandCard[];
  seat: "north" | "east" | "west";
}) {
  const commonMaterial = (
    <meshStandardMaterial color="#6b4125" metalness={0.12} roughness={0.7} />
  );
  const seatCards = props.cards.filter((card) => card.seat === props.seat);
  if (seatCards.length === 0) {
    return null;
  }

  const xs = seatCards.map((card) => designToWorld(card.anchor.center_px.x, card.anchor.center_px.y)[0]);
  const zs = seatCards.map((card) => designToWorld(card.anchor.center_px.x, card.anchor.center_px.y)[2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  if (props.seat === "north") {
    const width = maxX - minX + 0.9;
    const centerX = (minX + maxX) / 2;
    const centerZ = minZ - 0.22;
    return (
      <group position={[centerX, 0.05, centerZ]}>
        <mesh>
          <boxGeometry args={[width, 0.14, 0.68]} />
          {commonMaterial}
        </mesh>
        <mesh position={[0, 0.12, 0.18]}>
          <boxGeometry args={[width - 0.28, 0.12, 0.14]} />
          {commonMaterial}
        </mesh>
      </group>
    );
  }

  const height = maxZ - minZ + 1;
  const centerZ = (minZ + maxZ) / 2;
  const centerX = props.seat === "east" ? maxX + 0.18 : minX - 0.18;
  return (
    <group position={[centerX, 0.05, centerZ]}>
      <mesh>
        <boxGeometry args={[0.68, 0.14, height]} />
        {commonMaterial}
      </mesh>
      <mesh position={[props.seat === "east" ? -0.18 : 0.18, 0.12, 0]}>
        <boxGeometry args={[0.14, 0.12, height - 0.28]} />
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
