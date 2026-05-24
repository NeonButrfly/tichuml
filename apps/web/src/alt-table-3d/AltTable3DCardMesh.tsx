import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import { ClampToEdgeWrapping, MeshStandardMaterial, SRGBColorSpace, type Texture } from "three";
import type { AltTable3DCardNode } from "./AltTable3DModel";
import { ALT_CARD_ATLAS_GRID, ALT_TABLE_TEXTURE_URLS, getAltCardAtlasFrame } from "./AltTable3DAssets";

function configureSrgbTexture(texture: Texture) {
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

type Props = {
  card: AltTable3DCardNode;
  onClick?: (cardId: string) => void;
};

export function AltTable3DCardMesh({ card, onClick }: Props) {
  const atlasTexture = useTexture(ALT_TABLE_TEXTURE_URLS.cardAtlas) as Texture;
  const backTexture = useTexture(ALT_TABLE_TEXTURE_URLS.cardBack) as Texture;
  const frame = getAltCardAtlasFrame(card.card);

  const materials = useMemo(() => {
    const sideMaterial = new MeshStandardMaterial({
      color: card.selected ? "#f0d27c" : "#efe3c4",
      roughness: 0.82,
      metalness: 0.02
    });

    const frontTexture = configureSrgbTexture(atlasTexture.clone());
    const backTextureClone = configureSrgbTexture(backTexture.clone());

    if (frame) {
      frontTexture.repeat.set(
        1 / ALT_CARD_ATLAS_GRID.columns,
        1 / ALT_CARD_ATLAS_GRID.rows
      );
      frontTexture.offset.set(
        frame.column / ALT_CARD_ATLAS_GRID.columns,
        1 - (frame.row + 1) / ALT_CARD_ATLAS_GRID.rows
      );
    }

    return [
      sideMaterial,
      sideMaterial,
      sideMaterial,
      sideMaterial,
      new MeshStandardMaterial({
        map: card.faceDown ? backTextureClone : frontTexture,
        roughness: 0.55,
        metalness: 0.02
      }),
      new MeshStandardMaterial({
        map: backTextureClone,
        roughness: 0.58,
        metalness: 0.02
      })
    ];
  }, [atlasTexture, backTexture, card.faceDown, card.selected, frame]);

  return (
    <mesh
      position={card.position}
      rotation={card.rotation}
      castShadow
      receiveShadow
      onClick={() => onClick?.(card.cardId)}
      userData={{ meshRole: "card", cardId: card.cardId }}
    >
      <boxGeometry args={[0.86, 0.04, 1.24]} />
      {materials.map((material, index) => (
        <primitive key={index} object={material} attach={`material-${index}`} />
      ))}
    </mesh>
  );
}
