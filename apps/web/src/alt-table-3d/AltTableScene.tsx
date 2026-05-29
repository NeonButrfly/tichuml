import { useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import {
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture
} from "three";
import {
  AltTableCards3D,
  designToWorld,
  getHiddenCardWorldSize,
  getTableWorldSize,
  type HiddenHandCard
} from "./AltTableCards3D";

const TABLE_BASE_THICKNESS = 0.18;
const TABLE_FRAME_HEIGHT = 0.16;
const TABLE_FRAME_WIDTH = 0.64;
const TABLE_BORDER_WIDTH = 0.58;
const TABLE_RAISED_RIM = 0.08;
const FELT_INSET_X = 0.88;
const FELT_INSET_Z = 0.72;
const FELT_Y = TABLE_BASE_THICKNESS / 2 + 0.004;
const DRAGON_MOTIF_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <g fill="none" stroke="#a4843e" stroke-linecap="round" stroke-linejoin="round">
    <path d="M534 116c164 18 286 150 286 309 0 124-73 229-187 278-36 16-50 57-32 94 17 35 58 57 98 51-56 51-137 80-228 80-209 0-378-135-378-302 0-98 59-182 151-225 31-15 46-51 37-84-12-44 5-93 43-121 28-21 68-31 103-21-24 18-39 49-37 82 2 44 36 76 80 74 60-3 107-64 93-123-6-27-21-51-42-70z" stroke-width="32" opacity="0.24"/>
    <path d="M453 304c43-61 122-74 183-31 51 36 71 99 48 151-22 51-80 84-135 77 23 39 18 89-14 124-42 47-114 53-164 13-48-38-60-109-28-162 20-33 53-55 89-62-20-34-14-77 21-110z" stroke-width="22" opacity="0.22"/>
    <path d="M612 328l110-58M338 634l-118 62M671 566c-14 37-54 62-95 60M318 459c22-22 52-33 83-31" stroke-width="18" opacity="0.18"/>
  </g>
</svg>
`)}`;
const WOOD_GRAIN_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8a5230"/>
      <stop offset="55%" stop-color="#5a321f"/>
      <stop offset="100%" stop-color="#3f2418"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g opacity="0.22">
    <path d="M18 42c45 9 93 7 142 2 69-7 138-23 207-13 43 6 84 20 127 23" stroke="#d39a61" stroke-width="8" fill="none"/>
    <path d="M0 118c49 13 100 8 150-1 66-12 130-33 198-29 55 3 109 20 164 25" stroke="#3c2015" stroke-width="10" fill="none"/>
    <path d="M8 186c77 11 152-12 228-21 87-10 175 7 261 17" stroke="#b77849" stroke-width="8" fill="none"/>
    <path d="M0 264c73 18 150 5 223-8 90-15 182-19 272 0" stroke="#2a1710" stroke-width="10" fill="none"/>
    <path d="M13 336c48 5 95 2 143-4 95-11 190-28 286-11 24 4 47 10 70 16" stroke="#d4975d" stroke-width="8" fill="none"/>
    <path d="M0 420c65 8 129-2 193-13 108-19 215-31 319-5" stroke="#4a281b" stroke-width="10" fill="none"/>
  </g>
  <g opacity="0.08">
    <rect x="0" y="0" width="512" height="512" fill="#fff7df"/>
    <path d="M84 0v512M168 0v512M252 0v512M336 0v512M420 0v512" stroke="#1f120d" stroke-width="3"/>
  </g>
</svg>
`)}`;

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
  const [backTexture, dragonTexture, woodTexture] = useLoader(TextureLoader, [
    props.backSrc,
    DRAGON_MOTIF_SRC,
    WOOD_GRAIN_SRC
  ]);
  backTexture.colorSpace = SRGBColorSpace;
  backTexture.minFilter = LinearFilter;
  backTexture.magFilter = LinearFilter;
  backTexture.needsUpdate = true;
  dragonTexture.colorSpace = SRGBColorSpace;
  dragonTexture.minFilter = LinearFilter;
  dragonTexture.magFilter = LinearFilter;
  dragonTexture.needsUpdate = true;
  woodTexture.colorSpace = SRGBColorSpace;
  woodTexture.wrapS = RepeatWrapping;
  woodTexture.wrapT = RepeatWrapping;
  woodTexture.repeat.set(2.4, 1.6);
  woodTexture.minFilter = LinearFilter;
  woodTexture.magFilter = LinearFilter;
  woodTexture.needsUpdate = true;
  const tableSize = getTableWorldSize();
  const feltWidth = tableSize.width - FELT_INSET_X;
  const feltHeight = tableSize.height - FELT_INSET_Z;
  const outerWidth = tableSize.width + TABLE_FRAME_WIDTH;
  const outerHeight = tableSize.height + TABLE_FRAME_WIDTH;

  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight intensity={1.7} position={[2.8, 8.5, 5.4]} />
      <directionalLight intensity={0.62} position={[-3.8, 6.2, -4.9]} />

      <group>
        <TableBody
          dragonTexture={dragonTexture}
          feltHeight={feltHeight}
          feltWidth={feltWidth}
          outerHeight={outerHeight}
          outerWidth={outerWidth}
          woodTexture={woodTexture}
        />
        <RackShell cards={props.cards} seat="north" />
        <RackShell cards={props.cards} seat="east" />
        <RackShell cards={props.cards} seat="west" />

        <AltTableCards3D cards={props.cards} texture={backTexture} />
      </group>
    </>
  );
}

