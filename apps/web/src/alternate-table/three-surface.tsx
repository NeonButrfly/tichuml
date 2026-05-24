import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Line, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type {
  ImmersiveSceneCard,
  ImmersiveSceneModel,
  ImmersiveScenePassRoute
} from "./scene-model";

type AlternateTableThreeSurfaceProps = {
  model: ImmersiveSceneModel;
  layoutDebugEnabled?: boolean;
  onSouthCardClick?: (cardId: string) => void;
  onPassRouteClick?: (routeKey: string) => void;
};

type Vec3 = [number, number, number];
type CardTransform = {
  position: Vec3;
  rotation: Vec3;
  scale?: number;
};

const TABLE = {
  width: 12.2,
  depth: 8.6,
  topHeight: 0.32,
  cornerRadius: 0.78,
  feltWidth: 9.96,
  feltDepth: 6.32,
  feltY: 0.24,
  trimY: 0.272
} as const;

const CARD = {
  width: 0.72,
  height: 1.04,
  thickness: 0.03,
  southLift: 0.12
} as const;

const TRAYS = {
  south: { position: [0, 0.5, 3.05] as Vec3, width: 8.12, depth: 0.74, rotationY: 0 },
  north: { position: [0, 0.5, -2.78] as Vec3, width: 5.42, depth: 0.64, rotationY: Math.PI },
  west: { position: [-4.72, 0.5, 0.06] as Vec3, width: 4.38, depth: 0.64, rotationY: Math.PI / 2 - 0.18 },
  east: { position: [4.72, 0.5, 0.06] as Vec3, width: 4.38, depth: 0.64, rotationY: -Math.PI / 2 + 0.18 }
} as const;

const SIDE_TRAYS = {
  left: TRAYS.west,
  right: TRAYS.east
} as const;

const PLAQUES = {
  south: { position: [0, 0.42, 4.0] as Vec3, rotation: [-0.36, 0, 0] as Vec3, size: [1.62, 0.68, 0.08] as [number, number, number] },
  north: { position: [-2.82, 0.42, -2.56] as Vec3, rotation: [-0.12, 0.02, 0] as Vec3, size: [1.36, 0.58, 0.08] as [number, number, number] },
  west: { position: [-3.88, 0.42, 2.0] as Vec3, rotation: [-0.24, 0.1, 0.02] as Vec3, size: [1.24, 0.58, 0.08] as [number, number, number] },
  east: { position: [3.88, 0.42, 2.0] as Vec3, rotation: [-0.24, -0.1, -0.02] as Vec3, size: [1.24, 0.58, 0.08] as [number, number, number] },
  score: { position: [2.88, 0.42, -2.56] as Vec3, rotation: [-0.12, -0.02, 0] as Vec3 }
} as const;

const PASS_ROUTE_ANCHORS: Record<string, CardTransform> = {
  "bottom:left": { position: [-2.1, TABLE.feltY + 0.016, 1.38], rotation: [-Math.PI / 2, 0, 0.22] },
  "bottom:top": { position: [0, TABLE.feltY + 0.016, 1.18], rotation: [-Math.PI / 2, 0, 0] },
  "bottom:right": { position: [2.1, TABLE.feltY + 0.016, 1.38], rotation: [-Math.PI / 2, 0, -0.22] },
  "top:left": { position: [-1.72, TABLE.feltY + 0.016, -1.26], rotation: [-Math.PI / 2, 0, -0.18] },
  "top:bottom": { position: [0, TABLE.feltY + 0.016, -1.06], rotation: [-Math.PI / 2, 0, 0] },
  "top:right": { position: [1.72, TABLE.feltY + 0.016, -1.26], rotation: [-Math.PI / 2, 0, 0.18] },
  "left:top": { position: [-2.78, TABLE.feltY + 0.016, -0.92], rotation: [-Math.PI / 2, 0, 0.58] },
  "left:right": { position: [-2.5, TABLE.feltY + 0.016, 0], rotation: [-Math.PI / 2, 0, Math.PI / 2] },
  "left:bottom": { position: [-2.78, TABLE.feltY + 0.016, 0.94], rotation: [-Math.PI / 2, 0, 2.56] },
  "right:top": { position: [2.78, TABLE.feltY + 0.016, -0.92], rotation: [-Math.PI / 2, 0, -0.58] },
  "right:left": { position: [2.5, TABLE.feltY + 0.016, 0], rotation: [-Math.PI / 2, 0, -Math.PI / 2] },
  "right:bottom": { position: [2.78, TABLE.feltY + 0.016, 0.94], rotation: [-Math.PI / 2, 0, -2.56] }
};

