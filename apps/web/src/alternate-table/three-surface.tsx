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
};

const TABLE_WORLD = {
  width: 13.4,
  depth: 9.1,
  rimHeight: 0.86,
  rimRadius: 0.44,
  feltWidth: 10.92,
  feltDepth: 6.92,
  feltHeight: 0.18,
  plaqueHeight: 0.4
} as const;

const CARD_WORLD = {
  width: 0.74,
  height: 1.06,
  thickness: 0.032,
  southLift: 0.12
} as const;

const SEAT_TRAYS = {
  bottom: { position: [0, 0.78, 3.34] as Vec3, width: 8.96, depth: 0.78, rotationY: 0 },
  top: { position: [0, 0.78, -3.24] as Vec3, width: 5.76, depth: 0.72, rotationY: Math.PI },
  left: { position: [-4.98, 0.78, 0.02] as Vec3, width: 4.72, depth: 0.72, rotationY: Math.PI / 2 },
  right: { position: [4.98, 0.78, 0.02] as Vec3, width: 4.72, depth: 0.72, rotationY: -Math.PI / 2 }
} as const;

const PASS_ROUTE_ANCHORS: Record<string, CardTransform> = {
  "bottom:left": { position: [-2.5, TABLE_WORLD.feltHeight + 0.03, 1.86], rotation: [-Math.PI / 2, 0, 0.38] },
  "bottom:top": { position: [0, TABLE_WORLD.feltHeight + 0.03, 1.58], rotation: [-Math.PI / 2, 0, 0] },
  "bottom:right": { position: [2.5, TABLE_WORLD.feltHeight + 0.03, 1.86], rotation: [-Math.PI / 2, 0, -0.38] },
  "top:left": { position: [-1.95, TABLE_WORLD.feltHeight + 0.03, -1.72], rotation: [-Math.PI / 2, 0, -0.24] },
  "top:bottom": { position: [0, TABLE_WORLD.feltHeight + 0.03, -1.48], rotation: [-Math.PI / 2, 0, 0] },
  "top:right": { position: [1.95, TABLE_WORLD.feltHeight + 0.03, -1.72], rotation: [-Math.PI / 2, 0, 0.24] },
  "left:top": { position: [-3.38, TABLE_WORLD.feltHeight + 0.03, -1.18], rotation: [-Math.PI / 2, 0, 0.82] },
  "left:right": { position: [-2.86, TABLE_WORLD.feltHeight + 0.03, 0], rotation: [-Math.PI / 2, 0, Math.PI / 2] },
  "left:bottom": { position: [-3.38, TABLE_WORLD.feltHeight + 0.03, 1.18], rotation: [-Math.PI / 2, 0, 2.26] },
  "right:top": { position: [3.38, TABLE_WORLD.feltHeight + 0.03, -1.18], rotation: [-Math.PI / 2, 0, -0.82] },
  "right:left": { position: [2.86, TABLE_WORLD.feltHeight + 0.03, 0], rotation: [-Math.PI / 2, 0, -Math.PI / 2] },
  "right:bottom": { position: [3.38, TABLE_WORLD.feltHeight + 0.03, 1.18], rotation: [-Math.PI / 2, 0, -2.26] }
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
  return createCanvasTexture(1536, 1024, (context) => {
    const gradient = context.createLinearGradient(0, 0, 0, 1024);
    gradient.addColorStop(0, "#4a2e1d");
    gradient.addColorStop(0.38, "#5a3823");
    gradient.addColorStop(0.72, "#3d2417");
    gradient.addColorStop(1, "#2a190f");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1536, 1024);

    for (let index = 0; index < 42; index += 1) {
      const y = (index / 41) * 1024;
      context.strokeStyle = `rgba(255, 224, 178, ${0.018 + (index % 4) * 0.006})`;
      context.lineWidth = 1.2 + (index % 3) * 0.7;
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(260, y - 18, 980, y + 24, 1536, y - 6);
      context.stroke();
    }

    for (let index = 0; index < 18; index += 1) {
      const x = ((index * 109) % 1300) + 96;
      const y = ((index * 149) % 760) + 120;
      const rx = 34 + (index % 4) * 18;
      const ry = 14 + (index % 5) * 8;
      context.strokeStyle = "rgba(36, 21, 13, 0.32)";
      context.lineWidth = 2;
      for (let ring = 0; ring < 4; ring += 1) {
        context.beginPath();
        context.ellipse(x, y, rx + ring * 14, ry + ring * 8, 0, 0, Math.PI * 2);
        context.stroke();
      }
    }
  });
}

