export const DESIGN_W = 1536;
export const DESIGN_H = 1024;

export type Fit = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export function getFit(viewW: number, viewH: number): Fit {
  const scale = Math.min(viewW / DESIGN_W, viewH / DESIGN_H);

  return {
    scale,
    offsetX: (viewW - DESIGN_W * scale) / 2,
    offsetY: (viewH - DESIGN_H * scale) / 2
  };
}

export function designToScreen(x: number, y: number, viewW: number, viewH: number) {
  const fit = getFit(viewW, viewH);

  return {
    x: fit.offsetX + x * fit.scale,
    y: fit.offsetY + y * fit.scale,
    scale: fit.scale
  };
}