function supportsThreeCanvas() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  return !/jsdom/i.test(window.navigator?.userAgent ?? "");
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function createCanvasTexture(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  draw(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function createWalnutTexture() {
  return createCanvasTexture(1600, 1200, (context) => {
    const gradient = context.createLinearGradient(0, 0, 0, 1200);
    gradient.addColorStop(0, "#6c472e");
    gradient.addColorStop(0.35, "#7f5333");
    gradient.addColorStop(0.7, "#694126");
    gradient.addColorStop(1, "#51311e");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1600, 1200);

    for (let index = 0; index < 68; index += 1) {
      const y = (index / 67) * 1200;
      context.strokeStyle = `rgba(255, 226, 180, ${0.018 + (index % 3) * 0.008})`;
      context.lineWidth = 1.1 + (index % 4) * 0.5;
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(240, y - 10, 980, y + 22, 1600, y - 4);
      context.stroke();
    }

    for (let index = 0; index < 24; index += 1) {
      const x = ((index * 149) % 1400) + 120;
      const y = ((index * 197) % 900) + 120;
      const rx = 34 + (index % 4) * 18;
      const ry = 12 + (index % 3) * 8;
      context.strokeStyle = "rgba(66, 35, 18, 0.28)";
      context.lineWidth = 1.8;
      for (let ring = 0; ring < 4; ring += 1) {
        context.beginPath();
        context.ellipse(x, y, rx + ring * 12, ry + ring * 7, 0, 0, Math.PI * 2);
        context.stroke();
      }
    }
  });
}

function createFeltTexture() {
  return createCanvasTexture(1600, 1200, (context) => {
    const felt = context.createLinearGradient(0, 0, 1600, 1200);
    felt.addColorStop(0, "#244d3e");
    felt.addColorStop(0.54, "#18392f");
    felt.addColorStop(1, "#102920");
    context.fillStyle = felt;
    context.fillRect(0, 0, 1600, 1200);

    for (let index = 0; index < 6200; index += 1) {
      const x = (index * 97) % 1600;
      const y = (index * 53) % 1200;
      const alpha = 0.018 + (index % 5) * 0.006;
      context.fillStyle = `rgba(255,255,255,${alpha})`;
      context.fillRect(x, y, 1, 1);
    }

    context.strokeStyle = "rgba(201, 164, 96, 0.82)";
    context.lineWidth = 4;
    drawRoundedRect(context, 132, 96, 1336, 826, 28);
    context.stroke();
    context.lineWidth = 2;
    drawRoundedRect(context, 160, 124, 1280, 770, 22);
    context.stroke();

    context.strokeStyle = "rgba(201, 164, 96, 0.44)";
    context.lineWidth = 3;
    drawRoundedRect(context, 510, 260, 580, 384, 18);
    context.stroke();

    context.fillStyle = "rgba(201, 164, 96, 0.78)";
    context.font = "700 116px Georgia";
    context.textAlign = "center";
    context.fillText("TICHU", 800, 678);

    context.strokeStyle = "rgba(201, 164, 96, 0.5)";
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(454, 646);
    context.bezierCurveTo(400, 594, 414, 510, 482, 474);
    context.bezierCurveTo(548, 438, 612, 474, 614, 552);
    context.stroke();
    context.beginPath();
    context.moveTo(1146, 646);
    context.bezierCurveTo(1200, 594, 1186, 510, 1118, 474);
    context.bezierCurveTo(1052, 438, 988, 474, 986, 552);
    context.stroke();
  });
}

function createCardBackTexture() {
  return createCanvasTexture(512, 768, (context) => {
    const fill = context.createLinearGradient(0, 0, 0, 768);
    fill.addColorStop(0, "#154c3d");
    fill.addColorStop(1, "#10392e");
    context.fillStyle = fill;
    context.fillRect(0, 0, 512, 768);
    context.strokeStyle = "rgba(232, 216, 177, 0.96)";
    context.lineWidth = 8;
    context.strokeRect(24, 24, 464, 720);
    context.lineWidth = 2;
    context.strokeRect(44, 44, 424, 680);
    context.strokeRect(64, 64, 384, 640);

    context.strokeStyle = "rgba(208, 175, 105, 0.78)";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(256, 384, 84, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(176, 384);
    context.lineTo(336, 384);
    context.moveTo(256, 304);
    context.lineTo(256, 464);
    context.stroke();
  });
}

function getCardAccent(card: ImmersiveSceneCard["card"]) {
  if (card.kind === "special") {
    switch (card.special) {
      case "dragon":
        return "#b88326";
      case "phoenix":
        return "#c2654c";
      case "dog":
        return "#7d6545";
      case "mahjong":
        return "#4c8f62";
    }
  }
  switch (card.suit) {
    case "jade":
      return "#2d8f6b";
    case "sword":
      return "#365f98";
    case "pagoda":
      return "#bc5444";
    case "star":
      return "#b98a22";
  }
}

function getCardCornerRank(card: ImmersiveSceneCard["card"]) {
  if (card.kind === "special") {
    switch (card.special) {
      case "dragon":
        return "DRG";
      case "phoenix":
        return "PHX";
      case "dog":
        return "DOG";
      case "mahjong":
        return "1";
    }
  }
  switch (card.rank) {
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
    case 14:
      return "A";
    default:
      return String(card.rank);
  }
}

function getCardCornerSuit(card: ImmersiveSceneCard["card"]) {
  if (card.kind === "special") {
    switch (card.special) {
      case "dragon":
        return "DRAGON";
      case "phoenix":
        return "PHOENIX";
      case "dog":
        return "DOG";
      case "mahjong":
        return "MAHJONG";
    }
  }
  switch (card.suit) {
    case "jade":
      return "J";
    case "sword":
      return "S";
    case "pagoda":
      return "P";
    case "star":
      return "*";
  }
}

function drawDragonArt(context: CanvasRenderingContext2D, accent: string) {
  context.strokeStyle = accent;
  context.lineWidth = 9;
  context.beginPath();
  context.moveTo(120, 420);
  context.bezierCurveTo(178, 300, 228, 260, 282, 214);
  context.bezierCurveTo(340, 168, 402, 156, 442, 182);
  context.bezierCurveTo(394, 198, 368, 224, 346, 264);
  context.bezierCurveTo(320, 314, 310, 354, 332, 390);
  context.bezierCurveTo(358, 434, 402, 450, 432, 438);
  context.stroke();
  context.beginPath();
  context.arc(454, 206, 18, 0, Math.PI * 2);
  context.stroke();
}

function drawPhoenixArt(context: CanvasRenderingContext2D, accent: string) {
  context.strokeStyle = accent;
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(256, 180);
  context.bezierCurveTo(228, 240, 182, 288, 128, 324);
  context.bezierCurveTo(194, 324, 244, 312, 292, 274);
  context.bezierCurveTo(340, 312, 390, 324, 454, 324);
  context.bezierCurveTo(402, 288, 348, 238, 318, 180);
  context.stroke();
  context.beginPath();
  context.moveTo(256, 196);
  context.bezierCurveTo(248, 292, 232, 382, 210, 520);
  context.moveTo(256, 196);
  context.bezierCurveTo(264, 292, 280, 382, 302, 520);
  context.stroke();
}

function drawDogArt(context: CanvasRenderingContext2D, accent: string) {
  context.fillStyle = accent;
  context.beginPath();
  context.arc(192, 282, 42, 0, Math.PI * 2);
  context.arc(320, 244, 54, 0, Math.PI * 2);
  context.arc(398, 306, 42, 0, Math.PI * 2);
  context.arc(254, 388, 48, 0, Math.PI * 2);
  context.fill();
}

function drawMahjongArt(context: CanvasRenderingContext2D, accent: string) {
  context.strokeStyle = accent;
  context.lineWidth = 7;
  context.strokeRect(142, 176, 228, 320);
  context.font = "700 168px Georgia";
  context.textAlign = "center";
  context.fillStyle = accent;
  context.fillText("1", 256, 378);
}

function createCardFrontTexture(item: ImmersiveSceneCard) {
  return createCanvasTexture(512, 768, (context) => {
    const accent = getCardAccent(item.card);
    const paper = context.createLinearGradient(0, 0, 0, 768);
    paper.addColorStop(0, "#fbf7ef");
    paper.addColorStop(0.52, "#f5efe4");
    paper.addColorStop(1, "#eee5d7");
    context.fillStyle = paper;
    context.fillRect(0, 0, 512, 768);

    context.strokeStyle = "rgba(179, 166, 144, 0.95)";
    context.lineWidth = 6;
    drawRoundedRect(context, 16, 16, 480, 736, 34);
    context.stroke();
    context.lineWidth = 2;
    drawRoundedRect(context, 34, 34, 444, 700, 28);
    context.stroke();

    context.fillStyle = accent;
    context.font = "700 84px Georgia";
    context.textAlign = "left";
    context.fillText(getCardCornerRank(item.card), 42, 104);
    context.font = "700 40px Georgia";
    context.fillText(getCardCornerSuit(item.card), 44, 148);

    if (item.card.kind === "special") {
      if (item.card.special === "dragon") {
        drawDragonArt(context, accent);
      } else if (item.card.special === "phoenix") {
        drawPhoenixArt(context, accent);
      } else if (item.card.special === "dog") {
        drawDogArt(context, accent);
      } else {
        drawMahjongArt(context, accent);
      }
    } else {
      context.fillStyle = accent;
      context.textAlign = "center";
      context.font = "700 170px Georgia";
      context.fillText(getCardCornerSuit(item.card), 256, 430);
    }

    if (item.legal && item.position === "bottom") {
      context.strokeStyle = "rgba(233, 197, 110, 0.54)";
      context.lineWidth = 5;
      drawRoundedRect(context, 10, 10, 492, 748, 38);
      context.stroke();
    }
  });
}

function createPlaqueTexture(title: string, subtitle: string, active: boolean) {
  return createCanvasTexture(512, 220, (context) => {
    const fill = context.createLinearGradient(0, 0, 0, 220);
    fill.addColorStop(0, active ? "#1b2623" : "#111313");
    fill.addColorStop(1, active ? "#111715" : "#090b0b");
    context.fillStyle = fill;
    drawRoundedRect(context, 10, 10, 492, 200, 26);
    context.fill();
    context.strokeStyle = active ? "#dcb46d" : "#92744a";
    context.lineWidth = 5;
    drawRoundedRect(context, 10, 10, 492, 200, 26);
    context.stroke();
    context.textAlign = "center";
    context.fillStyle = "#f1dfbf";
    context.font = "700 54px Georgia";
    context.fillText(title, 256, 92);
    context.fillStyle = active ? "#f5d48e" : "#7ecb84";
    context.font = "700 34px Arial";
    context.fillText(subtitle, 256, 154);
  });
}

function createScoreTexture(we: number, they: number) {
  return createCanvasTexture(460, 160, (context) => {
    const fill = context.createLinearGradient(0, 0, 0, 160);
    fill.addColorStop(0, "#131616");
    fill.addColorStop(1, "#080909");
    context.fillStyle = fill;
    drawRoundedRect(context, 8, 8, 444, 144, 24);
    context.fill();
    context.strokeStyle = "#95744a";
    context.lineWidth = 4;
    drawRoundedRect(context, 8, 8, 444, 144, 24);
    context.stroke();
    context.textAlign = "center";
    context.fillStyle = "#d5b178";
    context.font = "700 28px Arial";
    context.fillText("WE", 134, 52);
    context.fillText("THEY", 326, 52);
    context.fillStyle = "#f2e2c4";
    context.font = "700 64px Georgia";
    context.fillText(String(we), 134, 116);
    context.fillText(String(they), 326, 116);
  });
}

function useTexture(factory: () => THREE.Texture | null, deps: readonly unknown[]) {
  return useMemo(factory, deps);
}

function createCardMaterials(
  frontTexture: THREE.Texture | null,
  backTexture: THREE.Texture | null,
  selected: boolean,
  faceDown: boolean
) {
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: selected ? "#efe0b8" : "#ddd0c1",
    roughness: 0.74,
    metalness: 0.02
  });
  const frontMaterial = new THREE.MeshStandardMaterial({
    map: faceDown ? backTexture ?? undefined : frontTexture ?? undefined,
    color: "#ffffff",
    roughness: faceDown ? 0.42 : 0.58,
    metalness: 0.03
  });
  const rearMaterial = new THREE.MeshStandardMaterial({
    map: backTexture ?? undefined,
    color: "#ffffff",
    roughness: 0.42,
    metalness: 0.04
  });
  return [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, frontMaterial, rearMaterial];
}