function createFeltTexture() {
  return createCanvasTexture(1536, 1024, (context) => {
    context.fillStyle = "#214636";
    context.fillRect(0, 0, 1536, 1024);

    for (let index = 0; index < 3600; index += 1) {
      const x = (index * 73) % 1536;
      const y = (index * 41) % 1024;
      const alpha = 0.03 + (index % 5) * 0.006;
      context.fillStyle = `rgba(255,255,255,${alpha})`;
      context.fillRect(x, y, 1, 1);
    }

    context.strokeStyle = "rgba(201, 164, 96, 0.62)";
    context.lineWidth = 6;
    context.strokeRect(226, 132, 1084, 612);
    context.lineWidth = 2;
    context.strokeRect(246, 152, 1044, 572);

    context.fillStyle = "rgba(201, 164, 96, 0.72)";
    context.font = "700 126px Georgia";
    context.textAlign = "center";
    context.fillText("TICHU", 768, 634);

    context.font = "700 96px Georgia";
    context.fillText("S", 520, 612);
    context.fillText("S", 1016, 612);
  });
}

function createCardBackTexture() {
  return createCanvasTexture(512, 768, (context) => {
    context.fillStyle = "#1b4c41";
    context.fillRect(0, 0, 512, 768);
    context.strokeStyle = "rgba(232, 216, 177, 0.9)";
    context.lineWidth = 8;
    context.strokeRect(26, 26, 460, 716);
    context.lineWidth = 2;
    context.strokeRect(44, 44, 424, 680);

    context.strokeStyle = "rgba(208, 175, 105, 0.78)";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(256, 384, 86, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(170, 384);
    context.lineTo(342, 384);
    context.moveTo(256, 298);
    context.lineTo(256, 470);
    context.stroke();

    context.strokeStyle = "rgba(208, 175, 105, 0.36)";
    context.lineWidth = 2;
    for (let ring = 0; ring < 4; ring += 1) {
      context.strokeRect(82 + ring * 14, 82 + ring * 14, 348 - ring * 28, 604 - ring * 28);
    }
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

    context.fillStyle = "rgba(255,255,255,0.5)";
    context.fillRect(22, 22, 468, 128);
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

    context.save();
    context.globalAlpha = 0.94;
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
      context.font = "700 168px Georgia";
      context.fillText(getCardCornerSuit(item.card), 256, 426);
    }
    context.restore();

    if (item.legal && item.position === "bottom") {
      context.strokeStyle = "rgba(233, 197, 110, 0.55)";
      context.lineWidth = 5;
      drawRoundedRect(context, 10, 10, 492, 748, 38);
      context.stroke();
    }
  });
}

