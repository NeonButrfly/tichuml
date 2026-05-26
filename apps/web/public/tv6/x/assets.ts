export const DESIGN_W = 1536;
export const DESIGN_H = 1024;
export const ROOT = "/assets/tichu_v6";
export const tablePlate = `${ROOT}/t/plate.png`;
export const passAnchors = `${ROOT}/p/a.json`;
export const passOverlay = `${ROOT}/p/o.png`;
export const passDebug = `${ROOT}/p/d.png`;
export const expectedDirections = {
  north_pass_left: "left",
  north_pass_across: "south",
  north_pass_right: "right",
  south_pass_left: "left",
  south_pass_across: "north",
  south_pass_right: "right",
  east_pass_north: "north",
  east_pass_across: "west",
  east_pass_south: "south",
  west_pass_north: "north",
  west_pass_across: "east",
  west_pass_south: "south",
} as const;
export function stdCard(suit: "sw"|"pg"|"jd"|"st", rank: string) { return `${ROOT}/c/std/${suit}_${rank}.png`; }
export function spCard(card: "mahjong"|"dog"|"phoenix"|"dragon") { return `${ROOT}/c/sp/${card}.png`; }
export function back(color: "blue"|"green" = "green") { return `${ROOT}/c/back/${color}.png`; }
export function getTableTransform(viewportW: number, viewportH: number) {
  const scale = Math.min(viewportW / DESIGN_W, viewportH / DESIGN_H);
  return { scale, offsetX: (viewportW - DESIGN_W * scale) / 2, offsetY: (viewportH - DESIGN_H * scale) / 2 };
}