function getSeatCards(cards: readonly ImmersiveSceneCard[], position: ImmersiveSceneCard["position"]) {
  return cards.filter((card) => card.position === position);
}

function getSouthCardTransform(item: ImmersiveSceneCard, index: number, count: number): CardTransform {
  const midpoint = (count - 1) / 2;
  const offset = midpoint === 0 ? 0 : (index - midpoint) / Math.max(midpoint, 1);
  const spacing = clamp(0.25 - count * 0.0016, 0.16, 0.25);
  return {
    position: [
      offset * spacing * Math.max(3.15, count * 0.42),
      0.96 + (item.selected ? CARD.southLift : 0),
      TRAYS.south.position[2] - 0.02 + Math.abs(offset) * 0.02
    ],
    rotation: [-0.08, 0, -offset * 0.05]
  };
}

function getNorthCardTransform(index: number, count: number): CardTransform {
  const midpoint = (count - 1) / 2;
  const offset = midpoint === 0 ? 0 : (index - midpoint) / Math.max(midpoint, 1);
  return {
    position: [
      offset * 0.34 * Math.max(1.48, count * 0.18),
      0.9,
      TRAYS.north.position[2] + 0.02
    ],
    rotation: [0.02, Math.PI, offset * 0.04]
  };
}

function getSideCardTransform(position: "left" | "right", index: number, count: number): CardTransform {
  const midpoint = (count - 1) / 2;
  const offset = midpoint === 0 ? 0 : (index - midpoint) / Math.max(midpoint, 1);
  const isLeft = position === "left";
  const tray = SIDE_TRAYS[position];
  return {
    position: [
      tray.position[0],
      0.9,
      tray.position[2] + offset * 0.34 * Math.max(1.26, count * 0.16)
    ],
    rotation: [0.04, isLeft ? Math.PI / 2 - 0.18 : -Math.PI / 2 + 0.18, (isLeft ? -1 : 1) * offset * 0.04]
  };
}

