export const TV7_ROOT = '/tv7';
export const TV7 = {
  table: `${TV7_ROOT}/t/plate.png`,
  tableRef: `${TV7_ROOT}/t/ref.png`,
  passA: `${TV7_ROOT}/p/a.json`,
  passO: `${TV7_ROOT}/p/o.png`,
  cardA: `${TV7_ROOT}/h/a.json`,
  cardO: `${TV7_ROOT}/h/s.png`,
  cardD: `${TV7_ROOT}/h/d.png`,
  cardMap: `${TV7_ROOT}/c/map.json`,
} as const;

export const DESIGN = { w: 1536, h: 1024 } as const;
export function fit(viewW: number, viewH: number) {
  const scale = Math.min(viewW / DESIGN.w, viewH / DESIGN.h);
  return { scale, x: (viewW - DESIGN.w * scale) / 2, y: (viewH - DESIGN.h * scale) / 2 };
}
export function pt(x: number, y: number, viewW: number, viewH: number) {
  const f = fit(viewW, viewH);
  return { x: f.x + x * f.scale, y: f.y + y * f.scale, scale: f.scale };
}
