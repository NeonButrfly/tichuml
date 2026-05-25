import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import {
  ClampToEdgeWrapping,
  DoubleSide,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Texture
} from "three";
import type { AltTable3DCardNode } from "./AltTable3DModel";
import {
  ALT_CARD_ATLAS_GRID,
  ALT_TABLE_TEXTURE_URLS,
  getAltCardAtlasFrame
} from "./AltTable3DAssets";

const CARD_WIDTH = 0.86;
const CARD_DEPTH = 1.24;
const CARD_THICKNESS = 0.036;
const CARD_FACE_INSET = 0.8;
const CARD_FACE_OFFSET = CARD_THICKNESS / 2 + 0.002;

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

    return {
      body: new MeshStandardMaterial({
        color: card.selected ? "#eed186" : "#e9ddc4",
        roughness: 0.82,
        metalness: 0.02
      }),
      front: new MeshStandardMaterial({
        map: card.faceDown ? backTextureClone : frontTexture,
        side: DoubleSide,
        roughness: 0.54,
        metalness: 0.02
      }),
      back: new MeshStandardMaterial({
        map: backTextureClone,
        side: DoubleSide,
        roughness: 0.58,
        metalness: 0.02
      })
    };
  }, [atlasTexture, backTexture, card.faceDown, card.selected, frame]);

  return (
    <group
      position={card.position}
      rotation={card.rotation}
      userData={{ meshRole: "card", cardId: card.cardId }}
    >
      <mesh castShadow receiveShadow onClick={() => onClick?.(card.cardId)}>
        <boxGeometry args={[CARD_WIDTH, CARD_THICKNESS, CARD_DEPTH]} />
        <primitive object={materials.body} attach="material" />
      </mesh>

      <mesh
        position={[0, CARD_FACE_OFFSET, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
        onClick={() => onClick?.(card.cardId)}
        userData={{ meshRole: "card-face", cardId: card.cardId }}
      >
        <planeGeometry args={[CARD_WIDTH * CARD_FACE_INSET, CARD_DEPTH * CARD_FACE_INSET]} />
        <primitive object={materials.front} attach="material" />
      </mesh>

      <mesh
        position={[0, -CARD_FACE_OFFSET, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        receiveShadow
        userData={{ meshRole: "card-back", cardId: card.cardId }}
      >
        <planeGeometry args={[CARD_WIDTH * CARD_FACE_INSET, CARD_DEPTH * CARD_FACE_INSET]} />
        <primitive object={materials.back} attach="material" />
      </mesh>
    </group>
  );
}