function getTrickCardTransform(item: ImmersiveSceneCard, index: number): CardTransform {
  const lane =
    item.position === "bottom"
      ? { x: 0, z: 1.02, rz: 0.03 }
      : item.position === "top"
        ? { x: 0, z: -0.74, rz: -0.03 }
        : item.position === "left"
          ? { x: -0.98, z: 0.02, rz: 0.16 }
          : { x: 0.98, z: 0.02, rz: -0.16 };
  return {
    position: [
      lane.x + (index - 0.5) * 0.15,
      TABLE.feltY + 0.02 + (item.winning ? 0.02 : 0),
      lane.z + Math.abs(index - 0.5) * 0.03
    ],
    rotation: [-Math.PI / 2, 0, lane.rz + index * 0.03],
    scale: 0.9
  };
}

function getPassRouteTransform(route: ImmersiveScenePassRoute): CardTransform {
  const key = `${route.sourcePosition}:${route.targetPosition}`;
  const anchor = PASS_ROUTE_ANCHORS[key];
  if (!anchor) {
    return {
      position: [0, TABLE.feltY + 0.03, 0],
      rotation: [-Math.PI / 2, 0, 0]
    };
  }
  if (route.displayMode === "pickup") {
    return {
      position: [anchor.position[0] * 0.82, anchor.position[1], anchor.position[2] * 0.52],
      rotation: anchor.rotation
    };
  }
  return anchor;
}

