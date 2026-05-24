import { useEffect, useRef } from "react";
import type * as Phaser from "phaser";
import type {
  SouthPerspectivePose,
  SouthPerspectiveTableGeometry
} from "./south-perspective-projection";
import type {
  ImmersiveSceneCard,
  ImmersiveSceneModel,
  ImmersiveScenePassRoute
} from "./scene-model";

export type { AlternateCameraPreset } from "./scene-model";

type PhaserRuntime = {
  updateModel(model: ImmersiveSceneModel): void;
  destroy(): void;
};

const WALL_TOP = 0x74553b;
const WALL_BOTTOM = 0x3f2d22;
const TABLE_RIM = 0x4f341f;
const TABLE_RIM_DARK = 0x2a190f;
const TABLE_FACE = 0x5f412b;
const TABLE_FACE_DARK = 0x3f2a1b;
const TABLE_HIGHLIGHT = 0x8f6b49;
const CARD_BACK = 0x262a35;
const CARD_BACK_ACCENT = 0xc8c0b1;
const GOLD = 0xd0aa65;
const GOLD_SOFT = 0xf6e0b6;
const SHADOW = 0x000000;
const TEXT_LIGHT = "#f7ead0";
const TEXT_MUTED = "#cfb787";
const CARD_BORDER = 0xded5c7;
const CARD_FILL = 0xf8f5ef;
const CARD_FILL_SPECIAL = 0xf5efe3;
const SUIT_COLORS: Record<string, string> = {
  jade: "#2e9a6d",
  sword: "#4f6ca8",
  pagoda: "#c65b47",
  star: "#c89a2f"
};
const CARD_HEIGHT_RATIO = 1.42;

function fillCanvasRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string,
  strokeStyle?: string,
  strokeWidth = 1
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fillStyle = fillStyle;
  context.fill();
  if (strokeStyle) {
    context.lineWidth = strokeWidth;
    context.strokeStyle = strokeStyle;
    context.stroke();
  }
}

function supportsPhaserRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  const userAgent = window.navigator?.userAgent ?? "";
  return !/jsdom/i.test(userAgent);
}

