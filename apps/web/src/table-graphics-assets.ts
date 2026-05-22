import cardBackUrl from "./assets/generated/card-back.svg";
import tableFeltUrl from "./assets/generated/table-felt.svg";
import tableRimUrl from "./assets/generated/table-rim.svg";

export const TABLE_GRAPHICS_ASSETS = {
  tableFelt: tableFeltUrl,
  tableRim: tableRimUrl,
  cardBack: cardBackUrl
} as const;

export type TableGraphicsAssetId = keyof typeof TABLE_GRAPHICS_ASSETS;