function CardMesh3D({
  item,
  transform,
  backTexture,
  onClick
}: {
  item: ImmersiveSceneCard;
  transform: CardTransform;
  backTexture: THREE.Texture | null;
  onClick?: (() => void) | undefined;
}) {
  const frontTexture = useTexture(() => createCardFrontTexture(item), [
    item.card.id,
    item.faceDown,
    item.selected,
    item.legal,
    item.position
  ]);
  const materials = useMemo(
    () => createCardMaterials(frontTexture, backTexture, Boolean(item.selected), Boolean(item.faceDown)),
    [backTexture, frontTexture, item.faceDown, item.selected]
  );

  return (
    <group
      position={transform.position}
      rotation={transform.rotation}
      scale={transform.scale ? transform.scale : 1}
    >
      {item.selected ? (
        <mesh position={[0, 0, -CARD.thickness * 1.6]}>
          <planeGeometry args={[CARD.width * 1.08, CARD.height * 1.08]} />
          <meshBasicMaterial color="#e8c778" transparent opacity={0.16} />
        </mesh>
      ) : null}
      <mesh
        castShadow
        receiveShadow
        material={materials}
        onPointerOver={(event) => {
          if (!onClick) {
            return;
          }
          event.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(event) => {
          if (!onClick) {
            return;
          }
          event.stopPropagation();
          document.body.style.cursor = "";
        }}
        onClick={(event) => {
          if (!onClick) {
            return;
          }
          event.stopPropagation();
          onClick();
        }}
      >
        <boxGeometry args={[CARD.width, CARD.height, CARD.thickness]} />
      </mesh>
    </group>
  );
}

function PlaqueMesh({
  position,
  rotation,
  title,
  subtitle,
  active,
  size
}: {
  position: Vec3;
  rotation: Vec3;
  title: string;
  subtitle: string;
  active: boolean;
  size: [number, number, number];
}) {
  const texture = useTexture(() => createPlaqueTexture(title, subtitle, active), [title, subtitle, active]);
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={size} radius={0.06} smoothness={4} castShadow receiveShadow>
        <meshPhongMaterial color={active ? "#15211f" : "#0f1111"} specular="#594329" shininess={30} />
      </RoundedBox>
      <mesh position={[0, 0, size[2] / 2 + 0.003]}>
        <planeGeometry args={[size[0] * 0.96, size[1] * 0.92]} />
        <meshBasicMaterial map={texture ?? undefined} color="#ffffff" />
      </mesh>
    </group>
  );
}

function ScoreMesh({ we, they }: { we: number; they: number }) {
  const texture = useTexture(() => createScoreTexture(we, they), [we, they]);
  return (
    <group position={PLAQUES.score.position} rotation={PLAQUES.score.rotation}>
      <RoundedBox args={[2.54, 0.92, 0.08]} radius={0.08} smoothness={4} castShadow receiveShadow>
        <meshPhongMaterial color="#101112" specular="#594329" shininess={28} />
      </RoundedBox>
      <mesh position={[0, 0, 0.043]}>
        <planeGeometry args={[2.42, 0.82]} />
        <meshBasicMaterial map={texture ?? undefined} color="#ffffff" />
      </mesh>
    </group>
  );
}

function CardTray({
  position,
  width,
  depth,
  rotationY
}: {
  position: Vec3;
  width: number;
  depth: number;
  rotationY: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RoundedBox args={[width, 0.12, depth]} radius={0.08} smoothness={4} castShadow receiveShadow>
        <meshPhongMaterial color="#7b4b2c" specular="#5f3e26" shininess={24} />
      </RoundedBox>
      <RoundedBox position={[0, 0.1, depth / 2 - 0.05]} args={[width, 0.16, 0.11]} radius={0.04} smoothness={4} castShadow receiveShadow>
        <meshPhongMaterial color="#8a5632" specular="#6d4529" shininess={28} />
      </RoundedBox>
      <RoundedBox position={[-width / 2 + 0.06, 0.1, 0]} args={[0.11, 0.16, depth]} radius={0.04} smoothness={4} castShadow receiveShadow>
        <meshPhongMaterial color="#8a5632" specular="#6d4529" shininess={28} />
      </RoundedBox>
      <RoundedBox position={[width / 2 - 0.06, 0.1, 0]} args={[0.11, 0.16, depth]} radius={0.04} smoothness={4} castShadow receiveShadow>
        <meshPhongMaterial color="#8a5632" specular="#6d4529" shininess={28} />
      </RoundedBox>
      <RoundedBox position={[0, 0.02, 0]} args={[width * 0.94, 0.03, depth * 0.44]} radius={0.04} smoothness={4} receiveShadow>
        <meshBasicMaterial color="#214f40" />
      </RoundedBox>
    </group>
  );
}