function createPlaqueTexture(title: string, subtitle: string, active: boolean) {
  return createCanvasTexture(512, 220, (context) => {
    const fill = context.createLinearGradient(0, 0, 0, 220);
    fill.addColorStop(0, active ? "#1f2322" : "#111313");
    fill.addColorStop(1, active ? "#171a19" : "#0a0c0c");
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

function useMaterialTexture(factory: () => THREE.Texture | null, deps: readonly unknown[]) {
  return useMemo(factory, deps);
}

function createCardMaterials(
  frontTexture: THREE.Texture | null,
  backTexture: THREE.Texture | null,
  selected: boolean
) {
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: selected ? "#efe0b8" : "#ded3c4",
    roughness: 0.74,
    metalness: 0.02
  });
  const frontMaterial = new THREE.MeshStandardMaterial({
    map: frontTexture ?? undefined,
    color: "#ffffff",
    roughness: 0.56,
    metalness: 0.02
  });
  const backMaterial = new THREE.MeshStandardMaterial({
    map: backTexture ?? undefined,
    color: "#ffffff",
    roughness: 0.46,
    metalness: 0.04
  });
  return [
    edgeMaterial,
    edgeMaterial,
    edgeMaterial,
    edgeMaterial,
    frontMaterial,
    backMaterial
  ];
}

function getSouthCardTransform(item: ImmersiveSceneCard, index: number, count: number): CardTransform {
  const midpoint = (count - 1) / 2;
  const offset = midpoint === 0 ? 0 : (index - midpoint) / Math.max(midpoint, 1);
  const spread = clamp(0.62 - count * 0.008, 0.34, 0.62);
  return {
    position: [
      offset * spread * Math.max(4.8, count * 0.78),
      1.36 + (item.selected ? CARD_WORLD.southLift : 0),
      SEAT_TRAYS.bottom.position[2] + 0.04 + Math.abs(offset) * 0.1
    ],
    rotation: [-0.05, 0, -offset * 0.18]
  };
}

function getNorthCardTransform(index: number, count: number): CardTransform {
  const midpoint = (count - 1) / 2;
  const offset = midpoint === 0 ? 0 : (index - midpoint) / Math.max(midpoint, 1);
  return {
    position: [
      offset * 0.56 * Math.max(2.1, count * 0.34),
      1.26,
      SEAT_TRAYS.top.position[2] - Math.abs(offset) * 0.03
    ],
    rotation: [-0.03, Math.PI, offset * 0.1]
  };
}

function getSideCardTransform(position: "left" | "right", index: number, count: number): CardTransform {
  const midpoint = (count - 1) / 2;
  const offset = midpoint === 0 ? 0 : (index - midpoint) / Math.max(midpoint, 1);
  const side = position === "left" ? -1 : 1;
  return {
    position: [
      SEAT_TRAYS[position].position[0] + side * Math.abs(offset) * 0.02,
      1.24,
      offset * 0.58 * Math.max(1.9, count * 0.32)
    ],
    rotation: [-0.04, position === "left" ? Math.PI / 2 : -Math.PI / 2, side * offset * 0.11]
  };
}

function getTrickCardTransform(item: ImmersiveSceneCard, index: number): CardTransform {
  const lane =
    item.position === "bottom"
      ? { x: 0, z: 0.92, rz: 0.04 }
      : item.position === "top"
        ? { x: 0, z: -0.48, rz: -0.04 }
        : item.position === "left"
          ? { x: -0.88, z: 0.06, rz: 0.24 }
          : { x: 0.88, z: 0.06, rz: -0.24 };
  return {
    position: [
      lane.x + (index - 0.5) * 0.18,
      TABLE_WORLD.feltHeight + 0.028 + (item.winning ? 0.02 : 0),
      lane.z + Math.abs(index - 0.5) * 0.06
    ],
    rotation: [-Math.PI / 2, 0, lane.rz + index * 0.04]
  };
}

function getPassRouteTransform(route: ImmersiveScenePassRoute): CardTransform {
  const key = `${route.sourcePosition}:${route.targetPosition}`;
  const anchor = PASS_ROUTE_ANCHORS[key];
  if (!anchor) {
    return {
      position: [0, TABLE_WORLD.feltHeight + 0.03, 0],
      rotation: [-Math.PI / 2, 0, 0]
    };
  }
  if (route.displayMode === "pickup") {
    return {
      position: [anchor.position[0] * 0.84, anchor.position[1], anchor.position[2] * 0.58],
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
  const frontTexture = useMaterialTexture(() => createCardFrontTexture(item), [
    item.card.id,
    item.faceDown,
    item.selected,
    item.legal,
    item.position
  ]);
  const materials = useMemo(
    () => createCardMaterials(frontTexture, backTexture, Boolean(item.selected)),
    [backTexture, frontTexture, item.selected]
  );

  return (
    <group position={transform.position} rotation={transform.rotation}>
      {item.selected ? (
        <mesh position={[0, 0, -CARD_WORLD.thickness * 1.4]}>
          <planeGeometry args={[CARD_WORLD.width * 1.08, CARD_WORLD.height * 1.08]} />
          <meshBasicMaterial color="#e8c778" transparent opacity={0.18} />
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
        <boxGeometry args={[CARD_WORLD.width, CARD_WORLD.height, CARD_WORLD.thickness]} />
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
  size = [1.9, 0.84, 0.08]
}: {
  position: Vec3;
  rotation: Vec3;
  title: string;
  subtitle: string;
  active: boolean;
  size?: [number, number, number];
}) {
  const texture = useMaterialTexture(
    () => createPlaqueTexture(title, subtitle, active),
    [title, subtitle, active]
  );
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={size} radius={0.06} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color={active ? "#171a1a" : "#0f1111"} roughness={0.48} metalness={0.18} />
      </RoundedBox>
      <mesh position={[0, 0, size[2] / 2 + 0.002]}>
        <planeGeometry args={[size[0] * 0.96, size[1] * 0.92]} />
        <meshStandardMaterial map={texture ?? undefined} color="#ffffff" roughness={0.36} metalness={0.08} />
      </mesh>
    </group>
  );
}

function ScoreMesh({ we, they }: { we: number; they: number }) {
  const texture = useMaterialTexture(() => createScoreTexture(we, they), [we, they]);
  return (
    <group position={[-0.2, 0.56, 3.18]} rotation={[-0.34, 0, 0]}>
      <RoundedBox args={[2.54, 0.92, 0.08]} radius={0.08} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#101112" roughness={0.42} metalness={0.2} />
      </RoundedBox>
      <mesh position={[0, 0, 0.043]}>
        <planeGeometry args={[2.42, 0.82]} />
        <meshStandardMaterial map={texture ?? undefined} color="#ffffff" roughness={0.36} metalness={0.08} />
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
      <RoundedBox args={[width, 0.18, depth]} radius={0.08} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#5a3823" roughness={0.62} metalness={0.06} />
      </RoundedBox>
      <RoundedBox position={[0, 0.16, depth / 2 - 0.07]} args={[width, 0.28, 0.16]} radius={0.05} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#6a4429" roughness={0.58} metalness={0.06} />
      </RoundedBox>
      <RoundedBox position={[-width / 2 + 0.08, 0.14, 0]} args={[0.16, 0.24, depth]} radius={0.05} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#6a4429" roughness={0.58} metalness={0.06} />
      </RoundedBox>
      <RoundedBox position={[width / 2 - 0.08, 0.14, 0]} args={[0.16, 0.24, depth]} radius={0.05} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#6a4429" roughness={0.58} metalness={0.06} />
      </RoundedBox>
      <RoundedBox position={[0, 0.02, 0]} args={[width * 0.94, 0.06, depth * 0.42]} radius={0.04} smoothness={4} receiveShadow>
        <meshStandardMaterial color="#1b3f31" roughness={0.92} metalness={0.02} />
      </RoundedBox>
    </group>
  );
}

function FeltWatermark() {
  return (
    <group position={[0, TABLE_WORLD.feltHeight + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <planeGeometry args={[TABLE_WORLD.feltWidth * 0.9, TABLE_WORLD.feltDepth * 0.9]} />
        <meshBasicMaterial color="#c8a264" transparent opacity={0.055} />
      </mesh>
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
        args={[0.92, 0.02, 1.26]}
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
        <meshStandardMaterial
          color={route.selected ? "#7b6540" : "#5b472d"}
          roughness={0.86}
          metalness={0.08}
          opacity={route.occupied ? 0.86 : 0.56}
          transparent
        />
      </RoundedBox>
      <mesh position={[0, 0.0125, 0]}>
        <planeGeometry args={[0.78, 1.14]} />
        <meshBasicMaterial
          color={route.selected ? "#edcd89" : "#c8ab74"}
          transparent
          opacity={route.occupied ? 0.12 : 0.08}
        />
      </mesh>
    </group>
  );
}

function AnchorDebug() {
  const points = [
    SEAT_TRAYS.bottom.position,
    SEAT_TRAYS.top.position,
    SEAT_TRAYS.left.position,
    SEAT_TRAYS.right.position
  ] as Vec3[];
  const passPoints = Object.values(PASS_ROUTE_ANCHORS).map((anchor) => anchor.position);
  return (
    <group>
      {points.map((point, index) => (
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
          [-TABLE_WORLD.width / 2, TABLE_WORLD.feltHeight + 0.02, 0],
          [TABLE_WORLD.width / 2, TABLE_WORLD.feltHeight + 0.02, 0]
        ]}
        color="#d1b065"
        lineWidth={1}
      />
      <Line
        points={[
          [0, TABLE_WORLD.feltHeight + 0.02, -TABLE_WORLD.depth / 2],
          [0, TABLE_WORLD.feltHeight + 0.02, TABLE_WORLD.depth / 2]
        ]}
        color="#d1b065"
        lineWidth={1}
      />
    </group>
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
  const walnutTexture = useMaterialTexture(createWalnutTexture, []);
  const feltTexture = useMaterialTexture(createFeltTexture, []);
  const cardBackTexture = useMaterialTexture(createCardBackTexture, []);
  const southCards = model.southCards;
  const northCards = model.remoteCards.filter((card) => card.position === "top");
  const westCards = model.remoteCards.filter((card) => card.position === "left");
  const eastCards = model.remoteCards.filter((card) => card.position === "right");
  const railDepth = (TABLE_WORLD.depth - TABLE_WORLD.feltDepth) / 2 + 0.18;
  const railWidth = (TABLE_WORLD.width - TABLE_WORLD.feltWidth) / 2 + 0.18;

  return (
    <>
      <color attach="background" args={["#0c0908"]} />
      <fog attach="fog" args={["#0c0908", 10, 22]} />
      <ambientLight intensity={0.68} color="#f2dcb7" />
      <hemisphereLight args={["#f5dfb8", "#2d221b", 0.94]} />
      <directionalLight
        position={[4.6, 8.8, 6.4]}
        intensity={1.8}
        color="#ffd7a3"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.00008}
      />
      <spotLight position={[-5.2, 6.8, 5.2]} intensity={0.68} angle={0.54} penumbra={0.8} color="#ffd8b1" />

      <mesh position={[0, 3.1, -7.4]} receiveShadow>
        <planeGeometry args={[28, 15]} />
        <meshStandardMaterial color="#5d4333" roughness={0.94} metalness={0.02} />
      </mesh>
      <mesh position={[-8.6, 1.8, -2.6]} rotation={[0, Math.PI / 3, 0]}>
        <boxGeometry args={[2.4, 3.8, 2.6]} />
        <meshStandardMaterial color="#1c1412" roughness={0.98} />
      </mesh>
      <mesh position={[8.8, 1.8, -2.4]} rotation={[0, -Math.PI / 3.2, 0]}>
        <boxGeometry args={[2.4, 3.8, 2.6]} />
        <meshStandardMaterial color="#1b1412" roughness={0.98} />
      </mesh>

      <RoundedBox args={[TABLE_WORLD.width, 0.22, TABLE_WORLD.depth]} radius={TABLE_WORLD.rimRadius} smoothness={8} position={[0, -0.12, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={walnutTexture ?? undefined} color="#5b3924" roughness={0.68} metalness={0.08} />
      </RoundedBox>
      <RoundedBox
        args={[TABLE_WORLD.width, 0.24, railDepth]}
        radius={0.18}
        smoothness={6}
        position={[0, 0.12, -(TABLE_WORLD.feltDepth + railDepth) / 2]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial map={walnutTexture ?? undefined} color="#6a4328" roughness={0.62} metalness={0.08} />
      </RoundedBox>
      <RoundedBox
        args={[TABLE_WORLD.width, 0.24, railDepth]}
        radius={0.18}
        smoothness={6}
        position={[0, 0.12, (TABLE_WORLD.feltDepth + railDepth) / 2]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial map={walnutTexture ?? undefined} color="#6a4328" roughness={0.62} metalness={0.08} />
      </RoundedBox>
      <RoundedBox
        args={[railWidth, 0.24, TABLE_WORLD.feltDepth]}
        radius={0.18}
        smoothness={6}
        position={[(-TABLE_WORLD.feltWidth - railWidth) / 2, 0.12, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial map={walnutTexture ?? undefined} color="#6a4328" roughness={0.62} metalness={0.08} />
      </RoundedBox>
      <RoundedBox
        args={[railWidth, 0.24, TABLE_WORLD.feltDepth]}
        radius={0.18}
        smoothness={6}
        position={[(TABLE_WORLD.feltWidth + railWidth) / 2, 0.12, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial map={walnutTexture ?? undefined} color="#6a4328" roughness={0.62} metalness={0.08} />
      </RoundedBox>
      <mesh position={[0, 0.16, 0]} receiveShadow castShadow={false}>
        <boxGeometry args={[TABLE_WORLD.feltWidth, 0.04, TABLE_WORLD.feltDepth]} />
        <meshStandardMaterial color="#17684b" roughness={0.98} metalness={0.02} />
      </mesh>
      <mesh position={[0, 0.186, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TABLE_WORLD.feltWidth * 0.985, TABLE_WORLD.feltDepth * 0.985]} />
        <meshBasicMaterial map={feltTexture ?? undefined} color="#ffffff" transparent opacity={0.82} side={THREE.DoubleSide} />
      </mesh>
      <RoundedBox args={[TABLE_WORLD.feltWidth + 0.34, 0.04, TABLE_WORLD.feltDepth + 0.34]} radius={0.3} smoothness={6} position={[0, 0.15, 0]} receiveShadow>
        <meshStandardMaterial color="#a88043" roughness={0.54} metalness={0.34} />
      </RoundedBox>

      {[
        [-5.86, TABLE_WORLD.rimHeight / 2 + 0.02, -4.06],
        [5.86, TABLE_WORLD.rimHeight / 2 + 0.02, -4.06],
        [-5.86, TABLE_WORLD.rimHeight / 2 + 0.02, 4.06],
        [5.86, TABLE_WORLD.rimHeight / 2 + 0.02, 4.06]
      ].map((position, index) => (
        <mesh key={`well-${index}`} position={position as Vec3} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.34, 0.58, 42]} />
          <meshStandardMaterial color="#2b1b12" roughness={0.74} metalness={0.14} />
        </mesh>
      ))}

      <FeltWatermark />
      <CardTray {...SEAT_TRAYS.bottom} />
      <CardTray {...SEAT_TRAYS.top} />
      <CardTray {...SEAT_TRAYS.left} />
      <CardTray {...SEAT_TRAYS.right} />

      <PlaqueMesh position={[-3.92, 0.58, 2.96]} rotation={[-0.34, 0.16, 0.02]} title="WEST" subtitle={String(model.score.they)} active={false} size={[1.36, 0.66, 0.08]} />
      <PlaqueMesh position={[3.92, 0.58, 2.96]} rotation={[-0.34, -0.16, -0.02]} title="EAST" subtitle={String(model.score.they)} active={false} size={[1.36, 0.66, 0.08]} />
      <PlaqueMesh position={[0, 0.58, -2.98]} rotation={[-0.18, 0, 0]} title="NORTH" subtitle={String(model.score.we)} active={false} size={[1.52, 0.66, 0.08]} />
      <PlaqueMesh position={[0, 0.48, 4.46]} rotation={[-0.52, 0, 0]} title="SOUTH" subtitle={String(model.score.we)} active={true} size={[1.72, 0.72, 0.08]} />
      <ScoreMesh we={model.score.we} they={model.score.they} />

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
          onClick={
            onSouthCardClick && !item.faceDown
              ? () => onSouthCardClick(item.card.id)
              : undefined
          }
        />
      ))}
      {model.passRoutes.map((route) => (
        <group key={route.key}>
          <PassSlotMesh
            route={route}
            onClick={
              onPassRouteClick && route.interactive
                ? () => onPassRouteClick(route.key)
                : undefined
            }
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
                  TABLE_WORLD.feltHeight + 0.055,
                  getPassRouteTransform(route).position[2]
                ],
                rotation: getPassRouteTransform(route).rotation
              }}
              backTexture={cardBackTexture}
            />
          ) : null}
        </group>
      ))}

      {layoutDebugEnabled ? <AnchorDebug /> : null}

      <ContactShadows position={[0, 0.02, 0]} scale={22} opacity={0.34} blur={2.2} far={12} resolution={1024} color="#000000" />
    </>
  );
}

function FallbackSurface() {
  return (
    <div className="alternate-three-surface" aria-hidden="true">
      <div className="alternate-three-surface__room" />
      <div className="alternate-three-surface__vignette" />
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
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        camera={{
          position: [0, 6.15, 11.4],
          fov: 36,
          near: 0.1,
          far: 40
        }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 0.92, -0.2);
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