function TableBody(props: {
  dragonTexture: Texture;
  feltHeight: number;
  feltWidth: number;
  outerHeight: number;
  outerWidth: number;
  woodTexture: Texture;
}) {
  return (
    <group>
      <mesh position={[0, -TABLE_BASE_THICKNESS / 2, 0]} receiveShadow>
        <boxGeometry args={[props.outerWidth, TABLE_BASE_THICKNESS, props.outerHeight]} />
        <meshStandardMaterial
          color="#5b341f"
          map={props.woodTexture}
          metalness={0.1}
          roughness={0.82}
        />
      </mesh>

      <mesh
        position={[0, FELT_Y - TABLE_RAISED_RIM / 2, 0]}
        receiveShadow
      >
        <boxGeometry
          args={[
            props.feltWidth,
            TABLE_RAISED_RIM,
            props.feltHeight
          ]}
        />
        <meshStandardMaterial
          color="#35532f"
          metalness={0.03}
          roughness={0.96}
          emissive="#142a13"
          emissiveIntensity={0.34}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_Y + 0.002, 0]}>
        <planeGeometry args={[props.feltWidth - 0.1, props.feltHeight - 0.1]} />
        <meshStandardMaterial
          color="#284625"
          metalness={0.02}
          roughness={0.98}
          emissive="#102210"
          emissiveIntensity={0.22}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_Y + 0.006, 0]}>
        <planeGeometry args={[props.feltWidth * 0.46, props.feltHeight * 0.52]} />
        <meshBasicMaterial
          map={props.dragonTexture}
          transparent
          opacity={0.22}
        />
      </mesh>

      <GoldCorner position={[-props.feltWidth / 2 + 0.34, FELT_Y + 0.008, -props.feltHeight / 2 + 0.34]} flipX={false} flipZ={false} />
      <GoldCorner position={[props.feltWidth / 2 - 0.34, FELT_Y + 0.008, -props.feltHeight / 2 + 0.34]} flipX={true} flipZ={false} />
      <GoldCorner position={[-props.feltWidth / 2 + 0.34, FELT_Y + 0.008, props.feltHeight / 2 - 0.34]} flipX={false} flipZ={true} />
      <GoldCorner position={[props.feltWidth / 2 - 0.34, FELT_Y + 0.008, props.feltHeight / 2 - 0.34]} flipX={true} flipZ={true} />

      <FrameRail axis="x" length={props.outerWidth} position={[0, 0, -(props.outerHeight - TABLE_BORDER_WIDTH) / 2]} woodTexture={props.woodTexture} />
      <FrameRail axis="x" length={props.outerWidth} position={[0, 0, (props.outerHeight - TABLE_BORDER_WIDTH) / 2]} woodTexture={props.woodTexture} />
      <FrameRail axis="z" length={props.outerHeight - TABLE_BORDER_WIDTH * 2} position={[-(props.outerWidth - TABLE_BORDER_WIDTH) / 2, 0, 0]} woodTexture={props.woodTexture} />
      <FrameRail axis="z" length={props.outerHeight - TABLE_BORDER_WIDTH * 2} position={[(props.outerWidth - TABLE_BORDER_WIDTH) / 2, 0, 0]} woodTexture={props.woodTexture} />
    </group>
  );
}

