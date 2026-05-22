import cardBackUrl from "./assets/generated/card-back.svg";
import cardFaceTemplateUrl from "./assets/generated/card-face-template.svg";
import specialDogUrl from "./assets/generated/special-dog.svg";
import specialDragonUrl from "./assets/generated/special-dragon.svg";
import specialMahjongUrl from "./assets/generated/special-mahjong.svg";
import specialPhoenixUrl from "./assets/generated/special-phoenix.svg";
import tableFeltUrl from "./assets/generated/table-felt.svg";
import tableRimUrl from "./assets/generated/table-rim.svg";

export const TABLE_GRAPHICS_ASSETS = {
  tableFelt: tableFeltUrl,
  tableRim: tableRimUrl,
  cardBack: cardBackUrl,
  cardFaceTemplate: cardFaceTemplateUrl,
  specialDragon: specialDragonUrl,
  specialPhoenix: specialPhoenixUrl,
  specialDog: specialDogUrl,
  specialMahjong: specialMahjongUrl
} as const;

export type TableGraphicsAssetId = keyof typeof TABLE_GRAPHICS_ASSETS;
