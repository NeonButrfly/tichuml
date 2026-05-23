export type AlternateSouthHandCardPlacement = {
  offsetPx: number;
  rotationDeg: number;
  liftPx: number;
};

export type AlternateSouthHandLayout = {
  cardWidth: number;
  placements: AlternateSouthHandCardPlacement[];
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function resolveAlternateSouthHandLayout(config: {
  count: number;
  rackWidth: number;
  baseCardWidth: number;
}): AlternateSouthHandLayout {
  const count = Math.max(0, Math.floor(config.count));
  const cardWidth = clamp(Math.round(config.baseCardWidth), 82, 108);

  if (count === 0) {
    return { cardWidth, placements: [] };
  }

  const spreadSlots = Math.max(1, count - 1);
  const usableSpan = Math.max(cardWidth * 1.24, config.rackWidth - cardWidth * 0.86);
  const spacing = clamp(usableSpan / spreadSlots, 22, 46);
  const rotationStep = clamp(11.5 / spreadSlots, 0.55, 1.6);
  const fanDepth = clamp(cardWidth * 0.12, 8, 14);
  const midpoint = (count - 1) / 2;

  return {
    cardWidth,
    placements: Array.from({ length: count }, (_, index) => {
      const normalizedOffset = index - midpoint;
      const distance = Math.abs(normalizedOffset) / Math.max(midpoint, 1);
      return {
        offsetPx: normalizedOffset * spacing,
        rotationDeg: normalizedOffset * rotationStep,
        liftPx: distance * distance * fanDepth - fanDepth * 0.38
      };
    })
  };
}