function GoldCorner(props: {
  flipX: boolean;
  flipZ: boolean;
  position: [number, number, number];
}) {
  const dirX = props.flipX ? -1 : 1;
  const dirZ = props.flipZ ? -1 : 1;
  return (
    <group position={props.position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[dirX * 0.08, 0, 0]}>
        <planeGeometry args={[0.24, 0.02]} />
        <meshBasicMaterial color="#b59244" transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, dirZ * 0.08]}>
        <planeGeometry args={[0.02, 0.24]} />
        <meshBasicMaterial color="#b59244" transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[dirX * 0.18, 0, dirZ * 0.08]}>
        <planeGeometry args={[0.08, 0.02]} />
        <meshBasicMaterial color="#b59244" transparent opacity={0.65} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[dirX * 0.08, 0, dirZ * 0.18]}>
        <planeGeometry args={[0.02, 0.08]} />
        <meshBasicMaterial color="#b59244" transparent opacity={0.65} />
      </mesh>
    </group>
  );
}

function FrameRail(props: {
  axis: "x" | "z";
  length: number;
  position: [number, number, number];
  woodTexture: Texture;
}) {
  const size =
    props.axis === "x"
      ? [props.length, TABLE_FRAME_HEIGHT, TABLE_BORDER_WIDTH]
      : [TABLE_BORDER_WIDTH, TABLE_FRAME_HEIGHT, props.length];

  return (
    <mesh position={[props.position[0], TABLE_FRAME_HEIGHT / 2, props.position[2]]}>
      <boxGeometry args={size as [number, number, number]} />
      <meshStandardMaterial
        color="#734224"
        map={props.woodTexture}
        metalness={0.12}
        roughness={0.72}
      />
    </mesh>
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
  const sampleSize = getHiddenCardWorldSize(seatCards[Math.floor(seatCards.length / 2)]!.anchor);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  if (props.seat === "north") {
    const width = maxX - minX + sampleSize.width * 1.75;
    const depth = sampleSize.height * 0.94;
    const centerX = (minX + maxX) / 2;
    const centerZ = minZ - sampleSize.width * 0.7;
    return (
      <group position={[centerX, 0.05, centerZ]}>
        <mesh>
          <boxGeometry args={[width, 0.14, depth]} />
          {commonMaterial}
        </mesh>
        <mesh position={[0, 0.12, depth * 0.28]}>
          <boxGeometry args={[width - 0.24, 0.12, 0.14]} />
          {commonMaterial}
        </mesh>
      </group>
    );
  }

  const depth = sampleSize.width * 0.94;
  const height = maxZ - minZ + sampleSize.width * 2.1;
  const centerZ = (minZ + maxZ) / 2;
  const centerX =
    props.seat === "east"
      ? maxX + sampleSize.width * 0.58
      : minX - sampleSize.width * 0.58;
  return (
    <group position={[centerX, 0.05, centerZ]}>
      <mesh>
        <boxGeometry args={[depth, 0.14, height]} />
        {commonMaterial}
      </mesh>
      <mesh
        position={[
          props.seat === "east" ? -depth * 0.26 : depth * 0.26,
          0.12,
          0
        ]}
      >
        <boxGeometry args={[0.14, 0.12, height - sampleSize.width * 0.7]} />
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
