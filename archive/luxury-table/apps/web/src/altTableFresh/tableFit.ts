export const DESIGN_W = 1536;
export const DESIGN_H = 1024;

export type TableFit = {
  scale: number;
  offsetX: number;
  offsetY: number;
  renderedW: number;
  renderedH: number;
};

export function getTableFit(viewW: number, viewH: number): TableFit {
  const scale = Math.min(viewW / DESIGN_W, viewH / DESIGN_H);

  return buildTableFit(viewW, viewH, scale);
}

export function getTableCoverFit(viewW: number, viewH: number): TableFit {
  const scale = Math.max(viewW / DESIGN_W, viewH / DESIGN_H);

  return buildTableFit(viewW, viewH, scale);
}

function buildTableFit(viewW: number, viewH: number, scale: number): TableFit {
  return {
    scale,
    offsetX: (viewW - DESIGN_W * scale) / 2,
    offsetY: (viewH - DESIGN_H * scale) / 2,
    renderedW: DESIGN_W * scale,
    renderedH: DESIGN_H * scale
  };
}

export function designToScreen(
  x: number,
  y: number,
  fit: TableFit
): { x: number; y: number } {
  return {
    x: fit.offsetX + x * fit.scale,
    y: fit.offsetY + y * fit.scale
  };
}

export function screenToDesign(
  x: number,
  y: number,
  fit: TableFit
): { x: number; y: number } {
  return {
    x: (x - fit.offsetX) / fit.scale,
    y: (y - fit.offsetY) / fit.scale
  };
}