function formatRankLabel(card: Card) {
  if (card.kind === "special") {
    switch (card.special) {
      case "mahjong":
        return "1";
      case "dog":
        return "DOG";
      case "phoenix":
        return "PHX";
      case "dragon":
        return "DRG";
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

function formatSuitLabel(card: Card) {
  if (card.kind === "special") {
    switch (card.special) {
      case "mahjong":
        return "MAH";
      case "dog":
        return "DOG";
      case "phoenix":
        return "PHX";
      case "dragon":
        return "DRG";
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

function formatCardTint(card: Card) {
  if (card.kind === "special") {
    switch (card.special) {
      case "mahjong":
        return "#3f9952";
      case "dog":
        return "#806b49";
      case "phoenix":
        return "#b85d4d";
      case "dragon":
        return "#c08b2f";
    }
  }

  return SUIT_COLORS[card.suit] ?? "#1b1b1b";
}

function drawRoundedRect(
  graphics: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  radius: number,
  fillColor: number,
  fillAlpha = 1,
  strokeColor?: number,
  strokeAlpha = 1,
  strokeWidth = 1
) {
  graphics.fillStyle(fillColor, fillAlpha);
  graphics.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
  if (strokeColor !== undefined) {
    graphics.lineStyle(strokeWidth, strokeColor, strokeAlpha);
    graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
  }
}

function addShadowCard(
  scene: Phaser.Scene,
  width: number,
  height: number,
  liftY: number,
  alpha: number
) {
  const shadow = scene.add.graphics();
  shadow.fillStyle(SHADOW, alpha);
  shadow.fillEllipse(6, height * 0.32 + liftY, width * 0.88, height * 0.34);
  shadow.fillStyle(SHADOW, alpha * 0.55);
  shadow.fillEllipse(10, height * 0.36 + liftY, width * 0.64, height * 0.2);
  return shadow;
}

function createCardContainer(
  scene: Phaser.Scene,
  item: ImmersiveSceneCard
) {
  const container = scene.add.container(item.pose.screenX, item.pose.screenY);
  container.setDepth(item.pose.depth);
  container.setRotation((item.pose.rotation * Math.PI) / 180);
  const radius = Math.max(10, Math.min(18, item.width * 0.12));
  const shadowLift = item.selected ? -8 : 0;
  container.add(
    addShadowCard(
      scene,
      item.width,
      item.height,
      item.pose.shadowOffsetY + shadowLift,
      item.faceDown ? 0.2 : 0.18
    )
  );

  const face = scene.add.graphics();
  if (item.faceDown) {
    drawRoundedRect(face, item.width, item.height, radius, CARD_BACK, 1, CARD_BACK_ACCENT, 0.58, 2);
    face.lineStyle(2, 0xe6ddcb, 0.18);
    face.strokeRoundedRect(
      -item.width * 0.41,
      -item.height * 0.41,
      item.width * 0.82,
      item.height * 0.82,
      radius * 0.72
    );
    face.lineStyle(1.4, 0xe6ddcb, 0.2);
    face.strokeCircle(0, 0, Math.min(item.width, item.height) * 0.17);
    face.lineBetween(-item.width * 0.22, 0, item.width * 0.22, 0);
    face.lineBetween(0, -item.height * 0.18, 0, item.height * 0.18);
    container.add(face);
    return container;
  }

  drawRoundedRect(
    face,
    item.width,
    item.height,
    radius,
    item.card.kind === "special" ? CARD_FILL_SPECIAL : CARD_FILL,
    1,
    CARD_BORDER,
    0.95,
    2
  );
  face.fillStyle(0xffffff, item.selected ? 0.16 : 0.1);
  face.fillRoundedRect(
    -item.width * 0.44,
    -item.height * 0.46,
    item.width * 0.88,
    item.height * 0.22,
    radius * 0.8
  );
  if (item.legal && item.position === "bottom") {
    face.lineStyle(2, 0xd1b165, 0.28);
    face.strokeRoundedRect(
      -item.width * 0.47,
      -item.height * 0.49,
      item.width * 0.94,
      item.height * 0.98,
      radius
    );
  }
  container.add(face);

  const tint = formatCardTint(item.card);
  const rankLabel = scene.add.text(-item.width * 0.38, -item.height * 0.42, formatRankLabel(item.card), {
    fontFamily: "Georgia",
    fontSize: `${Math.max(16, Math.round(item.width * 0.18))}px`,
    color: tint,
    fontStyle: "700"
  });
  rankLabel.setOrigin(0, 0);
  const suitLabel = scene.add.text(-item.width * 0.37, -item.height * 0.23, formatSuitLabel(item.card), {
    fontFamily: "Georgia",
    fontSize: `${Math.max(14, Math.round(item.width * 0.13))}px`,
    color: tint
  });
  suitLabel.setOrigin(0, 0);
  const centerLabel = scene.add.text(0, item.card.kind === "special" ? -item.height * 0.02 : 0, formatSuitLabel(item.card), {
    fontFamily: "Georgia",
    fontSize: `${Math.max(18, Math.round(item.width * (item.card.kind === "special" ? 0.18 : 0.24)))}px`,
    color: tint,
    fontStyle: item.card.kind === "special" ? "700" : "600"
  });
  centerLabel.setOrigin(0.5, 0.5);
  centerLabel.setAlpha(item.card.kind === "special" ? 0.9 : 0.78);
  container.add(rankLabel);
  container.add(suitLabel);
  container.add(centerLabel);

  if (item.card.kind === "special") {
    const specialName = scene.add.text(0, item.height * 0.26, formatRankLabel(item.card), {
      fontFamily: "Georgia",
      fontSize: `${Math.max(12, Math.round(item.width * 0.11))}px`,
      color: tint,
      fontStyle: "700"
    });
    specialName.setOrigin(0.5, 0.5);
    container.add(specialName);
  }

  if (item.winning) {
    const glow = scene.add.graphics();
    glow.lineStyle(3, 0xf0d58d, 0.4);
    glow.strokeRoundedRect(
      -item.width * 0.48,
      -item.height * 0.5,
      item.width * 0.96,
      item.height,
      radius
    );
    container.add(glow);
  }

  return container;
}

function createPlaque(
  scene: Phaser.Scene,
  pose: SouthPerspectivePose,
  width: number,
  height: number,
  title: string,
  subtitle: string,
  active: boolean
) {
  const container = scene.add.container(pose.screenX, pose.screenY);
  container.setDepth(pose.depth + 30);
  container.setRotation((pose.rotation * Math.PI) / 180);
  const panel = scene.add.graphics();
  drawRoundedRect(
    panel,
    width,
    height,
    Math.min(18, height * 0.38),
    active ? 0x161311 : 0x141211,
    0.88,
    active ? 0xe1bb79 : 0x8f7245,
    active ? 0.74 : 0.38,
    2
  );
  container.add(panel);
  const titleText = scene.add.text(0, -height * 0.14, title, {
    fontFamily: "Georgia",
    fontSize: `${Math.max(12, Math.round(height * 0.34))}px`,
    color: TEXT_LIGHT,
    fontStyle: "700"
  });
  titleText.setOrigin(0.5, 0.5);
  const subtitleText = scene.add.text(0, height * 0.18, subtitle, {
    fontFamily: "Arial",
    fontSize: `${Math.max(10, Math.round(height * 0.22))}px`,
    color: active ? "#f0d58d" : "#7bd37d",
    fontStyle: "600"
  });
  subtitleText.setOrigin(0.5, 0.5);
  container.add(titleText);
  container.add(subtitleText);
  return container;
}

function drawBackground(scene: Phaser.Scene, model: ImmersiveSceneModel) {
  const { viewportWidth, viewportHeight, centerX, tableCenterY, tableRadiusX, tableRadiusY } =
    model.geometry;

  const wall = scene.add.graphics();
  wall.fillStyle(WALL_TOP, 1);
  wall.fillRect(0, 0, viewportWidth, viewportHeight * 0.48);
  wall.fillStyle(WALL_BOTTOM, 1);
  wall.fillRect(0, viewportHeight * 0.48, viewportWidth, viewportHeight * 0.52);
  wall.fillStyle(0x241a15, 0.26);
  for (let stripe = 0; stripe < 26; stripe += 1) {
    const x = (viewportWidth / 26) * stripe;
    wall.fillRect(x, 0, 4, viewportHeight);
  }
  wall.fillStyle(0xf4e7c9, 0.72);
  wall.fillRect(viewportWidth * 0.085, viewportHeight * 0.03, viewportWidth * 0.06, viewportHeight * 0.115);
  wall.fillRect(viewportWidth * 0.855, viewportHeight * 0.03, viewportWidth * 0.06, viewportHeight * 0.115);
  wall.fillStyle(0x0d0b0a, 0.56);
  wall.fillEllipse(viewportWidth * 0.06, viewportHeight * 0.46, viewportWidth * 0.14, viewportHeight * 0.36);
  wall.fillEllipse(viewportWidth * 0.94, viewportHeight * 0.48, viewportWidth * 0.14, viewportHeight * 0.36);
  wall.fillStyle(0x2b211b, 0.88);
  wall.fillEllipse(viewportWidth * 0.12, viewportHeight * 0.23, viewportWidth * 0.08, viewportHeight * 0.09);
  wall.fillEllipse(viewportWidth * 0.88, viewportHeight * 0.23, viewportWidth * 0.08, viewportHeight * 0.09);
  wall.fillEllipse(viewportWidth * 0.36, viewportHeight * 0.17, viewportWidth * 0.065, viewportHeight * 0.08);
  wall.fillEllipse(viewportWidth * 0.64, viewportHeight * 0.17, viewportWidth * 0.065, viewportHeight * 0.08);
  wall.fillStyle(0x000000, 0.3);
  wall.fillRect(0, viewportHeight * 0.75, viewportWidth, viewportHeight * 0.25);

  const tableShadow = scene.add.graphics();
  tableShadow.fillStyle(0x000000, 0.32);
  tableShadow.fillEllipse(centerX, tableCenterY + tableRadiusY * 0.18, tableRadiusX * 2.05, tableRadiusY * 2.02);

  const rim = scene.add.graphics();
  rim.fillStyle(TABLE_RIM_DARK, 1);
  rim.fillEllipse(centerX, tableCenterY, tableRadiusX * 2, tableRadiusY * 2);
  rim.fillStyle(TABLE_RIM, 1);
  rim.fillEllipse(centerX, tableCenterY - 4, tableRadiusX * 1.94, tableRadiusY * 1.93);

  const face = scene.add.graphics();
  face.fillStyle(TABLE_FACE_DARK, 1);
  face.fillEllipse(centerX, tableCenterY + 2, tableRadiusX * 1.82, tableRadiusY * 1.82);
  face.fillStyle(TABLE_FACE, 1);
  face.fillEllipse(centerX, tableCenterY - 2, tableRadiusX * 1.78, tableRadiusY * 1.76);
  face.lineStyle(2, TABLE_HIGHLIGHT, 0.2);
  for (let line = 0; line < 17; line += 1) {
    const yOffset = (line / 16 - 0.5) * tableRadiusY * 1.32;
    face.beginPath();
    face.moveTo(centerX - tableRadiusX * 0.82, tableCenterY + yOffset);
    face.bezierCurveTo(
      centerX - tableRadiusX * 0.25,
      tableCenterY + yOffset - tableRadiusY * 0.08,
      centerX + tableRadiusX * 0.2,
      tableCenterY + yOffset + tableRadiusY * 0.1,
      centerX + tableRadiusX * 0.82,
      tableCenterY + yOffset - tableRadiusY * 0.03
    );
    face.strokePath();
  }
  face.lineStyle(3, 0xf6e0b6, 0.08);
  face.strokeEllipse(centerX, tableCenterY - tableRadiusY * 0.08, tableRadiusX * 1.62, tableRadiusY * 1.32);

  const vignette = scene.add.graphics();
  vignette.fillStyle(0x000000, 0.34);
  vignette.fillRect(0, 0, viewportWidth, viewportHeight * 0.06);
  vignette.fillRect(0, viewportHeight * 0.88, viewportWidth, viewportHeight * 0.12);
  vignette.fillRect(0, 0, viewportWidth * 0.035, viewportHeight);
  vignette.fillRect(viewportWidth * 0.965, 0, viewportWidth * 0.035, viewportHeight);
}

function drawCanvasBackground(
  context: CanvasRenderingContext2D,
  model: ImmersiveSceneModel
) {
  const { viewportWidth, viewportHeight, centerX, tableCenterY, tableRadiusX, tableRadiusY } =
    model.geometry;

  const wallGradient = context.createLinearGradient(0, 0, 0, viewportHeight);
  wallGradient.addColorStop(0, "#6d523f");
  wallGradient.addColorStop(0.52, "#4a3428");
  wallGradient.addColorStop(1, "#211713");
  context.fillStyle = wallGradient;
  context.fillRect(0, 0, viewportWidth, viewportHeight);
  context.fillStyle = "rgba(0,0,0,0.22)";
  for (let stripe = 0; stripe < 26; stripe += 1) {
    const x = (viewportWidth / 26) * stripe;
    context.fillRect(x, 0, 4, viewportHeight);
  }

  context.fillStyle = "rgba(255,238,208,0.8)";
  context.fillRect(viewportWidth * 0.085, viewportHeight * 0.03, viewportWidth * 0.06, viewportHeight * 0.115);
  context.fillRect(viewportWidth * 0.855, viewportHeight * 0.03, viewportWidth * 0.06, viewportHeight * 0.115);

  context.fillStyle = "rgba(0,0,0,0.32)";
  context.beginPath();
  context.ellipse(centerX, tableCenterY + tableRadiusY * 0.18, tableRadiusX * 1.03, tableRadiusY * 1.01, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#2b1c12";
  context.beginPath();
  context.ellipse(centerX, tableCenterY, tableRadiusX, tableRadiusY, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#533522";
  context.beginPath();
  context.ellipse(centerX, tableCenterY - 4, tableRadiusX * 0.97, tableRadiusY * 0.965, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#66462f";
  context.beginPath();
  context.ellipse(centerX, tableCenterY - 2, tableRadiusX * 0.89, tableRadiusY * 0.88, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(255,231,193,0.08)";
  context.lineWidth = 2;
  for (let line = 0; line < 17; line += 1) {
    const yOffset = (line / 16 - 0.5) * tableRadiusY * 1.3;
    context.beginPath();
    context.moveTo(centerX - tableRadiusX * 0.82, tableCenterY + yOffset);
    context.bezierCurveTo(
      centerX - tableRadiusX * 0.25,
      tableCenterY + yOffset - tableRadiusY * 0.08,
      centerX + tableRadiusX * 0.2,
      tableCenterY + yOffset + tableRadiusY * 0.1,
      centerX + tableRadiusX * 0.82,
      tableCenterY + yOffset - tableRadiusY * 0.03
    );
    context.stroke();
  }
}

function drawCanvasCard(
  context: CanvasRenderingContext2D,
  item: ImmersiveSceneCard
) {
  context.save();
  context.translate(item.pose.screenX, item.pose.screenY);
  context.rotate((item.pose.rotation * Math.PI) / 180);
  context.fillStyle = "rgba(0,0,0,0.18)";
  context.beginPath();
  context.ellipse(8, item.height * 0.34, item.width * 0.44, item.height * 0.16, 0, 0, Math.PI * 2);
  context.fill();

  if (item.faceDown) {
    fillCanvasRoundedRect(
      context,
      -item.width / 2,
      -item.height / 2,
      item.width,
      item.height,
      Math.min(18, item.width * 0.12),
      "#293140",
      "rgba(232,224,210,0.6)",
      2
    );
    context.strokeStyle = "rgba(232,224,210,0.2)";
    context.lineWidth = 2;
    context.strokeRect(-item.width * 0.34, -item.height * 0.34, item.width * 0.68, item.height * 0.68);
    context.restore();
    return;
  }

  fillCanvasRoundedRect(
    context,
    -item.width / 2,
    -item.height / 2,
    item.width,
    item.height,
    Math.min(18, item.width * 0.12),
    item.card.kind === "special" ? "#f3eee2" : "#faf7f1",
    "#ded5c7",
    2
  );
  const tint = formatCardTint(item.card);
  context.fillStyle = tint;
  context.font = `700 ${Math.max(16, Math.round(item.width * 0.18))}px Georgia`;
  context.fillText(formatRankLabel(item.card), -item.width * 0.38, -item.height * 0.3);
  context.font = `${Math.max(13, Math.round(item.width * 0.13))}px Georgia`;
  context.fillText(formatSuitLabel(item.card), -item.width * 0.37, -item.height * 0.14);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${Math.max(18, Math.round(item.width * (item.card.kind === "special" ? 0.18 : 0.24)))}px Georgia`;
  context.globalAlpha = item.card.kind === "special" ? 0.92 : 0.8;
  context.fillText(formatSuitLabel(item.card), 0, 0);
  context.globalAlpha = 1;
  context.restore();
}

function drawCanvasPlaque(
  context: CanvasRenderingContext2D,
  pose: SouthPerspectivePose,
  width: number,
  height: number,
  title: string,
  subtitle: string,
  active: boolean
) {
  context.save();
  context.translate(pose.screenX, pose.screenY);
  context.rotate((pose.rotation * Math.PI) / 180);
  fillCanvasRoundedRect(
    context,
    -width / 2,
    -height / 2,
    width,
    height,
    16,
    "rgba(20,18,17,0.88)",
    active ? "rgba(225,187,121,0.8)" : "rgba(143,114,69,0.4)",
    2
  );
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = TEXT_LIGHT;
  context.font = `700 ${Math.max(12, Math.round(height * 0.34))}px Georgia`;
  context.fillText(title, 0, -height * 0.12);
  context.fillStyle = active ? "#f0d58d" : "#7bd37d";
  context.font = `600 ${Math.max(10, Math.round(height * 0.22))}px Arial`;
  context.fillText(subtitle, 0, height * 0.18);
  context.restore();
}

function drawCanvasOverlay(
  context: CanvasRenderingContext2D,
  model: ImmersiveSceneModel
) {
  drawCanvasBackground(context, model);

  for (const seat of model.seats) {
    const width = seat.position === "bottom" ? 186 : seat.position === "top" ? 168 : 148;
    const height = seat.position === "bottom" ? 62 : 56;
    drawCanvasPlaque(context, seat.pose, width, height, seat.title, seat.status, seat.isActive);
    if (seat.countPose) {
      context.save();
      fillCanvasRoundedRect(
        context,
        seat.countPose.screenX - 18,
        seat.countPose.screenY - 14,
        36,
        28,
        14,
        "rgba(12,12,12,0.6)",
        "rgba(225,187,121,0.3)"
      );
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "#ead2a4";
      context.font = "18px Arial";
      context.fillText(String(seat.handCount), seat.countPose.screenX, seat.countPose.screenY + 1);
      context.restore();
    }
  }

  for (const route of model.passRoutes) {
    context.save();
    context.translate(route.pose.screenX, route.pose.screenY);
    context.rotate((route.pose.rotation * Math.PI) / 180);
    fillCanvasRoundedRect(
      context,
      -route.width / 2,
      -route.height / 2,
      route.width,
      route.height,
      14,
      route.occupied ? "rgba(255,248,235,0.09)" : "rgba(255,248,235,0.03)",
      route.selected ? "rgba(240,213,141,0.7)" : "rgba(182,154,109,0.35)",
      route.selected ? 3 : 2
    );
    context.restore();
    if (route.assignedCard) {
      drawCanvasCard(context, {
        key: `${route.key}-card`,
        card: route.assignedCard,
        position: route.targetPosition,
        pose: { ...route.pose, rotation: 0 },
        width: route.width * 0.88,
        height: route.height * 0.88,
        faceDown: route.faceDown
      });
    }
  }

  const allCards = [...model.remoteCards, ...model.trickCards, ...model.southCards].sort(
    (left, right) => left.pose.depth - right.pose.depth
  );
  for (const item of allCards) {
    drawCanvasCard(context, item);
  }
}

function drawFallbackCanvas(
  canvas: HTMLCanvasElement,
  model: ImmersiveSceneModel
) {
  const ratio = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = model.geometry.viewportWidth * ratio;
  canvas.height = model.geometry.viewportHeight * ratio;
  canvas.style.width = `${model.geometry.viewportWidth}px`;
  canvas.style.height = `${model.geometry.viewportHeight}px`;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, model.geometry.viewportWidth, model.geometry.viewportHeight);
  drawCanvasOverlay(context, model);
}

function drawPassRoute(
  scene: Phaser.Scene,
  route: ImmersiveScenePassRoute,
  _geometry: SouthPerspectiveTableGeometry
) {
  const slot = scene.add.container(route.pose.screenX, route.pose.screenY);
  slot.setDepth(route.pose.depth - 1);
  slot.setRotation((route.pose.rotation * Math.PI) / 180);
  const shadow = scene.add.graphics();
  shadow.fillStyle(SHADOW, route.selected ? 0.18 : 0.11);
  shadow.fillEllipse(
    route.width * 0.08,
    route.height * 0.34,
    route.width * 0.78,
    route.height * 0.28
  );
  slot.add(shadow);
  const outline = scene.add.graphics();
  drawRoundedRect(
    outline,
    route.width,
    route.height,
    Math.min(14, route.width * 0.2),
    0xefe7d5,
    route.occupied ? 0.08 : 0.03,
    route.selected ? 0xf0d58d : 0xb69a6d,
    route.interactive ? 0.42 : 0.22,
    route.selected ? 3 : 2
  );
  slot.add(outline);
  if (route.assignedCard) {
    slot.add(
      createCardContainer(scene, {
        key: `${route.key}-card`,
        card: route.assignedCard,
        position: route.targetPosition,
        pose: {
          ...route.pose,
          screenX: 0,
          screenY: 0,
          depth: route.pose.depth + 1,
          shadowBlur: route.pose.shadowBlur,
          shadowOffsetY: route.pose.shadowOffsetY,
          rotation: 0
        },
        width: route.width * 0.88,
        height: route.height * 0.88,
        faceDown: route.faceDown
      })
    );
  }
}

async function createPhaserRuntime(
  host: HTMLDivElement,
  initialModel: ImmersiveSceneModel
): Promise<PhaserRuntime> {
  const PhaserModule = await import("phaser");
  const PhaserLib = (PhaserModule.default ?? PhaserModule) as typeof import("phaser");

  class ImmersiveAltScene extends PhaserLib.Scene {
    private model: ImmersiveSceneModel = initialModel;

    constructor() {
      super("immersive-alt-table");
    }

    create() {
      this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
      this.renderModel();
    }

    setModel(nextModel: ImmersiveSceneModel) {
      this.model = nextModel;
      if (this.sys.isActive()) {
        this.renderModel();
      }
    }

    private renderModel() {
      const model = this.model;
      this.scale.resize(model.geometry.viewportWidth, model.geometry.viewportHeight);
      this.children.removeAll(true);

      drawBackground(this, model);

      for (const seat of model.seats) {
        const width =
          seat.position === "bottom" ? 186 : seat.position === "top" ? 168 : 148;
        const height = seat.position === "bottom" ? 62 : 56;
        createPlaque(this, seat.pose, width, height, seat.title, seat.status, seat.isActive);
        if (seat.countPose) {
          const countText = this.add.text(
            seat.countPose.screenX,
            seat.countPose.screenY,
            String(seat.handCount),
            {
              fontFamily: "Arial",
              fontSize: "18px",
              color: "#ead2a4",
              backgroundColor: "rgba(12, 12, 12, 0.55)",
              padding: { x: 10, y: 4 }
            }
          );
          countText.setOrigin(0.5, 0.5);
          countText.setDepth(seat.countPose.depth + 34);
        }
      }

      for (const route of model.passRoutes) {
        drawPassRoute(this, route, model.geometry);
      }

      const tabletopCards = [...model.remoteCards, ...model.trickCards, ...model.southCards].sort(
        (left, right) => left.pose.depth - right.pose.depth
      );
      for (const item of tabletopCards) {
        const container = createCardContainer(this, item);
        container.setDepth(item.pose.depth + (item.position === "bottom" ? 10 : 0));
      }
    }
  }

  const scene = new ImmersiveAltScene();
  const game = new PhaserLib.Game({
    type: PhaserLib.CANVAS,
    parent: host,
    width: initialModel.geometry.viewportWidth,
    height: initialModel.geometry.viewportHeight,
    transparent: true,
    audio: {
      noAudio: true
    },
    render: {
      antialias: true,
      pixelArt: false,
      transparent: true
    },
    scene
  });

  return {
    updateModel(model) {
      scene.setModel(model);
    },
    destroy() {
      game.destroy(true);
    }
  };
}

export function AlternateTablePhaserSurface({
  model
}: {
  model: ImmersiveSceneModel;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<PhaserRuntime | null>(null);
  const latestModelRef = useRef(model);
  const runtimeEnabled = supportsPhaserRuntime();

  latestModelRef.current = model;

  useEffect(() => {
    if (!runtimeEnabled || !hostRef.current) {
      return;
    }
    let disposed = false;
    createPhaserRuntime(hostRef.current, latestModelRef.current)
      .then((runtime) => {
        if (disposed) {
          runtime.destroy();
          return;
        }
        runtimeRef.current = runtime;
        runtime.updateModel(latestModelRef.current);
      })
      .catch(() => {
        runtimeRef.current = null;
      });
    return () => {
      disposed = true;
      runtimeRef.current?.destroy();
      runtimeRef.current = null;
    };
  }, [runtimeEnabled]);

  useEffect(() => {
    runtimeRef.current?.updateModel(model);
  }, [model]);

  useEffect(() => {
    if (runtimeEnabled && canvasRef.current) {
      drawFallbackCanvas(canvasRef.current, model);
    }
  }, [model, runtimeEnabled]);

  return (
    <div
      ref={hostRef}
      className="alternate-phaser-surface"
      data-alt-renderer="phaser"
      data-alt-runtime={runtimeEnabled ? "phaser" : "fallback"}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="alternate-phaser-surface__fallback" />
    </div>
  );
}