function PassSlotMesh({
  route,
  onClick
}: {
  route: ImmersiveScenePassRoute;
  onClick?: (() => void) | undefined;
}) {
  const transform = getPassRouteTransform(route);
  return (
    <group position={transform.position} rotation={transform.rotation}>
      <RoundedBox
        args={[0.86, 0.01, 1.08]}
        radius={0.04}
        smoothness={3}
        receiveShadow
        castShadow={false}
        onPointerOver={(event) => {
          if (!onClick) {
            return;
          }
          event.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(event) => {
          if (!onClick) {
            return;
          }
          event.stopPropagation();
          document.body.style.cursor = "";
        }}
        onClick={(event) => {
          if (!onClick) {
            return;
          }
          event.stopPropagation();
          onClick();
        }}
      >
        <meshPhongMaterial
          color={route.selected ? "#bb9550" : "#8b6a36"}
          specular="#dcc58d"
          shininess={42}
          opacity={route.occupied ? 0.8 : 0.3}
          transparent
        />
      </RoundedBox>
      <RoundedBox args={[0.72, 0.006, 0.94]} radius={0.04} smoothness={3} position={[0, 0.008, 0]}>
        <meshBasicMaterial
          color={route.selected ? "#305846" : "#214032"}
          opacity={route.occupied ? 0.82 : 0.58}
          transparent
        />
      </RoundedBox>
    </group>
  );
}

function CornerWell({ position }: { position: Vec3 }) {
  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[0.36, 0.64, 42]} />
        <meshPhongMaterial color="#2d1c12" specular="#5e432b" shininess={28} />
      </mesh>
      <mesh position={[0.12, 0.12, 0.01]}>
        <cylinderGeometry args={[0.1, 0.1, 0.03, 24]} />
        <meshPhongMaterial color="#bf4d3a" specular="#f0d2cc" shininess={38} />
      </mesh>
      <mesh position={[-0.12, -0.08, 0.01]}>
        <cylinderGeometry args={[0.1, 0.1, 0.03, 24]} />
        <meshPhongMaterial color="#d6d2c9" specular="#ffffff" shininess={34} />
      </mesh>
    </group>
  );
}

function AnchorDebug() {
  const seatPoints = [TRAYS.south.position, TRAYS.north.position, TRAYS.west.position, TRAYS.east.position] as Vec3[];
  const passPoints = Object.values(PASS_ROUTE_ANCHORS).map((anchor) => anchor.position);
  return (
    <group>
      {seatPoints.map((point, index) => (
        <mesh key={`seat-${index}`} position={point}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial color="#ffd58d" />
        </mesh>
      ))}
      {passPoints.map((point, index) => (
        <mesh key={`pass-${index}`} position={point}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshBasicMaterial color="#7bdd9d" />
        </mesh>
      ))}
      <Line
        points={[
          [-TABLE.width / 2, TABLE.feltY + 0.02, 0],
          [TABLE.width / 2, TABLE.feltY + 0.02, 0]
        ]}
        color="#d1b065"
        lineWidth={1}
      />
      <Line
        points={[
          [0, TABLE.feltY + 0.02, -TABLE.depth / 2],
          [0, TABLE.feltY + 0.02, TABLE.depth / 2]
        ]}
        color="#d1b065"
        lineWidth={1}
      />
    </group>
  );
}

function TableBackdrop() {
  return (
    <>
      <div className="alternate-three-surface__room" />
      <div
        className="alternate-three-surface__shadow"
        style={{ left: "7%", top: "24%", width: "86%", height: "62%" }}
      />
      <div
        className="alternate-three-surface__table-rim"
        style={{ left: "5%", top: "19%", width: "90%", height: "66%" }}
      />
      <div
        className="alternate-three-surface__table-face"
        style={{ left: "9%", top: "23%", width: "82%", height: "58%" }}
      />
      <div
        style={{
          position: "absolute",
          left: "16%",
          top: "29%",
          width: "68%",
          height: "46%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 50% 44%, rgba(255,255,255,0.07), transparent 46%), linear-gradient(180deg, #295847 0%, #1b4033 56%, #123027 100%)",
          boxShadow:
            "inset 0 0 0 2px rgba(212, 179, 108, 0.34), inset 0 0 0 16px rgba(10, 20, 16, 0.06)"
        }}
      />
      <div
        className="alternate-three-surface__table-sheen"
        style={{ left: "11%", top: "24%", width: "78%", height: "54%" }}
      />
      <div className="alternate-three-surface__vignette" />
    </>
  );
}

