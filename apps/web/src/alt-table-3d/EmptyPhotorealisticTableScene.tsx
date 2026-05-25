import { useEffect, useMemo } from "react";
import type { CanvasTexture } from "three";
import {
  makeFeltGoldOverlayTexture,
  makeFeltTexture,
  makeLabelTexture,
  makeWoodTexture
} from "./generatedTextures";
import { RailMeshes } from "./RailMeshes";
import { SHOW_DEBUG_ANCHORS } from "./sceneConstants";
import { TableMeshes } from "./TableMeshes";

function useGeneratedTextures() {
  const textures = useMemo(
    () => ({
      wood: makeWoodTexture(),
      felt: makeFeltTexture(),
      feltGoldOverlay: makeFeltGoldOverlayTexture(),
      northLabel: makeLabelTexture("NORTH", "horizontal"),
      southLabel: makeLabelTexture("SOUTH", "horizontal"),
      eastLabel: makeLabelTexture("EAST", "vertical"),
      westLabel: makeLabelTexture("WEST", "vertical")
    }),
    []
  );

  useEffect(
    () => () => {
      (Object.values(textures) as CanvasTexture[]).forEach((texture) => {
        texture.dispose();
      });
    },
    [textures]
  );

  return textures;
}

export function EmptyPhotorealisticTableScene() {
  const textures = useGeneratedTextures();

  return (
    <group>
      <TableMeshes
        woodTexture={textures.wood}
        feltTexture={textures.felt}
        feltGoldOverlayTexture={textures.feltGoldOverlay}
      />
      <RailMeshes
        woodTexture={textures.wood}
        northLabelTexture={textures.northLabel}
        southLabelTexture={textures.southLabel}
        eastLabelTexture={textures.eastLabel}
        westLabelTexture={textures.westLabel}
      />

      {SHOW_DEBUG_ANCHORS ? (
        <mesh position={[0, 0.1, 0]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color="#ff44aa" />
        </mesh>
      ) : null}
    </group>
  );
}
