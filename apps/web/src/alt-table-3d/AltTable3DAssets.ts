import type { Card } from "@tichuml/engine";
import atlasIndexJson from "./assets/runtime/card-front-atlas-index.json";

export const ALT_TABLE_TEXTURE_URLS = {
  walnut: new URL("./assets/runtime/walnut-texture.png", import.meta.url).href,
  felt: new URL("./assets/runtime/felt-texture.png", import.meta.url).href,
  tray: new URL("./assets/runtime/tray-material-texture.png", import.meta.url).href,
  plaque: new URL("./assets/runtime/plaque-material-texture.png", import.meta.url).href,
  cardBack: new URL("./assets/runtime/card-back-texture.png", import.meta.url).href,
  cardAtlas: new URL("./assets/runtime/card-front-atlas.png", import.meta.url).href
} as const;

type AtlasIndex = typeof atlasIndexJson;

const atlasIndex = atlasIndexJson as AtlasIndex;

export function getAltCardAtlasFrame(card: Card) {
  return atlasIndex.cards[card.id as keyof typeof atlasIndex.cards];
}

export const ALT_CARD_ATLAS_GRID = {
  columns: atlasIndex.columns,
  rows: atlasIndex.rows
} as const;

export function getAltTableConceptImageUrl() {
  return new URL("./assets/generated/scene-concept-source.png", import.meta.url).href;
}