function TableScene({
  model,
  layoutDebugEnabled,
  onSouthCardClick,
  onPassRouteClick
}: {
  model: ImmersiveSceneModel;
  layoutDebugEnabled: boolean;
  onSouthCardClick?: (cardId: string) => void;
  onPassRouteClick?: (routeKey: string) => void;
}) {
  const walnutTexture = useTexture(createWalnutTexture, []);
  const feltTexture = useTexture(createFeltTexture, []);
  const cardBackTexture = useTexture(createCardBackTexture, []);
  const northCards = getSeatCards(model.remoteCards, "top");
  const westCards = getSeatCards(model.remoteCards, "left");
  const eastCards = getSeatCards(model.remoteCards, "right");
  const southCards = model.southCards;
  const railDepth = (TABLE.depth - TABLE.feltDepth) / 2 + 0.26;
  const railWidth = (TABLE.width - TABLE.feltWidth) / 2 + 0.26;

  return (
    <>
      <fog attach="fog" args={["#2c1d15", 16, 30]} />
      <ambientLight intensity={0.84} color="#f5e2c4" />
      <hemisphereLight args={["#f2e5ce", "#2b1e18", 0.82]} />
      <directionalLight
        position={[1.8, 11.6, 5.9]}
        intensity={1.72}
        color="#ffd8ab"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.00008}
      />
      <spotLight position={[-4.8, 7.8, 6.2]} intensity={0.5} angle={0.54} penumbra={0.82} color="#ffd8b1" />

      <group position={[0, 0, 0]}>
        <RoundedBox args={[TABLE.width, TABLE.topHeight, TABLE.depth]} radius={TABLE.cornerRadius} smoothness={8} position={[0, 0, 0]} castShadow receiveShadow>
          <meshPhongMaterial map={walnutTexture ?? undefined} color="#855231" specular="#6b452b" shininess={26} />
        </RoundedBox>
        <RoundedBox args={[TABLE.width - 0.76, 0.08, TABLE.depth - 0.76]} radius={0.56} smoothness={6} position={[0, 0.18, 0]} castShadow receiveShadow>
          <meshPhongMaterial color="#744726" specular="#634022" shininess={22} />
        </RoundedBox>

        <RoundedBox args={[TABLE.width, 0.2, railDepth]} radius={0.18} smoothness={6} position={[0, 0.22, -(TABLE.feltDepth + railDepth) / 2]} castShadow receiveShadow>
          <meshPhongMaterial map={walnutTexture ?? undefined} color="#94613a" specular="#764a28" shininess={28} />
        </RoundedBox>
        <RoundedBox args={[TABLE.width, 0.2, railDepth]} radius={0.18} smoothness={6} position={[0, 0.22, (TABLE.feltDepth + railDepth) / 2]} castShadow receiveShadow>
          <meshPhongMaterial map={walnutTexture ?? undefined} color="#94613a" specular="#764a28" shininess={28} />
        </RoundedBox>
        <RoundedBox args={[railWidth, 0.2, TABLE.feltDepth]} radius={0.18} smoothness={6} position={[(-TABLE.feltWidth - railWidth) / 2, 0.22, 0]} castShadow receiveShadow>
          <meshPhongMaterial map={walnutTexture ?? undefined} color="#94613a" specular="#764a28" shininess={28} />
        </RoundedBox>
        <RoundedBox args={[railWidth, 0.2, TABLE.feltDepth]} radius={0.18} smoothness={6} position={[(TABLE.feltWidth + railWidth) / 2, 0.22, 0]} castShadow receiveShadow>
          <meshPhongMaterial map={walnutTexture ?? undefined} color="#94613a" specular="#764a28" shininess={28} />
        </RoundedBox>

        <mesh position={[0, TABLE.feltY - 0.014, 0]} receiveShadow castShadow={false}>
          <boxGeometry args={[TABLE.feltWidth, 0.026, TABLE.feltDepth]} />
          <meshBasicMaterial color="#194b3b" />
        </mesh>
        <mesh position={[0, TABLE.feltY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[TABLE.feltWidth * 0.985, TABLE.feltDepth * 0.985]} />
          <meshBasicMaterial map={feltTexture ?? undefined} color="#ffffff" side={THREE.DoubleSide} />
        </mesh>
        <RoundedBox args={[TABLE.feltWidth + 0.18, 0.026, TABLE.feltDepth + 0.18]} radius={0.24} smoothness={6} position={[0, TABLE.trimY, 0]} receiveShadow>
          <meshPhongMaterial color="#c5a25a" specular="#efdca7" shininess={52} />
        </RoundedBox>

        {[
          [-5.3, 0.38, -3.62],
          [5.3, 0.38, -3.62],
          [-5.3, 0.38, 3.62],
          [5.3, 0.38, 3.62]
        ].map((position, index) => (
          <CornerWell key={`well-${index}`} position={position as Vec3} />
        ))}

        <CardTray {...TRAYS.south} />
        <CardTray {...TRAYS.north} />
        <CardTray {...TRAYS.west} />
        <CardTray {...TRAYS.east} />

        <PlaqueMesh position={PLAQUES.west.position} rotation={PLAQUES.west.rotation} title="WEST" subtitle={String(model.score.they)} active={false} size={PLAQUES.west.size} />
        <PlaqueMesh position={PLAQUES.east.position} rotation={PLAQUES.east.rotation} title="EAST" subtitle={String(model.score.they)} active={false} size={PLAQUES.east.size} />
        <PlaqueMesh position={PLAQUES.north.position} rotation={PLAQUES.north.rotation} title="NORTH" subtitle={String(model.score.we)} active={false} size={PLAQUES.north.size} />
        <PlaqueMesh position={PLAQUES.south.position} rotation={PLAQUES.south.rotation} title="SOUTH" subtitle={String(model.score.we)} active={true} size={PLAQUES.south.size} />
        <ScoreMesh we={model.score.we} they={model.score.they} />

        <mesh position={[1.18, TABLE.feltY + 0.1, -0.22]} castShadow receiveShadow>
          <boxGeometry args={[0.78, 0.16, 1.04]} />
          <meshStandardMaterial map={cardBackTexture ?? undefined} color="#ffffff" roughness={0.44} metalness={0.04} />
        </mesh>
        <mesh position={[-1.14, TABLE.feltY + 0.08, -0.16]} rotation={[-0.02, -0.12, 0.02]} castShadow receiveShadow>
          <boxGeometry args={[0.76, 0.04, 1.06]} />
          <meshStandardMaterial color="#f4efe4" roughness={0.66} metalness={0.02} />
        </mesh>

        {northCards.map((item, index) => (
          <CardMesh3D
            key={item.key}
            item={item}
            transform={getNorthCardTransform(index, northCards.length)}
            backTexture={cardBackTexture}
          />
        ))}
        {westCards.map((item, index) => (
          <CardMesh3D
            key={item.key}
            item={item}
            transform={getSideCardTransform("left", index, westCards.length)}
            backTexture={cardBackTexture}
          />
        ))}
        {eastCards.map((item, index) => (
          <CardMesh3D
            key={item.key}
            item={item}
            transform={getSideCardTransform("right", index, eastCards.length)}
            backTexture={cardBackTexture}
          />
        ))}
        {model.trickCards.map((item, index) => (
          <CardMesh3D
            key={item.key}
            item={item}
            transform={getTrickCardTransform(item, index)}
            backTexture={cardBackTexture}
          />
        ))}
        {southCards.map((item, index) => (
          <CardMesh3D
            key={item.key}
            item={item}
            transform={getSouthCardTransform(item, index, southCards.length)}
            backTexture={cardBackTexture}
            onClick={onSouthCardClick && !item.faceDown ? () => onSouthCardClick(item.card.id) : undefined}
          />
        ))}
        {model.passRoutes.map((route) => (
          <group key={route.key}>
            <PassSlotMesh
              route={route}
              onClick={onPassRouteClick && route.interactive ? () => onPassRouteClick(route.key) : undefined}
            />
            {route.assignedCard ? (
              <CardMesh3D
                item={{
                  key: `${route.key}-assigned`,
                  card: route.assignedCard,
                  position: route.targetPosition,
                  pose: route.pose,
                  width: route.width,
                  height: route.height,
                  faceDown: route.faceDown
                }}
                transform={{
                  position: [
                    getPassRouteTransform(route).position[0],
                    TABLE.feltY + 0.06,
                    getPassRouteTransform(route).position[2]
                  ],
                  rotation: getPassRouteTransform(route).rotation,
                  scale: 0.92
                }}
                backTexture={cardBackTexture}
              />
            ) : null}
          </group>
        ))}

        {layoutDebugEnabled ? <AnchorDebug /> : null}
      </group>

      <ContactShadows position={[0, 0.02, 0]} scale={24} opacity={0.34} blur={2.4} far={12} resolution={1024} color="#000000" />
    </>
  );
}

function FallbackSurface() {
  return (
    <div className="alternate-three-surface" aria-hidden="true">
      <div className="alternate-three-surface__backdrop">
        <TableBackdrop />
      </div>
    </div>
  );
}

export function AlternateTableThreeSurface({
  model,
  layoutDebugEnabled = false,
  onSouthCardClick,
  onPassRouteClick
}: AlternateTableThreeSurfaceProps) {
  if (!supportsThreeCanvas()) {
    return <FallbackSurface />;
  }

  return (
    <div className="alternate-three-surface" aria-hidden="true" data-alt-renderer="three">
      <div className="alternate-three-surface__backdrop">
        <TableBackdrop />
      </div>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        camera={{
          position: [0, 8.2, 6.4],
          fov: 24,
          near: 0.1,
          far: 40
        }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 0.68, 0.22);
        }}
      >
        <TableScene
          model={model}
          layoutDebugEnabled={layoutDebugEnabled}
          onSouthCardClick={onSouthCardClick}
          onPassRouteClick={onPassRouteClick}
        />
      </Canvas>
    </div>
  );
}
