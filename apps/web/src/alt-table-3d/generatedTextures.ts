import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace
} from "three";

type LabelOrientation = "horizontal" | "vertical";

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function makeCanvas(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create 2D canvas context for ALT table textures.");
  }
  return { canvas, ctx };
}

function createRepeatTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number
) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createClampTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCornerOrnament(
  ctx: CanvasRenderingContext2D,
  translateX: number,
  translateY: number,
  scaleX: number,
  scaleY: number
) {
  const lines: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    [
      [0, 0],
      [82, 0],
      [82, 22],
      [28, 22],
      [28, 54]
    ],
    [
      [0, 24],
      [56, 24],
      [56, 50],
      [18, 50],
      [18, 88]
    ],
    [
      [24, 0],
      [24, 58],
      [52, 58],
      [52, 18],
      [90, 18]
    ]
  ];

  ctx.save();
  ctx.translate(translateX, translateY);
  ctx.scale(scaleX, scaleY);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(199, 143, 45, 0.88)";
  ctx.lineWidth = 4;

  for (const polyline of lines) {
    const [firstPoint, ...remainingPoints] = polyline;
    if (!firstPoint) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(firstPoint[0], firstPoint[1]);
    for (const point of remainingPoints) {
      ctx.lineTo(point[0], point[1]);
    }
    ctx.stroke();
  }

  ctx.restore();
}

export function makeWoodTexture(size = 2048) {
  const random = createSeededRandom(7);
  const { canvas, ctx } = makeCanvas(size);

  ctx.fillStyle = "#5a240b";
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 1) {
    const sineGrain =
      Math.sin(y * 0.035) * 8 +
      Math.sin(y * 0.011) * 12 +
      random() * 9;
    const blend = y / size;
    const r = clampByte(64 + blend * 70 + sineGrain);
    const g = clampByte(24 + blend * 28 + sineGrain * 0.42);
    const b = clampByte(10 + blend * 12 + sineGrain * 0.18);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, y, size, 1);
  }

  for (let index = 0; index < 1400; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const length = 120 + random() * 780;
    const wobbleX = (random() - 0.5) * 80;
    const wobbleY = (random() - 0.5) * 10;
    ctx.strokeStyle = "rgba(120, 56, 18, 0.18)";
    ctx.lineWidth = 0.6 + random() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + length * 0.22,
      y + wobbleY,
      x + length * 0.74 + wobbleX,
      y - wobbleY,
      x + length,
      y + (random() - 0.5) * 12
    );
    ctx.stroke();
  }

  for (let index = 0; index < 500; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const length = 80 + random() * 340;
    ctx.strokeStyle = "rgba(20, 8, 3, 0.22)";
    ctx.lineWidth = 0.4 + random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + length * 0.28,
      y + (random() - 0.5) * 8,
      x + length * 0.68,
      y + (random() - 0.5) * 8,
      x + length,
      y + (random() - 0.5) * 10
    );
    ctx.stroke();
  }

  const vignette = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.2,
    size / 2,
    size / 2,
    size * 0.74
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  return createRepeatTexture(canvas, 2.2, 2.2);
}

export function makeFeltTexture(size = 2048) {
  const random = createSeededRandom(13);
  const { canvas, ctx } = makeCanvas(size);

  const radial = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.72
  );
  radial.addColorStop(0, "#31693b");
  radial.addColorStop(0.58, "#25552f");
  radial.addColorStop(1, "#173d22");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, size, size);

  for (let index = 0; index < 90000; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 0.35 + random() * 0.75;
    ctx.fillStyle =
      random() > 0.48
        ? "rgba(255,255,210,0.018)"
        : "rgba(0,0,0,0.035)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let index = 0; index < 14000; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const length = 2 + random() * 9;
    const angle = (random() - 0.5) * 1.1;
    ctx.strokeStyle = "rgba(220,230,180,0.025)";
    ctx.lineWidth = 0.35 + random() * 0.55;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length * 0.4);
    ctx.stroke();
  }

  return createRepeatTexture(canvas, 1.25, 1.25);
}

export function makeFeltGoldOverlayTexture(size = 2048) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.clearRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(199, 143, 45, 0.88)";
  ctx.lineWidth = 5;
  ctx.strokeRect(90, 90, 1868, 1868);

  ctx.strokeStyle = "rgba(199, 143, 45, 0.32)";
  ctx.lineWidth = 2;
  ctx.strokeRect(126, 126, 1796, 1796);

  ctx.strokeStyle = "rgba(199, 143, 45, 0.16)";
  ctx.lineWidth = 1;
  ctx.strokeRect(155, 155, 1738, 1738);

  drawCornerOrnament(ctx, 120, 120, 1, 1);
  drawCornerOrnament(ctx, size - 120, 120, -1, 1);
  drawCornerOrnament(ctx, 120, size - 120, 1, -1);
  drawCornerOrnament(ctx, size - 120, size - 120, -1, -1);

  return createClampTexture(canvas);
}

export function makeLabelTexture(label: string, orientation: LabelOrientation) {
  const width = orientation === "horizontal" ? 512 : 180;
  const height = orientation === "horizontal" ? 128 : 520;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create ALT label texture.");
  }

  ctx.clearRect(0, 0, width, height);

  if (orientation === "horizontal") {
    roundedRect(ctx, 18, 18, 476, 92, 16);
    ctx.fillStyle = "#04170e";
    ctx.fill();
    ctx.strokeStyle = "#8b5f21";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = "#dfb75d";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#b58839";
    ([
      [44, 44],
      [468, 44],
      [44, 84],
      [468, 84]
    ] as const).forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#f3ddb0";
    ctx.font = "bold 52px Georgia";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 256, 66);
  } else {
    roundedRect(ctx, 24, 18, 132, 484, 16);
    ctx.fillStyle = "#04170e";
    ctx.fill();
    ctx.strokeStyle = "#8b5f21";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = "#dfb75d";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#b58839";
    ([
      [48, 44],
      [132, 44],
      [48, 476],
      [132, 476]
    ] as const).forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#f3ddb0";
    ctx.font = "bold 46px Georgia";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  return createClampTexture(canvas);
}
