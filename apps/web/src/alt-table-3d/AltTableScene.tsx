import { useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import {
  ClampToEdgeWrapping,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture
} from "three";
import {
  AltTableCards3D,
  designToWorld,
  getHiddenCardWorldSize,
  getTableWorldSize,
  type HiddenHandCard
} from "./AltTableCards3D";
import {
  TV7_TABLE_PLATE_SRC,
  TV7_TABLE_REFERENCE_SRC
} from "./tv7-runtime";

const TABLE_BASE_THICKNESS = 0.18;
const TABLE_FRAME_HEIGHT = 0.16;
const TABLE_FRAME_WIDTH = 0.82;
const TABLE_BORDER_WIDTH = 0.72;
const TABLE_RAISED_RIM = 0.08;
const TABLE_PLINTH_HEIGHT = 0.1;
const TABLE_UPPER_DECK_HEIGHT = 0.085;
const TABLE_UPPER_DECK_INSET = 0.26;
const TABLE_INNER_RAIL_HEIGHT = 0.065;
const TABLE_INNER_RAIL_WIDTH = 0.18;
const TABLE_INNER_GOLD_WIDTH = 0.028;
const TABLE_FRAME_TRIM_WIDTH = 0.042;
const FELT_INSET_X = 1.34;
const FELT_INSET_Z = 1.1;
const FELT_Y = TABLE_BASE_THICKNESS / 2 + 0.004;
const FELT_SURFACE_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="felt" cx="50%" cy="46%" r="74%">
      <stop offset="0%" stop-color="#6f8b52"/>
      <stop offset="52%" stop-color="#476339"/>
      <stop offset="100%" stop-color="#233220"/>
    </radialGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
      <stop offset="62%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#08110a" stop-opacity="0.4"/>
    </radialGradient>
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="3" seed="17"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.06"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#felt)"/>
  <g opacity="0.1" stroke="#93ac78" stroke-width="2.8">
    <path d="M0 74c163 18 326 13 489-14 164-28 330-30 535 8" fill="none"/>
    <path d="M0 246c147-11 301-20 462-3 178 19 370 19 562-8" fill="none"/>
    <path d="M0 425c187 22 372 18 560-9 157-23 304-23 464-4" fill="none"/>
    <path d="M0 607c177-20 349-26 522-10 173 16 340 18 502 0" fill="none"/>
    <path d="M0 794c172 21 340 23 512 5 171-19 342-20 512-3" fill="none"/>
  </g>
  <g opacity="0.04">
    <path d="M122 0v1024M264 0v1024M401 0v1024M555 0v1024M698 0v1024M854 0v1024" stroke="#d8f0c8" stroke-width="2"/>
  </g>
  <rect width="1024" height="1024" fill="#fff" filter="url(#noise)"/>
  <rect width="1024" height="1024" fill="url(#vignette)"/>
</svg>
`)}`;
const DRAGON_MOTIF_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <g fill="#b78a34" stroke="none">
    <path
      d="M610 238c111 24 186 110 186 214 0 76-41 143-107 187-33 22-51 49-54 81-3 27 8 54 31 81-21 8-43 13-67 16-58 8-117 1-171-20-94-36-158-117-158-214 0-88 53-164 134-207 38-20 60-49 67-87 5-25 1-52-12-80 31 17 65 24 102 21 34-3 63-13 86-32-12 34-11 65 4 94 18 35 51 54 98 58 51 4 94-15 129-58-35-31-71-55-107-74-24-12-38-26-42-41-6-18 0-38 17-59 23 30 47 67 71 111 9 17 16 34 20 50 2 12-1 23-9 33-8 9-11 18-9 27 2 10 9 16 21 19z"
      opacity="0.42"
    />
    <path
      d="M604 284c76 19 129 79 129 152 0 58-31 108-85 141-45 28-66 60-63 97-35 19-74 28-116 28-69 0-130-27-175-76-43-47-62-103-54-165 8-67 45-118 111-153 39-20 65-50 78-88 15 11 33 17 55 20 26 3 50 0 72-8-6 24-5 46 3 68 15 41 46 63 93 66 35 2 69-12 102-43-27-17-55-29-85-39-37-12-54-34-53-66 25 26 54 46 88 58z"
      opacity="0.62"
    />
    <path
      d="M598 319c41 11 72 37 89 75 16 37 15 75-3 114-17 37-48 67-93 89-30 15-48 33-54 53-22 3-45 3-68-1-56-10-99-37-129-83-31-48-38-98-21-148 18-52 57-90 118-115 37-16 63-40 77-72 18 11 39 18 61 21 20 3 40 1 59-6-1 28 8 49 27 66 18 15 43 24 75 26-22-7-39-18-50-35-11-16-16-33-15-51z"
      opacity="0.86"
    />
  </g>
  <g fill="none" stroke="#d9bc73" stroke-linecap="round" stroke-linejoin="round">
    <path d="M671 332c39 17 64 47 76 89 9 37 6 72-11 106" stroke-width="24" opacity="0.5"/>
    <path d="M372 585c18 35 47 60 88 77 40 15 81 20 123 14" stroke-width="20" opacity="0.38"/>
    <path d="M648 285l69 23M314 635l83-26M641 617c-24 25-52 42-84 53" stroke-width="16" opacity="0.46"/>
    <circle cx="664" cy="357" r="11" fill="#f0d487" opacity="0.9" stroke="none"/>
  </g>
</svg>
`)}`;
const WOOD_GRAIN_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a66a3d"/>
      <stop offset="55%" stop-color="#724224"/>
      <stop offset="100%" stop-color="#4f2e1c"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g opacity="0.3">
    <path d="M18 42c45 9 93 7 142 2 69-7 138-23 207-13 43 6 84 20 127 23" stroke="#d39a61" stroke-width="8" fill="none"/>
    <path d="M0 118c49 13 100 8 150-1 66-12 130-33 198-29 55 3 109 20 164 25" stroke="#3c2015" stroke-width="10" fill="none"/>
    <path d="M8 186c77 11 152-12 228-21 87-10 175 7 261 17" stroke="#b77849" stroke-width="8" fill="none"/>
    <path d="M0 264c73 18 150 5 223-8 90-15 182-19 272 0" stroke="#2a1710" stroke-width="10" fill="none"/>
    <path d="M13 336c48 5 95 2 143-4 95-11 190-28 286-11 24 4 47 10 70 16" stroke="#d4975d" stroke-width="8" fill="none"/>
    <path d="M0 420c65 8 129-2 193-13 108-19 215-31 319-5" stroke="#4a281b" stroke-width="10" fill="none"/>
  </g>
  <g opacity="0.1">
    <rect x="0" y="0" width="512" height="512" fill="#fff7df"/>
    <path d="M84 0v512M168 0v512M252 0v512M336 0v512M420 0v512" stroke="#1f120d" stroke-width="3"/>
  </g>
</svg>
`)}`;
const WORLD_PLATE_ALPHA_SRC = buildWorldPlateAlphaSrc({
  insetX: 148,
  insetY: 124
});
const REFERENCE_DRAGON_ALPHA_SRC = buildReferenceDragonAlphaSrc();
const REFERENCE_HARDWARE_ALPHA_SRC = buildReferenceHardwareAlphaSrc();
export function getAltHiddenBackArtConfig() {
  return {
    rimInset: 12,
    outerBorderWidth: 5.2,
    innerBorderWidth: 2.8,
    emblemStrokeWidth: 13.5,
    crossStrokeWidth: 10.8,
    cornerRadius: 9.5,
    guideOpacity: 0.4
  } as const;
}
const ALT_HIDDEN_BACK_ART = getAltHiddenBackArtConfig();
const ALT_HIDDEN_CARD_BACK_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 588">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#34613f"/>
      <stop offset="52%" stop-color="#1f4a2d"/>
      <stop offset="100%" stop-color="#112817"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="#90bf7b" stop-opacity="0.68"/>
      <stop offset="100%" stop-color="#0a170f" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f5df9d"/>
      <stop offset="100%" stop-color="#c09134"/>
    </linearGradient>
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="9"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.05"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="420" height="588" rx="26" fill="#ecd599"/>
  <rect x="${ALT_HIDDEN_BACK_ART.rimInset}" y="${ALT_HIDDEN_BACK_ART.rimInset}" width="396" height="564" rx="22" fill="url(#rim)"/>
  <rect x="24" y="24" width="372" height="540" rx="18" fill="url(#bg)"/>
  <rect x="36" y="36" width="348" height="516" rx="15" fill="none" stroke="#f4de9a" stroke-width="${ALT_HIDDEN_BACK_ART.outerBorderWidth}" opacity="0.99"/>
  <rect x="49" y="49" width="322" height="490" rx="14" fill="none" stroke="#5a7d52" stroke-width="${ALT_HIDDEN_BACK_ART.innerBorderWidth}" opacity="0.84"/>
  <rect x="54" y="54" width="312" height="480" rx="12" fill="url(#glow)"/>
  <rect x="66" y="66" width="288" height="456" rx="10" fill="none" stroke="#f1dc99" stroke-width="1.8" opacity="0.34" stroke-dasharray="18 14"/>
  <g fill="none" stroke="#ecd28a" stroke-linecap="round" stroke-linejoin="round" opacity="0.96">
    <path d="M210 118c74 0 133 59 133 133 0 54-31 100-81 122 16 34 15 75-4 110-25 49-76 80-132 80-76 0-138-59-145-132 49 23 106 16 147-18 44-36 65-93 51-146-14-53-61-97-117-107 31-35 78-52 148-52z" stroke-width="${ALT_HIDDEN_BACK_ART.emblemStrokeWidth}"/>
    <path d="M210 178c40 35 63 72 70 114 7 50-10 98-46 138-29-16-51-41-65-74-18-42-20-92-7-178 12 7 29 7 48 0z" stroke-width="${ALT_HIDDEN_BACK_ART.crossStrokeWidth}"/>
    <path d="M147 272c24-6 45-20 63-45 20 25 41 39 63 45-24 10-45 28-63 55-18-27-39-45-63-55z" stroke-width="9.8"/>
    <path d="M118 157c24 12 46 16 68 13M302 157c-24 12-46 16-68 13M116 437c26-13 50-19 72-16M304 437c-26-13-50-19-72-16" stroke-width="8"/>
    <path d="M89 100h53M278 100h53M89 488h53M278 488h53" stroke-width="6.8" opacity="0.94"/>
    <circle cx="210" cy="294" r="108" stroke="#f2dc97" stroke-width="4.8" opacity="0.42"/>
    <circle cx="210" cy="294" r="82" stroke="#c9a85a" stroke-width="3.4" opacity="0.34"/>
  </g>
  <g fill="none" stroke="#66885d" opacity="${ALT_HIDDEN_BACK_ART.guideOpacity}">
    <rect x="78" y="78" width="264" height="432" rx="12" stroke-width="1.8" stroke-dasharray="10 10"/>
    <rect x="96" y="96" width="228" height="396" rx="10" stroke-width="1.4" stroke-dasharray="6 8"/>
  </g>
  <g fill="#f3df9e" opacity="0.94">
    <circle cx="82" cy="82" r="${ALT_HIDDEN_BACK_ART.cornerRadius}"/><circle cx="338" cy="82" r="${ALT_HIDDEN_BACK_ART.cornerRadius}"/>
    <circle cx="82" cy="506" r="${ALT_HIDDEN_BACK_ART.cornerRadius}"/><circle cx="338" cy="506" r="${ALT_HIDDEN_BACK_ART.cornerRadius}"/>
  </g>
  <g fill="none" stroke="#f4df9d" opacity="0.74">
    <path d="M109 81c16 9 35 14 56 14M311 81c-16 9-35 14-56 14M109 507c16-9 35-14 56-14M311 507c-16-9-35-14-56-14" stroke-width="4.2" stroke-linecap="round"/>
  </g>
  <rect width="420" height="588" rx="26" fill="none" filter="url(#noise)"/>
</svg>
`)}`;
const NORTH_PLAQUE_SRC = buildSeatPlaqueSrc("NORTH");
const SOUTH_PLAQUE_SRC = buildSeatPlaqueSrc("SOUTH");
const EAST_PLAQUE_SRC = buildSeatPlaqueSrc("EAST", { vertical: true });
const WEST_PLAQUE_SRC = buildSeatPlaqueSrc("WEST", { vertical: true });
const PASS_PLAQUE_SRC = buildSeatPlaqueSrc("PASS");
const SCORE_PLAQUE_SRC = buildScorePlaqueSrc();
const RACK_BASE_HEIGHT = 0.17;
const RACK_SIDE_HEIGHT = 0.34;
const RACK_SIDE_THICKNESS = 0.14;
const RACK_SLOT_THICKNESS = 0.046;
const RACK_SLOT_DEPTH = 0.24;
const RACK_END_BLOCK = 0.2;
const RACK_PLAQUE_WIDTH = 1.02;
const RACK_PLAQUE_HEIGHT = 0.38;
const RACK_PLAQUE_INSET = 0.05;
const RACK_TRIM_WIDTH = 0.028;
const RACK_SUPPORT_BLOCK = 0.28;
const RACK_FRONT_LIP_HEIGHT = 0.1;
const RACK_FRONT_LIP_DEPTH = 0.12;
const RACK_SLOT_DIVIDER_THICKNESS = 0.02;
const RACK_SLOT_DIVIDER_HEIGHT = 0.18;
const RACK_CHEEK_WIDTH = 0.32;
const RACK_CHEEK_HEIGHT = 0.46;
const RACK_CHEEK_DEPTH = 0.24;
const RACK_CAP_HEIGHT = 0.08;
const RACK_CAP_DEPTH = 0.18;
const RACK_SHOULDER_BLOCK = 0.34;
const RACK_TRAY_BRIDGE_HEIGHT = 0.12;
const RACK_REAR_SPINE_HEIGHT = 0.18;
const RACK_WING_BLOCK = 0.24;
const RACK_FOOT_WIDTH = 0.42;
const RACK_FOOT_HEIGHT = 0.16;
const RACK_FOOT_DEPTH = 0.26;
const RACK_PEDESTAL_WIDTH = 0.88;
const RACK_PEDESTAL_DEPTH = 0.34;
const FRONT_RAIL_HEIGHT = 0.3;
const FRONT_RAIL_DEPTH = 0.44;
const FRONT_RAIL_INSET = 0.18;
const FRONT_BLOCK_WIDTH = 1.26;
const FRONT_BLOCK_HEIGHT = 0.56;
const FRONT_BLOCK_DEPTH = 0.5;

export function getFrontRailAssemblyConfig() {
  return {
    railHeight: FRONT_RAIL_HEIGHT,
    railDepth: FRONT_RAIL_DEPTH,
    centerBlockHeight: FRONT_BLOCK_HEIGHT,
    sideBlockHeight: 0.46
  } as const;
}

export function getAltTableSculptConfig() {
  return {
    plinthHeight: TABLE_PLINTH_HEIGHT,
    upperDeckHeight: TABLE_UPPER_DECK_HEIGHT,
    upperDeckReveal: 0.22,
    innerRailHeight: TABLE_INNER_RAIL_HEIGHT,
    innerRailWidth: TABLE_INNER_RAIL_WIDTH,
    rackTrayBridgeHeight: RACK_TRAY_BRIDGE_HEIGHT,
    rackRearSpineHeight: RACK_REAR_SPINE_HEIGHT
  } as const;
}

export function getAltTableSurfaceMaterialConfig() {
  return {
    feltTopEmissiveIntensity: 0.8,
    feltWellEmissiveIntensity: 0.86,
    dragonOpacity: 1,
    feltHighlightOpacity: 0.05,
    feltInnerHighlightOpacity: 0.035,
    feltFieldHighlightOpacity: 0.028,
    goldTrimOpacity: 0.9
  } as const;
}

export function getAltTableLightingConfig() {
  return {
    ambientIntensity: 1.82,
    hemisphereIntensity: 1.14,
    keyLightIntensity: 2.34,
    fillLightIntensity: 1.16,
    pointLightIntensity: 16.2
  } as const;
}

export function getAltTableReliefConfig() {
  return {
    topShoulderInset: 0.42,
    topShoulderHeight: 0.11,
    feltWellDrop: 0.094,
    centerHighlightOpacity: 0.16
  } as const;
}

export function getAltTableWorldPlateConfig() {
  return {
    opacity: 0.58,
    brightness: 0.94,
    yOffset: 0.104,
    centerInsetX: 1.04,
    centerInsetZ: 0.82
  } as const;
}

export function getAltTableReferenceHardwareConfig() {
  return {
    opacity: 0.66,
    brightness: 0.98,
    yOffset: 0.11
  } as const;
}

export function getAltTableReferenceCenterConfig() {
  return {
    opacity: 0.24,
    brightness: 1.08,
    yOffset: 0.099
  } as const;
}

export function getAltTableCenterMotifConfig() {
  return {
    medallionScale: 1.72,
    outerRingOpacity: 0.62,
    innerRingOpacity: 0.68,
    emblemDotOpacity: 0.98,
    barOpacity: 0.56,
    ringAccentOpacity: 0.36,
    planeOpacity: 0.3,
    centerDiskOpacity: 0.12,
    centerRingOpacity: 0.3
  } as const;
}

export function getAltTableReferenceCenterMaskConfig() {
  return {
    dragonField: { cx: 772, cy: 392, rx: 268, ry: 218 }
  } as const;
}

export function getAltTableReferenceDragonCropConfig() {
  return {
    sourceX: 430,
    sourceY: 194,
    sourceWidth: 650,
    sourceHeight: 470,
    planeWidthFactor: 0.42,
    planeHeightFactor: 0.5
  } as const;
}

export function getAltTableReferenceHardwareMaskConfig() {
  return {
    topRack: { x: 332, y: 18, width: 876, height: 178, radius: 42 },
    leftRack: { x: 28, y: 146, width: 212, height: 612, radius: 36 },
    rightRack: { x: 1096, y: 146, width: 212, height: 612, radius: 36 },
    frontRail: { x: 18, y: 930, width: 1200, height: 94, radius: 28 },
    scorePlaque: { x: 12, y: 826, width: 252, height: 122, radius: 26 },
    passPlaque: { x: 1112, y: 818, width: 210, height: 132, radius: 26 },
    specialCardPlaque: { x: 990, y: 494, width: 216, height: 126, radius: 24 }
  } as const;
}

export function getAltTableRackMaterialConfig() {
  return {
    rackTrimOpacity: 0.96,
    frameTrimOpacity: 0.92,
    rackWoodRoughness: 0.5,
    rackWoodMetalness: 0.2,
    rackWoodAccentOpacity: 0.24,
    frameWoodAccentOpacity: 0.22
  } as const;
}

export function getAltTableHardwareFinishConfig() {
  return {
    frameTopGlowOpacity: 0.22,
    railTopGlowOpacity: 0.24,
    railLipGlowOpacity: 0.3,
    centerBlockGlowOpacity: 0.28,
    sideBlockGlowOpacity: 0.24
  } as const;
}

export function getAltRackPlaquePresentationConfig() {
  return {
    northPlaqueDepth: 0.52,
    northPlaqueLift: 0.82,
    northPlaqueScale: 1.12,
    sidePlaqueYaw: 0.56,
    sidePlaqueOffset: 0.49,
    sidePlaqueLift: 1.36,
    sidePlaqueScale: 1.1,
    sidePlaqueBridgeLength: 0.16,
    sidePlaqueBackerThickness: 0.22
  } as const;
}

export function getAltRackSlotDividerConfig() {
  return {
    dividerThickness: RACK_SLOT_DIVIDER_THICKNESS,
    dividerHeight: RACK_SLOT_DIVIDER_HEIGHT,
    northInset: 0.1,
    sideInset: 0.07
  } as const;
}

export function getAltTableInsetConfig() {
  return {
    frameWidth: TABLE_FRAME_WIDTH,
    borderWidth: TABLE_BORDER_WIDTH,
    feltInsetX: FELT_INSET_X,
    feltInsetZ: FELT_INSET_Z
  } as const;
}

export function getAltTableCameraConfig() {
  return {
    position: [0, 7.2, 7.05] as const,
    fov: 41,
    near: 0.1,
    far: 64
  } as const;
}

export function AltTableScene(props: {
  cards: HiddenHandCard[];
  backSrc: string;
}) {
  const canRender3d = useMemo(() => supportsWebGlCanvas(), []);
  const camera = useMemo(() => getAltTableCameraConfig(), []);

  return (
    <div
      className="alt-table-world-scene"
      data-alt-hidden-hands-layer="true"
      data-alt-hidden-hands-mode={canRender3d ? "r3f" : "meta-only"}
    >
      <div
        aria-hidden="true"
        className="alt-table-world-scene__meta"
        data-alt-hidden-hands-meta="true"
      >
        {props.cards.map((card) => (
          <span
            key={`${card.zone}-${card.card.id}`}
            data-card-id={card.card.id}
            data-facing-seat={card.seat}
            data-layout-source="prototype_layer"
            data-render-mode="r3f-hidden-hand"
            data-seat={card.seat}
            data-zone={card.zone}
            style={{
              left: `${card.anchor.bbox_px.x}px`,
              top: `${card.anchor.bbox_px.y}px`,
              width: `${card.anchor.bbox_px.w}px`,
              height: `${card.anchor.bbox_px.h}px`
            }}
          />
        ))}
      </div>

      {canRender3d ? (
        <Canvas
          className="alt-table-world-scene__canvas"
          dpr={[1, 2]}
          frameloop="demand"
          gl={{ alpha: true, antialias: true }}
          shadows
          camera={camera}
          onCreated={({ camera, gl }) => {
            camera.lookAt(0, 0, 0);
            gl.setClearAlpha(0);
          }}
        >
          <AltTableWorld backSrc={props.backSrc} cards={props.cards} />
        </Canvas>
      ) : null}
    </div>
  );
}

function AltTableWorld(props: {
  cards: HiddenHandCard[];
  backSrc: string;
}) {
  const lightingConfig = getAltTableLightingConfig();
  const hiddenBackSrc = useMemo(() => ALT_HIDDEN_CARD_BACK_SRC || props.backSrc, [props.backSrc]);
  const [backTexture, dragonTexture, woodTexture, feltTexture, plateTexture, plateAlphaTexture, referenceTexture, referenceDragonAlphaTexture, referenceMaskTexture, northPlaqueTexture, southPlaqueTexture, eastPlaqueTexture, westPlaqueTexture, passPlaqueTexture, scorePlaqueTexture] = useLoader(TextureLoader, [
    hiddenBackSrc,
    DRAGON_MOTIF_SRC,
    WOOD_GRAIN_SRC,
    FELT_SURFACE_SRC,
    TV7_TABLE_PLATE_SRC,
    WORLD_PLATE_ALPHA_SRC,
    TV7_TABLE_REFERENCE_SRC,
    REFERENCE_DRAGON_ALPHA_SRC,
    REFERENCE_HARDWARE_ALPHA_SRC,
    NORTH_PLAQUE_SRC,
    SOUTH_PLAQUE_SRC,
    EAST_PLAQUE_SRC,
    WEST_PLAQUE_SRC,
    PASS_PLAQUE_SRC,
    SCORE_PLAQUE_SRC
  ]);
  backTexture.colorSpace = SRGBColorSpace;
  backTexture.minFilter = LinearFilter;
  backTexture.magFilter = LinearFilter;
  backTexture.needsUpdate = true;
  dragonTexture.colorSpace = SRGBColorSpace;
  dragonTexture.minFilter = LinearFilter;
  dragonTexture.magFilter = LinearFilter;
  dragonTexture.needsUpdate = true;
  woodTexture.colorSpace = SRGBColorSpace;
  woodTexture.wrapS = RepeatWrapping;
  woodTexture.wrapT = RepeatWrapping;
  woodTexture.repeat.set(2.4, 1.6);
  woodTexture.minFilter = LinearFilter;
  woodTexture.magFilter = LinearFilter;
  woodTexture.needsUpdate = true;
  feltTexture.colorSpace = SRGBColorSpace;
  feltTexture.wrapS = RepeatWrapping;
  feltTexture.wrapT = RepeatWrapping;
  feltTexture.repeat.set(1.45, 1.05);
  feltTexture.minFilter = LinearFilter;
  feltTexture.magFilter = LinearFilter;
  feltTexture.needsUpdate = true;
  plateTexture.colorSpace = SRGBColorSpace;
  plateTexture.minFilter = LinearFilter;
  plateTexture.magFilter = LinearFilter;
  plateTexture.needsUpdate = true;
  plateAlphaTexture.minFilter = LinearFilter;
  plateAlphaTexture.magFilter = LinearFilter;
  plateAlphaTexture.needsUpdate = true;
  referenceTexture.colorSpace = SRGBColorSpace;
  referenceTexture.minFilter = LinearFilter;
  referenceTexture.magFilter = LinearFilter;
  referenceTexture.needsUpdate = true;
  referenceDragonAlphaTexture.minFilter = LinearFilter;
  referenceDragonAlphaTexture.magFilter = LinearFilter;
  referenceDragonAlphaTexture.needsUpdate = true;
  referenceMaskTexture.minFilter = LinearFilter;
  referenceMaskTexture.magFilter = LinearFilter;
  referenceMaskTexture.needsUpdate = true;
  northPlaqueTexture.colorSpace = SRGBColorSpace;
  northPlaqueTexture.minFilter = LinearFilter;
  northPlaqueTexture.magFilter = LinearFilter;
  northPlaqueTexture.needsUpdate = true;
  eastPlaqueTexture.colorSpace = SRGBColorSpace;
  eastPlaqueTexture.minFilter = LinearFilter;
  eastPlaqueTexture.magFilter = LinearFilter;
  eastPlaqueTexture.needsUpdate = true;
  westPlaqueTexture.colorSpace = SRGBColorSpace;
  westPlaqueTexture.minFilter = LinearFilter;
  westPlaqueTexture.magFilter = LinearFilter;
  westPlaqueTexture.needsUpdate = true;
  southPlaqueTexture.colorSpace = SRGBColorSpace;
  southPlaqueTexture.minFilter = LinearFilter;
  southPlaqueTexture.magFilter = LinearFilter;
  southPlaqueTexture.needsUpdate = true;
  passPlaqueTexture.colorSpace = SRGBColorSpace;
  passPlaqueTexture.minFilter = LinearFilter;
  passPlaqueTexture.magFilter = LinearFilter;
  passPlaqueTexture.needsUpdate = true;
  scorePlaqueTexture.colorSpace = SRGBColorSpace;
  scorePlaqueTexture.minFilter = LinearFilter;
  scorePlaqueTexture.magFilter = LinearFilter;
  scorePlaqueTexture.needsUpdate = true;
  const tableSize = getTableWorldSize();
  const feltWidth = tableSize.width - FELT_INSET_X;
  const feltHeight = tableSize.height - FELT_INSET_Z;
  const outerWidth = tableSize.width + TABLE_FRAME_WIDTH;
  const outerHeight = tableSize.height + TABLE_FRAME_WIDTH;

  return (
    <>
      <ambientLight intensity={lightingConfig.ambientIntensity} />
      <hemisphereLight
        args={["#f7eed2", "#17301e", lightingConfig.hemisphereIntensity]}
      />
      <directionalLight
        castShadow
        intensity={lightingConfig.keyLightIntensity}
        position={[3.2, 8.8, 5.1]}
        shadow-bias={-0.0002}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <directionalLight intensity={lightingConfig.fillLightIntensity} position={[-3.8, 6.2, -4.9]} />
      <pointLight intensity={lightingConfig.pointLightIntensity} position={[0, 4.2, 1.7]} distance={16} decay={2} />

      <group>
        <TableBody
          dragonTexture={dragonTexture}
          feltTexture={feltTexture}
          feltHeight={feltHeight}
          feltWidth={feltWidth}
          outerHeight={outerHeight}
          outerWidth={outerWidth}
          passPlaqueTexture={passPlaqueTexture}
          plateAlphaTexture={plateAlphaTexture}
          plateTexture={plateTexture}
          referenceDragonAlphaTexture={referenceDragonAlphaTexture}
          referenceMaskTexture={referenceMaskTexture}
          referenceTexture={referenceTexture}
          scorePlaqueTexture={scorePlaqueTexture}
          southPlaqueTexture={southPlaqueTexture}
          woodTexture={woodTexture}
        />
        <RackShell cards={props.cards} seat="north" plaqueTexture={northPlaqueTexture} woodTexture={woodTexture} />
        <RackShell cards={props.cards} seat="east" plaqueTexture={eastPlaqueTexture} woodTexture={woodTexture} />
        <RackShell cards={props.cards} seat="west" plaqueTexture={westPlaqueTexture} woodTexture={woodTexture} />

        <AltTableCards3D cards={props.cards} texture={backTexture} />
      </group>
    </>
  );
}

function TableBody(props: {
  dragonTexture: Texture;
  feltTexture: Texture;
  feltHeight: number;
  feltWidth: number;
  outerHeight: number;
  outerWidth: number;
  passPlaqueTexture: Texture;
  plateAlphaTexture: Texture;
  plateTexture: Texture;
  referenceDragonAlphaTexture: Texture;
  referenceMaskTexture: Texture;
  referenceTexture: Texture;
  scorePlaqueTexture: Texture;
  southPlaqueTexture: Texture;
  woodTexture: Texture;
}) {
  const referenceCenterConfig = getAltTableReferenceCenterConfig();
  const referenceDragonCropConfig = getAltTableReferenceDragonCropConfig();
  const centerMotifConfig = getAltTableCenterMotifConfig();
  const surfaceConfig = getAltTableSurfaceMaterialConfig();
  const reliefConfig = getAltTableReliefConfig();
  const referenceHardwareConfig = getAltTableReferenceHardwareConfig();
  const worldPlateConfig = getAltTableWorldPlateConfig();
  const rackConfig = getAltTableRackMaterialConfig();
  const referenceDragonTexture = useMemo(() => {
    const texture = props.referenceTexture.clone();
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.repeat.set(
      referenceDragonCropConfig.sourceWidth / 1536,
      referenceDragonCropConfig.sourceHeight / 1024
    );
    texture.offset.set(
      referenceDragonCropConfig.sourceX / 1536,
      1 -
        (referenceDragonCropConfig.sourceY +
          referenceDragonCropConfig.sourceHeight) /
          1024
    );
    texture.needsUpdate = true;
    return texture;
  }, [props.referenceTexture, referenceDragonCropConfig]);
  const innerRailXLength = props.feltWidth + 0.22;
  const innerRailZLength = props.feltHeight + 0.22;
  const innerRailY = FELT_Y + TABLE_INNER_RAIL_HEIGHT / 2 - 0.004;
  const topDeckWidth = props.outerWidth - TABLE_UPPER_DECK_INSET;
  const topDeckHeight = props.outerHeight - TABLE_UPPER_DECK_INSET;
  const topDeckInnerWidth = props.feltWidth + getAltTableSculptConfig().upperDeckReveal;
  const topDeckInnerHeight = props.feltHeight + getAltTableSculptConfig().upperDeckReveal;
  const topDeckFrameWidth = (topDeckWidth - topDeckInnerWidth) / 2;
  const topDeckFrameHeight = (topDeckHeight - topDeckInnerHeight) / 2;
  const topDeckY = TABLE_BASE_THICKNESS / 2 - TABLE_UPPER_DECK_HEIGHT / 2 + 0.01;
  const shoulderOuterWidth = props.feltWidth + reliefConfig.topShoulderInset + TABLE_INNER_RAIL_WIDTH * 1.08;
  const shoulderOuterHeight = props.feltHeight + reliefConfig.topShoulderInset + TABLE_INNER_RAIL_WIDTH * 1.08;
  const shoulderInnerWidth = props.feltWidth + TABLE_INNER_RAIL_WIDTH * 0.62;
  const shoulderInnerHeight = props.feltHeight + TABLE_INNER_RAIL_WIDTH * 0.62;
  const shoulderWidth = (shoulderOuterWidth - shoulderInnerWidth) / 2;
  const shoulderDepth = (shoulderOuterHeight - shoulderInnerHeight) / 2;
  const shoulderY = FELT_Y - reliefConfig.feltWellDrop * 0.18;
  const shoulderTopY = shoulderY + reliefConfig.topShoulderHeight / 2;

  return (
    <group>
      <mesh position={[0, -TABLE_BASE_THICKNESS - TABLE_PLINTH_HEIGHT / 2 + 0.02, 0]} receiveShadow>
        <boxGeometry args={[props.outerWidth - 0.42, TABLE_PLINTH_HEIGHT, props.outerHeight - 0.42]} />
        <meshStandardMaterial
          color="#6e4227"
          map={props.woodTexture}
          metalness={0.08}
          roughness={0.82}
        />
      </mesh>

      <mesh position={[0, -TABLE_BASE_THICKNESS / 2, 0]} receiveShadow>
        <boxGeometry args={[props.outerWidth, TABLE_BASE_THICKNESS, props.outerHeight]} />
        <meshStandardMaterial
          color="#835032"
          map={props.woodTexture}
          metalness={0.1}
          roughness={0.76}
        />
      </mesh>

      <mesh position={[0, topDeckY, -(topDeckInnerHeight + topDeckFrameHeight) / 2]} receiveShadow>
        <boxGeometry args={[topDeckWidth, TABLE_UPPER_DECK_HEIGHT, topDeckFrameHeight]} />
        <meshStandardMaterial
          color="#ad7142"
          map={props.woodTexture}
          metalness={0.12}
          roughness={0.62}
        />
      </mesh>
      <mesh position={[0, topDeckY, (topDeckInnerHeight + topDeckFrameHeight) / 2]} receiveShadow>
        <boxGeometry args={[topDeckWidth, TABLE_UPPER_DECK_HEIGHT, topDeckFrameHeight]} />
        <meshStandardMaterial
          color="#ad7142"
          map={props.woodTexture}
          metalness={0.12}
          roughness={0.62}
        />
      </mesh>
      <mesh position={[-(topDeckInnerWidth + topDeckFrameWidth) / 2, topDeckY, 0]} receiveShadow>
        <boxGeometry args={[topDeckFrameWidth, TABLE_UPPER_DECK_HEIGHT, topDeckInnerHeight]} />
        <meshStandardMaterial
          color="#ad7142"
          map={props.woodTexture}
          metalness={0.12}
          roughness={0.62}
        />
      </mesh>
      <mesh position={[(topDeckInnerWidth + topDeckFrameWidth) / 2, topDeckY, 0]} receiveShadow>
        <boxGeometry args={[topDeckFrameWidth, TABLE_UPPER_DECK_HEIGHT, topDeckInnerHeight]} />
        <meshStandardMaterial
          color="#ad7142"
          map={props.woodTexture}
          metalness={0.12}
          roughness={0.62}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, worldPlateConfig.yOffset, 0]} receiveShadow>
        <planeGeometry args={[props.outerWidth, props.outerHeight]} />
        <meshBasicMaterial
          alphaMap={props.plateAlphaTexture}
          map={props.plateTexture}
          transparent
          opacity={worldPlateConfig.opacity}
          toneMapped={false}
          color={`rgb(${Math.round(worldPlateConfig.brightness * 255)}, ${Math.round(worldPlateConfig.brightness * 255)}, ${Math.round(worldPlateConfig.brightness * 255)})`}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, referenceCenterConfig.yOffset, 0]} receiveShadow>
        <planeGeometry
          args={[
            props.feltWidth * referenceDragonCropConfig.planeWidthFactor,
            props.feltHeight * referenceDragonCropConfig.planeHeightFactor
          ]}
        />
        <meshBasicMaterial
          alphaMap={props.referenceDragonAlphaTexture}
          map={referenceDragonTexture}
          transparent
          opacity={referenceCenterConfig.opacity}
          toneMapped={false}
          color={`rgb(${Math.round(referenceCenterConfig.brightness * 255)}, ${Math.round(referenceCenterConfig.brightness * 255)}, ${Math.round(referenceCenterConfig.brightness * 255)})`}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, referenceHardwareConfig.yOffset, 0]} receiveShadow>
        <planeGeometry args={[props.outerWidth, props.outerHeight]} />
        <meshBasicMaterial
          alphaMap={props.referenceMaskTexture}
          map={props.referenceTexture}
          transparent
          opacity={referenceHardwareConfig.opacity}
          toneMapped={false}
          color={`rgb(${Math.round(referenceHardwareConfig.brightness * 255)}, ${Math.round(referenceHardwareConfig.brightness * 255)}, ${Math.round(referenceHardwareConfig.brightness * 255)})`}
        />
      </mesh>

      <mesh castShadow position={[0, shoulderY, -(shoulderInnerHeight + shoulderDepth) / 2]} receiveShadow>
        <boxGeometry args={[shoulderOuterWidth, reliefConfig.topShoulderHeight, shoulderDepth]} />
        <meshStandardMaterial
          color="#c48755"
          map={props.woodTexture}
          metalness={0.14}
          roughness={0.56}
        />
      </mesh>
      <mesh castShadow position={[0, shoulderY, (shoulderInnerHeight + shoulderDepth) / 2]} receiveShadow>
        <boxGeometry args={[shoulderOuterWidth, reliefConfig.topShoulderHeight, shoulderDepth]} />
        <meshStandardMaterial
          color="#c48755"
          map={props.woodTexture}
          metalness={0.14}
          roughness={0.56}
        />
      </mesh>
      <mesh castShadow position={[-(shoulderInnerWidth + shoulderWidth) / 2, shoulderY, 0]} receiveShadow>
        <boxGeometry args={[shoulderWidth, reliefConfig.topShoulderHeight, shoulderInnerHeight]} />
        <meshStandardMaterial
          color="#c48755"
          map={props.woodTexture}
          metalness={0.14}
          roughness={0.56}
        />
      </mesh>
      <mesh castShadow position={[(shoulderInnerWidth + shoulderWidth) / 2, shoulderY, 0]} receiveShadow>
        <boxGeometry args={[shoulderWidth, reliefConfig.topShoulderHeight, shoulderInnerHeight]} />
        <meshStandardMaterial
          color="#c48755"
          map={props.woodTexture}
          metalness={0.14}
          roughness={0.56}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, shoulderTopY + 0.002, -(shoulderInnerHeight + shoulderDepth * 0.52) / 2]}>
        <planeGeometry args={[shoulderOuterWidth - 0.08, TABLE_FRAME_TRIM_WIDTH * 0.88]} />
        <meshBasicMaterial color="#d0a24a" transparent opacity={0.76} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, shoulderTopY + 0.002, (shoulderInnerHeight + shoulderDepth * 0.52) / 2]}>
        <planeGeometry args={[shoulderOuterWidth - 0.08, TABLE_FRAME_TRIM_WIDTH * 0.88]} />
        <meshBasicMaterial color="#d0a24a" transparent opacity={0.76} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[-(shoulderInnerWidth + shoulderWidth * 0.52) / 2, shoulderTopY + 0.002, 0]}>
        <planeGeometry args={[shoulderOuterHeight - 0.08, TABLE_FRAME_TRIM_WIDTH * 0.88]} />
        <meshBasicMaterial color="#d0a24a" transparent opacity={0.76} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[(shoulderInnerWidth + shoulderWidth * 0.52) / 2, shoulderTopY + 0.002, 0]}>
        <planeGeometry args={[shoulderOuterHeight - 0.08, TABLE_FRAME_TRIM_WIDTH * 0.88]} />
        <meshBasicMaterial color="#d0a24a" transparent opacity={0.76} />
      </mesh>

      <mesh
        position={[0, FELT_Y - TABLE_RAISED_RIM / 2, 0]}
        receiveShadow
      >
        <boxGeometry
          args={[
            props.feltWidth,
            TABLE_RAISED_RIM,
            props.feltHeight
          ]}
        />
        <meshStandardMaterial
          color="#5d7642"
          map={props.feltTexture}
          metalness={0.03}
          roughness={0.9}
          emissive="#425936"
          emissiveIntensity={surfaceConfig.feltWellEmissiveIntensity}
        />
      </mesh>

      <mesh position={[0, innerRailY, -(props.feltHeight + TABLE_INNER_RAIL_WIDTH) / 2]} receiveShadow>
        <boxGeometry args={[innerRailXLength, TABLE_INNER_RAIL_HEIGHT, TABLE_INNER_RAIL_WIDTH]} />
        <meshStandardMaterial
          color="#b27545"
          map={props.woodTexture}
          metalness={0.1}
          roughness={0.54}
        />
      </mesh>
      <mesh position={[0, innerRailY, (props.feltHeight + TABLE_INNER_RAIL_WIDTH) / 2]} receiveShadow>
        <boxGeometry args={[innerRailXLength, TABLE_INNER_RAIL_HEIGHT, TABLE_INNER_RAIL_WIDTH]} />
        <meshStandardMaterial
          color="#b27545"
          map={props.woodTexture}
          metalness={0.1}
          roughness={0.54}
        />
      </mesh>
      <mesh position={[-(props.feltWidth + TABLE_INNER_RAIL_WIDTH) / 2, innerRailY, 0]} receiveShadow>
        <boxGeometry args={[TABLE_INNER_RAIL_WIDTH, TABLE_INNER_RAIL_HEIGHT, innerRailZLength]} />
        <meshStandardMaterial
          color="#b27545"
          map={props.woodTexture}
          metalness={0.1}
          roughness={0.54}
        />
      </mesh>
      <mesh position={[(props.feltWidth + TABLE_INNER_RAIL_WIDTH) / 2, innerRailY, 0]} receiveShadow>
        <boxGeometry args={[TABLE_INNER_RAIL_WIDTH, TABLE_INNER_RAIL_HEIGHT, innerRailZLength]} />
        <meshStandardMaterial
          color="#b27545"
          map={props.woodTexture}
          metalness={0.1}
          roughness={0.54}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_Y + 0.01, -props.feltHeight / 2 - 0.005]}>
        <planeGeometry args={[props.feltWidth + 0.26, TABLE_INNER_GOLD_WIDTH]} />
        <meshBasicMaterial color="#c79f49" transparent opacity={surfaceConfig.goldTrimOpacity} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_Y + 0.01, props.feltHeight / 2 + 0.005]}>
        <planeGeometry args={[props.feltWidth + 0.26, TABLE_INNER_GOLD_WIDTH]} />
        <meshBasicMaterial color="#c79f49" transparent opacity={surfaceConfig.goldTrimOpacity} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[-props.feltWidth / 2 - 0.005, FELT_Y + 0.01, 0]}>
        <planeGeometry args={[props.feltHeight + 0.26, TABLE_INNER_GOLD_WIDTH]} />
        <meshBasicMaterial color="#c79f49" transparent opacity={surfaceConfig.goldTrimOpacity} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[props.feltWidth / 2 + 0.005, FELT_Y + 0.01, 0]}>
        <planeGeometry args={[props.feltHeight + 0.26, TABLE_INNER_GOLD_WIDTH]} />
        <meshBasicMaterial color="#c79f49" transparent opacity={surfaceConfig.goldTrimOpacity} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_Y + 0.002, 0]}>
        <planeGeometry args={[props.feltWidth - 0.1, props.feltHeight - 0.1]} />
        <meshBasicMaterial
          color="#617a45"
          map={props.feltTexture}
          transparent
          opacity={0.98}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_Y + 0.004, 0]}>
        <planeGeometry args={[props.feltWidth - 0.2, props.feltHeight - 0.2]} />
        <meshBasicMaterial color="#9cb67a" transparent opacity={surfaceConfig.feltHighlightOpacity} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_Y + 0.003, 0]}>
        <planeGeometry args={[props.feltWidth * 0.68, props.feltHeight * 0.7]} />
        <meshBasicMaterial color="#d7dfaa" transparent opacity={surfaceConfig.feltInnerHighlightOpacity} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_Y + 0.005, 0]}>
        <planeGeometry args={[props.feltWidth * 0.86, props.feltHeight * 0.82]} />
        <meshBasicMaterial color="#4f6838" transparent opacity={surfaceConfig.feltFieldHighlightOpacity} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_Y + 0.0055, 0]}>
        <circleGeometry args={[Math.min(props.feltWidth, props.feltHeight) * 0.24, 96]} />
        <meshBasicMaterial color="#876726" transparent opacity={centerMotifConfig.centerDiskOpacity} toneMapped={false} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_Y + 0.0058, 0]}>
        <ringGeometry
          args={[
            Math.min(props.feltWidth, props.feltHeight) * 0.205,
            Math.min(props.feltWidth, props.feltHeight) * 0.238,
            96
          ]}
        />
        <meshBasicMaterial color="#c29b46" transparent opacity={centerMotifConfig.centerRingOpacity} toneMapped={false} />
      </mesh>

      <DragonMedallionGeometry y={FELT_Y + 0.0061} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_Y + 0.0059, 0]}>
        <planeGeometry args={[props.feltWidth * 0.82, props.feltHeight * 0.88]} />
        <meshBasicMaterial
          map={props.dragonTexture}
          transparent
          opacity={surfaceConfig.dragonOpacity * centerMotifConfig.planeOpacity}
          alphaTest={0.04}
          toneMapped={false}
        />
      </mesh>

      <GoldCorner position={[-props.feltWidth / 2 + 0.34, FELT_Y + 0.008, -props.feltHeight / 2 + 0.34]} flipX={false} flipZ={false} />
      <GoldCorner position={[props.feltWidth / 2 - 0.34, FELT_Y + 0.008, -props.feltHeight / 2 + 0.34]} flipX={true} flipZ={false} />
      <GoldCorner position={[-props.feltWidth / 2 + 0.34, FELT_Y + 0.008, props.feltHeight / 2 - 0.34]} flipX={false} flipZ={true} />
      <GoldCorner position={[props.feltWidth / 2 - 0.34, FELT_Y + 0.008, props.feltHeight / 2 - 0.34]} flipX={true} flipZ={true} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TABLE_FRAME_HEIGHT + 0.002, -(props.outerHeight - TABLE_BORDER_WIDTH) / 2]}>
        <planeGeometry args={[props.outerWidth - 0.18, TABLE_FRAME_TRIM_WIDTH]} />
        <meshBasicMaterial color="#c9a04a" transparent opacity={rackConfig.frameTrimOpacity} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TABLE_FRAME_HEIGHT + 0.002, (props.outerHeight - TABLE_BORDER_WIDTH) / 2]}>
        <planeGeometry args={[props.outerWidth - 0.18, TABLE_FRAME_TRIM_WIDTH]} />
        <meshBasicMaterial color="#c9a04a" transparent opacity={rackConfig.frameTrimOpacity} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[-(props.outerWidth - TABLE_BORDER_WIDTH) / 2, TABLE_FRAME_HEIGHT + 0.002, 0]}>
        <planeGeometry args={[props.outerHeight - 0.18, TABLE_FRAME_TRIM_WIDTH]} />
        <meshBasicMaterial color="#c9a04a" transparent opacity={rackConfig.frameTrimOpacity} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[(props.outerWidth - TABLE_BORDER_WIDTH) / 2, TABLE_FRAME_HEIGHT + 0.002, 0]}>
        <planeGeometry args={[props.outerHeight - 0.18, TABLE_FRAME_TRIM_WIDTH]} />
        <meshBasicMaterial color="#c9a04a" transparent opacity={rackConfig.frameTrimOpacity} />
      </mesh>

      <FrameRail axis="x" length={props.outerWidth} position={[0, 0, -(props.outerHeight - TABLE_BORDER_WIDTH) / 2]} woodTexture={props.woodTexture} />
      <FrontRailAssembly
        outerHeight={props.outerHeight}
        outerWidth={props.outerWidth}
        passPlaqueTexture={props.passPlaqueTexture}
        scorePlaqueTexture={props.scorePlaqueTexture}
        southPlaqueTexture={props.southPlaqueTexture}
        woodTexture={props.woodTexture}
      />
      <FrameRail axis="z" length={props.outerHeight - TABLE_BORDER_WIDTH * 2} position={[-(props.outerWidth - TABLE_BORDER_WIDTH) / 2, 0, 0]} woodTexture={props.woodTexture} />
      <FrameRail axis="z" length={props.outerHeight - TABLE_BORDER_WIDTH * 2} position={[(props.outerWidth - TABLE_BORDER_WIDTH) / 2, 0, 0]} woodTexture={props.woodTexture} />
    </group>
  );
}

function FrontRailAssembly(props: {
  outerHeight: number;
  outerWidth: number;
  passPlaqueTexture: Texture;
  scorePlaqueTexture: Texture;
  southPlaqueTexture: Texture;
  woodTexture: Texture;
}) {
  const config = getFrontRailAssemblyConfig();
  const finishConfig = getAltTableHardwareFinishConfig();
  const railZ = (props.outerHeight - TABLE_BORDER_WIDTH) / 2 - 0.14;
  const railY = config.railHeight / 2;
  const plaqueZ = railZ + FRONT_BLOCK_DEPTH * 0.12;

  return (
    <group>
      <mesh castShadow position={[0, railY, railZ]} receiveShadow>
        <boxGeometry args={[props.outerWidth, config.railHeight, config.railDepth]} />
        <meshStandardMaterial
          color="#875131"
          map={props.woodTexture}
          metalness={0.12}
          roughness={0.72}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, config.railHeight + 0.002, railZ - 0.02]}>
        <planeGeometry args={[props.outerWidth - 0.26, config.railDepth * 0.34]} />
        <meshBasicMaterial color="#e3c17b" transparent opacity={finishConfig.railTopGlowOpacity} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, config.railHeight + 0.004, railZ + config.railDepth * 0.08]}>
        <planeGeometry args={[props.outerWidth - 0.42, config.railDepth * 0.14]} />
        <meshBasicMaterial color="#f2d28b" transparent opacity={finishConfig.railLipGlowOpacity} toneMapped={false} />
      </mesh>

      <mesh castShadow position={[0, railY + config.railHeight * 0.48, railZ - 0.04]} receiveShadow>
        <boxGeometry args={[props.outerWidth - 0.28, config.railHeight * 0.34, config.railDepth * 0.5]} />
        <meshStandardMaterial
          color="#9a623d"
          map={props.woodTexture}
          metalness={0.12}
          roughness={0.68}
        />
      </mesh>

      <mesh castShadow position={[0, config.centerBlockHeight * 0.54, plaqueZ]} receiveShadow>
        <boxGeometry args={[FRONT_BLOCK_WIDTH, config.centerBlockHeight, FRONT_BLOCK_DEPTH]} />
        <meshStandardMaterial
          color="#7f4c2c"
          map={props.woodTexture}
          metalness={0.12}
          roughness={0.7}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, config.centerBlockHeight + 0.004, plaqueZ + 0.01]}>
        <planeGeometry args={[FRONT_BLOCK_WIDTH * 0.88, FRONT_BLOCK_DEPTH * 0.42]} />
        <meshBasicMaterial color="#f0cd85" transparent opacity={finishConfig.centerBlockGlowOpacity} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, config.centerBlockHeight * 0.76, plaqueZ - FRONT_BLOCK_DEPTH * 0.06]}>
        <planeGeometry args={[FRONT_BLOCK_WIDTH * 0.7, FRONT_BLOCK_DEPTH * 0.12]} />
        <meshBasicMaterial color="#d2a855" transparent opacity={finishConfig.railLipGlowOpacity} toneMapped={false} />
      </mesh>

      <mesh castShadow position={[0, config.centerBlockHeight * 0.24, railZ + 0.04]} receiveShadow>
        <boxGeometry args={[FRONT_BLOCK_WIDTH * 0.82, config.centerBlockHeight * 0.26, FRONT_BLOCK_DEPTH * 0.52]} />
        <meshStandardMaterial
          color="#533120"
          map={props.woodTexture}
          metalness={0.08}
          roughness={0.78}
        />
      </mesh>

      <mesh castShadow position={[-props.outerWidth / 2 + 1.24, config.sideBlockHeight * 0.5, railZ + 0.08]} receiveShadow>
        <boxGeometry args={[0.98, config.sideBlockHeight, 0.38]} />
        <meshStandardMaterial
          color="#7f4c2c"
          map={props.woodTexture}
          metalness={0.12}
          roughness={0.7}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-props.outerWidth / 2 + 1.24, config.sideBlockHeight + 0.004, railZ + 0.1]}>
        <planeGeometry args={[0.72, 0.16]} />
        <meshBasicMaterial color="#edc87d" transparent opacity={finishConfig.sideBlockGlowOpacity} toneMapped={false} />
      </mesh>

      <mesh castShadow position={[-props.outerWidth / 2 + 1.24, config.sideBlockHeight * 0.22, railZ + 0.03]} receiveShadow>
        <boxGeometry args={[0.8, config.sideBlockHeight * 0.24, 0.24]} />
        <meshStandardMaterial
          color="#533120"
          map={props.woodTexture}
          metalness={0.08}
          roughness={0.78}
        />
      </mesh>

      <mesh castShadow position={[props.outerWidth / 2 - 0.88, config.sideBlockHeight * 0.5, railZ + 0.08]} receiveShadow>
        <boxGeometry args={[0.72, config.sideBlockHeight, 0.38]} />
        <meshStandardMaterial
          color="#7f4c2c"
          map={props.woodTexture}
          metalness={0.12}
          roughness={0.7}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[props.outerWidth / 2 - 0.88, config.sideBlockHeight + 0.004, railZ + 0.1]}>
        <planeGeometry args={[0.5, 0.16]} />
        <meshBasicMaterial color="#edc87d" transparent opacity={finishConfig.sideBlockGlowOpacity} toneMapped={false} />
      </mesh>

      <mesh castShadow position={[props.outerWidth / 2 - 0.88, config.sideBlockHeight * 0.22, railZ + 0.03]} receiveShadow>
        <boxGeometry args={[0.56, config.sideBlockHeight * 0.24, 0.24]} />
        <meshStandardMaterial
          color="#533120"
          map={props.woodTexture}
          metalness={0.08}
          roughness={0.78}
        />
      </mesh>

      <SeatPlaque
        height={RACK_PLAQUE_HEIGHT}
        position={[0, config.centerBlockHeight * 0.66, plaqueZ + 0.22]}
        rotation={[0, 0, 0]}
        texture={props.southPlaqueTexture}
        width={RACK_PLAQUE_WIDTH}
      />
      <SeatPlaque
        height={0.26}
        position={[props.outerWidth / 2 - 0.88, config.sideBlockHeight * 0.66, railZ + 0.24]}
        rotation={[0, 0, 0]}
        texture={props.passPlaqueTexture}
        width={0.52}
      />
      <SeatPlaque
        height={0.3}
        position={[-props.outerWidth / 2 + 1.24, config.sideBlockHeight * 0.66, railZ + 0.24]}
        rotation={[0, 0, 0]}
        texture={props.scorePlaqueTexture}
        width={0.82}
      />
    </group>
  );
}

function DragonMedallionGeometry(props: {
  y: number;
}) {
  const config = getAltTableCenterMotifConfig();
  return (
    <group position={[0, props.y, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[config.medallionScale, config.medallionScale, 1]}>
      <mesh rotation={[0, 0, 0.42]}>
        <torusGeometry args={[0.42, 0.028, 16, 96, 4.78]} />
        <meshBasicMaterial color="#cfa64d" transparent opacity={config.outerRingOpacity} toneMapped={false} />
      </mesh>
      <mesh position={[0.05, -0.02, 0]} rotation={[0, 0, -2.18]}>
        <torusGeometry args={[0.29, 0.024, 16, 96, 4.44]} />
        <meshBasicMaterial color="#dabb72" transparent opacity={config.innerRingOpacity} toneMapped={false} />
      </mesh>
      <mesh position={[0.2, -0.17, 0]}>
        <circleGeometry args={[0.056, 36]} />
        <meshBasicMaterial color="#dbbe72" transparent opacity={config.innerRingOpacity} toneMapped={false} />
      </mesh>
      <mesh position={[0.24, -0.15, 0]}>
        <circleGeometry args={[0.011, 24]} />
        <meshBasicMaterial color="#f7e4a1" transparent opacity={config.emblemDotOpacity} toneMapped={false} />
      </mesh>
      <mesh position={[0.14, -0.08, 0]} rotation={[0, 0, 0.88]}>
        <boxGeometry args={[0.18, 0.022, 0.002]} />
        <meshBasicMaterial color="#d2af61" transparent opacity={config.barOpacity} toneMapped={false} />
      </mesh>
      <mesh position={[-0.13, 0.17, 0]} rotation={[0, 0, -0.72]}>
        <boxGeometry args={[0.24, 0.024, 0.002]} />
        <meshBasicMaterial color="#d6b86a" transparent opacity={config.barOpacity} toneMapped={false} />
      </mesh>
      <mesh position={[-0.19, 0.09, 0]} rotation={[0, 0, -1.08]}>
        <boxGeometry args={[0.18, 0.02, 0.002]} />
        <meshBasicMaterial color="#c79f4b" transparent opacity={config.barOpacity} toneMapped={false} />
      </mesh>
      <mesh position={[-0.02, 0.02, 0]} rotation={[0, 0, 0.2]}>
        <ringGeometry args={[0.075, 0.097, 40, 1, Math.PI * 0.18, Math.PI * 1.22]} />
        <meshBasicMaterial color="#e1c67c" transparent opacity={config.ringAccentOpacity} toneMapped={false} />
      </mesh>
    </group>
  );
}

function GoldCorner(props: {
  flipX: boolean;
  flipZ: boolean;
  position: [number, number, number];
}) {
  const dirX = props.flipX ? -1 : 1;
  const dirZ = props.flipZ ? -1 : 1;
  return (
    <group position={props.position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[dirX * 0.08, 0, 0]}>
        <planeGeometry args={[0.24, 0.02]} />
        <meshBasicMaterial color="#b59244" transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, dirZ * 0.08]}>
        <planeGeometry args={[0.02, 0.24]} />
        <meshBasicMaterial color="#b59244" transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[dirX * 0.18, 0, dirZ * 0.08]}>
        <planeGeometry args={[0.08, 0.02]} />
        <meshBasicMaterial color="#b59244" transparent opacity={0.65} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[dirX * 0.08, 0, dirZ * 0.18]}>
        <planeGeometry args={[0.02, 0.08]} />
        <meshBasicMaterial color="#b59244" transparent opacity={0.65} />
      </mesh>
    </group>
  );
}

function FrameRail(props: {
  axis: "x" | "z";
  length: number;
  position: [number, number, number];
  woodTexture: Texture;
}) {
  const rackConfig = getAltTableRackMaterialConfig();
  const finishConfig = getAltTableHardwareFinishConfig();
  const size =
    props.axis === "x"
      ? [props.length, TABLE_FRAME_HEIGHT, TABLE_BORDER_WIDTH]
      : [TABLE_BORDER_WIDTH, TABLE_FRAME_HEIGHT, props.length];

  return (
    <group position={[props.position[0], 0, props.position[2]]}>
      <mesh position={[0, TABLE_FRAME_HEIGHT / 2, 0]}>
        <boxGeometry args={size as [number, number, number]} />
        <meshStandardMaterial
          color="#865131"
          map={props.woodTexture}
          metalness={0.12}
          roughness={0.72}
        />
      </mesh>
      <mesh
        rotation={props.axis === "x" ? [-Math.PI / 2, 0, 0] : [-Math.PI / 2, 0, Math.PI / 2]}
        position={[0, TABLE_FRAME_HEIGHT + 0.003, 0]}
      >
        <planeGeometry
          args={
            props.axis === "x"
              ? [props.length - 0.24, TABLE_BORDER_WIDTH * 0.34]
              : [props.length - 0.24, TABLE_BORDER_WIDTH * 0.34]
          }
        />
        <meshBasicMaterial
          color="#e8c57d"
          transparent
          opacity={rackConfig.frameWoodAccentOpacity}
          toneMapped={false}
        />
      </mesh>
      <mesh
        rotation={props.axis === "x" ? [-Math.PI / 2, 0, 0] : [-Math.PI / 2, 0, Math.PI / 2]}
        position={[0, TABLE_FRAME_HEIGHT + 0.005, 0]}
      >
        <planeGeometry
          args={
            props.axis === "x"
              ? [props.length - 0.42, TABLE_BORDER_WIDTH * 0.12]
              : [props.length - 0.42, TABLE_BORDER_WIDTH * 0.12]
          }
        />
        <meshBasicMaterial
          color="#f3d28c"
          transparent
          opacity={finishConfig.frameTopGlowOpacity}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function RackShell(props: {
  cards: HiddenHandCard[];
  seat: "north" | "east" | "west";
  plaqueTexture: Texture;
  woodTexture: Texture;
}) {
  const rackConfig = getAltTableRackMaterialConfig();
  const plaqueConfig = getAltRackPlaquePresentationConfig();
  const commonMaterial = (
    <meshStandardMaterial
      color="#96613b"
      map={props.woodTexture}
      metalness={rackConfig.rackWoodMetalness}
      roughness={rackConfig.rackWoodRoughness}
    />
  );
  const seatCards = props.cards.filter((card) => card.seat === props.seat);
  if (seatCards.length === 0) {
    return null;
  }

  const xs = seatCards.map((card) => designToWorld(card.anchor.center_px.x, card.anchor.center_px.y)[0]);
  const zs = seatCards.map((card) => designToWorld(card.anchor.center_px.x, card.anchor.center_px.y)[2]);
  const sampleSize = getHiddenCardWorldSize(seatCards[Math.floor(seatCards.length / 2)]!.anchor);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const basePosition = getRackShellBasePosition({
    seat: props.seat,
    minX,
    maxX,
    minZ,
    maxZ,
    sampleSize
  });
  const slotDividerConfig = getAltRackSlotDividerConfig();
  const seatCenters = seatCards.map((card) =>
    designToWorld(card.anchor.center_px.x, card.anchor.center_px.y)
  );
  const northSlotDividers = buildRackSlotDividerOffsets({
    seat: "north",
    centers: seatCenters,
    basePosition
  });
  const sideSlotDividers = buildRackSlotDividerOffsets({
    seat: props.seat === "north" ? "east" : props.seat,
    centers: seatCenters,
    basePosition
  });

  if (props.seat === "north") {
    const width = maxX - minX + sampleSize.width * 1.75;
    const depth = sampleSize.height * 1.18;
    return (
      <group position={basePosition}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[width, RACK_BASE_HEIGHT, depth]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[-width * 0.34, -RACK_FOOT_HEIGHT * 0.24, depth * 0.18]}>
          <boxGeometry args={[RACK_FOOT_WIDTH, RACK_FOOT_HEIGHT, RACK_FOOT_DEPTH]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[0, -RACK_FOOT_HEIGHT * 0.22, depth * 0.22]}>
          <boxGeometry args={[RACK_PEDESTAL_WIDTH, RACK_FOOT_HEIGHT, RACK_PEDESTAL_DEPTH]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[width * 0.34, -RACK_FOOT_HEIGHT * 0.24, depth * 0.18]}>
          <boxGeometry args={[RACK_FOOT_WIDTH, RACK_FOOT_HEIGHT, RACK_FOOT_DEPTH]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[0, RACK_SIDE_HEIGHT * 0.5, -depth * 0.28]}>
          <boxGeometry args={[width - 0.1, RACK_SIDE_HEIGHT, RACK_SIDE_THICKNESS]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[0, RACK_BASE_HEIGHT * 0.18, depth * 0.02]}>
          <boxGeometry args={[width - 0.22, RACK_SLOT_THICKNESS, RACK_SLOT_DEPTH]} />
          <meshStandardMaterial color="#2b1a12" metalness={0.08} roughness={0.86} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, RACK_BASE_HEIGHT * 0.24, depth * 0.2]}>
          <boxGeometry args={[width - 0.22, RACK_SLOT_THICKNESS * 0.9, RACK_SIDE_THICKNESS * 0.7]} />
          <meshStandardMaterial color="#44291b" metalness={0.1} roughness={0.8} />
        </mesh>
        {northSlotDividers.map((offset, index) => (
          <mesh
            key={`north-slot-divider-${index}`}
            castShadow
            receiveShadow
            position={[offset, RACK_SLOT_DIVIDER_HEIGHT * 0.5, depth * slotDividerConfig.northInset]}
          >
            <boxGeometry
              args={[
                RACK_SLOT_DIVIDER_THICKNESS,
                RACK_SLOT_DIVIDER_HEIGHT,
                RACK_SLOT_DEPTH * 0.88
              ]}
            />
            <meshStandardMaterial
              color="#4f2f1d"
              map={props.woodTexture}
              metalness={rackConfig.rackWoodMetalness * 0.82}
              roughness={rackConfig.rackWoodRoughness * 1.02}
            />
          </mesh>
        ))}
        <mesh castShadow receiveShadow position={[0, RACK_TRAY_BRIDGE_HEIGHT * 0.5, depth * 0.36]}>
          <boxGeometry args={[width * 0.58, RACK_TRAY_BRIDGE_HEIGHT, depth * 0.26]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[0, RACK_FRONT_LIP_HEIGHT * 0.5, depth * 0.28]}>
          <boxGeometry args={[width - 0.08, RACK_FRONT_LIP_HEIGHT, RACK_FRONT_LIP_DEPTH]} />
          {commonMaterial}
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, RACK_FRONT_LIP_HEIGHT + 0.002, depth * 0.31]}>
          <planeGeometry args={[width - 0.16, RACK_TRIM_WIDTH]} />
          <meshBasicMaterial color="#d2ab55" transparent opacity={rackConfig.rackTrimOpacity} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, RACK_FRONT_LIP_HEIGHT + 0.003, depth * 0.24]}>
          <planeGeometry args={[width - 0.22, depth * 0.16]} />
          <meshBasicMaterial
            color="#efcb83"
            transparent
            opacity={rackConfig.rackWoodAccentOpacity}
            toneMapped={false}
          />
        </mesh>
        <mesh castShadow receiveShadow position={[0, RACK_REAR_SPINE_HEIGHT * 0.5, -depth * 0.4]}>
          <boxGeometry args={[width * 0.74, RACK_REAR_SPINE_HEIGHT, depth * 0.22]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[-width / 2 + RACK_END_BLOCK / 2, RACK_SIDE_HEIGHT * 0.34, -depth * 0.04]}>
          <boxGeometry args={[RACK_END_BLOCK, RACK_SIDE_HEIGHT * 0.72, depth * 0.76]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[width / 2 - RACK_END_BLOCK / 2, RACK_SIDE_HEIGHT * 0.34, -depth * 0.04]}>
          <boxGeometry args={[RACK_END_BLOCK, RACK_SIDE_HEIGHT * 0.72, depth * 0.76]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[-width * 0.34, RACK_SIDE_HEIGHT * 0.26, depth * 0.14]}>
          <boxGeometry args={[RACK_SUPPORT_BLOCK, RACK_SIDE_HEIGHT * 0.52, depth * 0.52]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[width * 0.34, RACK_SIDE_HEIGHT * 0.26, depth * 0.14]}>
          <boxGeometry args={[RACK_SUPPORT_BLOCK, RACK_SIDE_HEIGHT * 0.52, depth * 0.52]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[-width * 0.38, RACK_SIDE_HEIGHT * 0.18, depth * 0.3]}>
          <boxGeometry args={[RACK_WING_BLOCK, RACK_SIDE_HEIGHT * 0.34, depth * 0.24]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[width * 0.38, RACK_SIDE_HEIGHT * 0.18, depth * 0.3]}>
          <boxGeometry args={[RACK_WING_BLOCK, RACK_SIDE_HEIGHT * 0.34, depth * 0.24]} />
          {commonMaterial}
        </mesh>
        <mesh
          castShadow
          receiveShadow
          position={[-width / 2 + RACK_CHEEK_WIDTH * 0.72, RACK_CHEEK_HEIGHT * 0.42, depth * 0.18]}
          rotation={[0, 0, 0.3]}
        >
          <boxGeometry args={[RACK_CHEEK_WIDTH, RACK_CHEEK_HEIGHT, RACK_CHEEK_DEPTH]} />
          {commonMaterial}
        </mesh>
        <mesh
          castShadow
          receiveShadow
          position={[width / 2 - RACK_CHEEK_WIDTH * 0.72, RACK_CHEEK_HEIGHT * 0.42, depth * 0.18]}
          rotation={[0, 0, -0.3]}
        >
          <boxGeometry args={[RACK_CHEEK_WIDTH, RACK_CHEEK_HEIGHT, RACK_CHEEK_DEPTH]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[0, RACK_BASE_HEIGHT * 0.62, depth * 0.18]}>
          <boxGeometry args={[width * 0.42, RACK_BASE_HEIGHT * 0.62, depth * 0.3]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[0, RACK_SIDE_HEIGHT + RACK_CAP_HEIGHT * 0.2, -depth * 0.26]}>
          <boxGeometry args={[width - 0.22, RACK_CAP_HEIGHT, RACK_CAP_DEPTH]} />
          {commonMaterial}
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, RACK_SIDE_HEIGHT + RACK_CAP_HEIGHT + 0.002, -depth * 0.24]}>
          <planeGeometry args={[width - 0.3, RACK_TRIM_WIDTH]} />
          <meshBasicMaterial color="#cda451" transparent opacity={rackConfig.rackTrimOpacity} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, RACK_SIDE_HEIGHT + RACK_CAP_HEIGHT + 0.004, -depth * 0.16]}>
          <planeGeometry args={[width - 0.34, depth * 0.18]} />
          <meshBasicMaterial
            color="#f4d28a"
            transparent
            opacity={rackConfig.rackWoodAccentOpacity}
            toneMapped={false}
          />
        </mesh>
        <mesh
          castShadow
          receiveShadow
          position={[-width * 0.28, RACK_SIDE_HEIGHT * 0.54, -depth * 0.12]}
          rotation={[0, 0, 0.18]}
        >
          <boxGeometry args={[RACK_SHOULDER_BLOCK, RACK_SIDE_HEIGHT * 0.74, depth * 0.42]} />
          {commonMaterial}
        </mesh>
        <mesh
          castShadow
          receiveShadow
          position={[width * 0.28, RACK_SIDE_HEIGHT * 0.54, -depth * 0.12]}
          rotation={[0, 0, -0.18]}
        >
          <boxGeometry args={[RACK_SHOULDER_BLOCK, RACK_SIDE_HEIGHT * 0.74, depth * 0.42]} />
          {commonMaterial}
        </mesh>
        <mesh castShadow receiveShadow position={[0, RACK_PLAQUE_HEIGHT * 0.9, depth * 0.42]}>
          <boxGeometry args={[RACK_PLAQUE_WIDTH * 1.18, RACK_PLAQUE_HEIGHT * 1.22, depth * 0.18]} />
          <meshStandardMaterial
            color="#774729"
            map={props.woodTexture}
            metalness={rackConfig.rackWoodMetalness}
            roughness={rackConfig.rackWoodRoughness * 0.94}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, RACK_PLAQUE_HEIGHT * 1.5, depth * 0.47]}>
          <planeGeometry args={[RACK_PLAQUE_WIDTH * 1.02, depth * 0.12]} />
          <meshBasicMaterial
            color="#f0cd85"
            transparent
            opacity={rackConfig.rackWoodAccentOpacity + 0.08}
            toneMapped={false}
          />
        </mesh>
        <SeatPlaque
          height={RACK_PLAQUE_HEIGHT * plaqueConfig.northPlaqueScale}
          position={[0, RACK_PLAQUE_HEIGHT * plaqueConfig.northPlaqueLift, depth * plaqueConfig.northPlaqueDepth]}
          rotation={[0, 0, 0]}
          texture={props.plaqueTexture}
          width={RACK_PLAQUE_WIDTH * plaqueConfig.northPlaqueScale}
        />
      </group>
    );
  }

  const depth = sampleSize.width * 1.18;
  const height = maxZ - minZ + sampleSize.width * 2.54;
  const sideDir = props.seat === "east" ? -1 : 1;
  return (
    <group position={basePosition}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[depth, RACK_BASE_HEIGHT, height]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[-sideDir * depth * 0.14, -RACK_FOOT_HEIGHT * 0.24, -height * 0.32]}>
        <boxGeometry args={[RACK_FOOT_DEPTH, RACK_FOOT_HEIGHT, RACK_FOOT_WIDTH]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[-sideDir * depth * 0.12, -RACK_FOOT_HEIGHT * 0.22, 0]}>
        <boxGeometry args={[RACK_PEDESTAL_DEPTH, RACK_FOOT_HEIGHT, RACK_PEDESTAL_WIDTH]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[-sideDir * depth * 0.14, -RACK_FOOT_HEIGHT * 0.24, height * 0.32]}>
        <boxGeometry args={[RACK_FOOT_DEPTH, RACK_FOOT_HEIGHT, RACK_FOOT_WIDTH]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[sideDir * depth * 0.26, RACK_SIDE_HEIGHT * 0.5, 0]}>
        <boxGeometry args={[RACK_SIDE_THICKNESS, RACK_SIDE_HEIGHT, height - 0.1]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[-sideDir * depth * 0.04, RACK_BASE_HEIGHT * 0.18, 0]}>
        <boxGeometry args={[RACK_SLOT_DEPTH, RACK_SLOT_THICKNESS, height - 0.26]} />
        <meshStandardMaterial color="#2b1a12" metalness={0.08} roughness={0.86} />
      </mesh>
      <mesh castShadow receiveShadow position={[-sideDir * depth * 0.2, RACK_BASE_HEIGHT * 0.24, 0]}>
        <boxGeometry args={[RACK_SIDE_THICKNESS * 0.72, RACK_SLOT_THICKNESS * 0.9, height - 0.26]} />
        <meshStandardMaterial color="#44291b" metalness={0.1} roughness={0.8} />
      </mesh>
      {sideSlotDividers.map((offset, index) => (
        <mesh
          key={`${props.seat}-slot-divider-${index}`}
          castShadow
          receiveShadow
          position={[-sideDir * depth * slotDividerConfig.sideInset, RACK_SLOT_DIVIDER_HEIGHT * 0.5, offset]}
        >
          <boxGeometry
            args={[
              RACK_SLOT_DEPTH * 0.9,
              RACK_SLOT_DIVIDER_HEIGHT,
              RACK_SLOT_DIVIDER_THICKNESS
            ]}
          />
          <meshStandardMaterial
            color="#4f2f1d"
            map={props.woodTexture}
            metalness={rackConfig.rackWoodMetalness * 0.82}
            roughness={rackConfig.rackWoodRoughness * 1.02}
          />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[-sideDir * depth * 0.3, RACK_TRAY_BRIDGE_HEIGHT * 0.5, 0]}>
        <boxGeometry args={[depth * 0.26, RACK_TRAY_BRIDGE_HEIGHT, height * 0.56]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[-sideDir * depth * 0.24, RACK_FRONT_LIP_HEIGHT * 0.5, 0]}>
        <boxGeometry args={[RACK_FRONT_LIP_DEPTH, RACK_FRONT_LIP_HEIGHT, height - 0.08]} />
        {commonMaterial}
      </mesh>
      <mesh rotation={[0, sideDir * Math.PI / 2, 0]} position={[-sideDir * depth * 0.27, RACK_FRONT_LIP_HEIGHT + 0.002, 0]}>
        <planeGeometry args={[height - 0.16, RACK_TRIM_WIDTH]} />
        <meshBasicMaterial color="#d2ab55" transparent opacity={rackConfig.rackTrimOpacity} />
      </mesh>
      <mesh rotation={[0, sideDir * Math.PI / 2, 0]} position={[-sideDir * depth * 0.21, RACK_FRONT_LIP_HEIGHT + 0.003, 0]}>
        <planeGeometry args={[height - 0.22, depth * 0.16]} />
        <meshBasicMaterial
          color="#efcb83"
          transparent
          opacity={rackConfig.rackWoodAccentOpacity}
          toneMapped={false}
        />
      </mesh>
      <mesh castShadow receiveShadow position={[sideDir * depth * 0.34, RACK_REAR_SPINE_HEIGHT * 0.5, 0]}>
        <boxGeometry args={[depth * 0.22, RACK_REAR_SPINE_HEIGHT, height * 0.74]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[0, RACK_SIDE_HEIGHT * 0.34, -height / 2 + RACK_END_BLOCK / 2]}>
        <boxGeometry args={[depth * 0.76, RACK_SIDE_HEIGHT * 0.72, RACK_END_BLOCK]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[0, RACK_SIDE_HEIGHT * 0.34, height / 2 - RACK_END_BLOCK / 2]}>
        <boxGeometry args={[depth * 0.76, RACK_SIDE_HEIGHT * 0.72, RACK_END_BLOCK]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[sideDir * depth * 0.08, RACK_SIDE_HEIGHT * 0.26, -height * 0.28]}>
        <boxGeometry args={[RACK_SUPPORT_BLOCK * 0.82, RACK_SIDE_HEIGHT * 0.52, RACK_SUPPORT_BLOCK]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[sideDir * depth * 0.08, RACK_SIDE_HEIGHT * 0.26, height * 0.28]}>
        <boxGeometry args={[RACK_SUPPORT_BLOCK * 0.82, RACK_SIDE_HEIGHT * 0.52, RACK_SUPPORT_BLOCK]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[-sideDir * depth * 0.22, RACK_SIDE_HEIGHT * 0.18, -height * 0.34]}>
        <boxGeometry args={[depth * 0.22, RACK_SIDE_HEIGHT * 0.34, RACK_WING_BLOCK]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[-sideDir * depth * 0.22, RACK_SIDE_HEIGHT * 0.18, height * 0.34]}>
        <boxGeometry args={[depth * 0.22, RACK_SIDE_HEIGHT * 0.34, RACK_WING_BLOCK]} />
        {commonMaterial}
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[sideDir * depth * 0.22, RACK_CHEEK_HEIGHT * 0.42, -height * 0.34]}
        rotation={[0.3, 0, 0]}
      >
        <boxGeometry args={[RACK_CHEEK_DEPTH, RACK_CHEEK_HEIGHT, RACK_CHEEK_WIDTH]} />
        {commonMaterial}
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[sideDir * depth * 0.22, RACK_CHEEK_HEIGHT * 0.42, height * 0.34]}
        rotation={[-0.3, 0, 0]}
      >
        <boxGeometry args={[RACK_CHEEK_DEPTH, RACK_CHEEK_HEIGHT, RACK_CHEEK_WIDTH]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[-sideDir * depth * 0.08, RACK_BASE_HEIGHT * 0.62, 0]}>
        <boxGeometry args={[depth * 0.3, RACK_BASE_HEIGHT * 0.62, height * 0.42]} />
        {commonMaterial}
      </mesh>
      <mesh castShadow receiveShadow position={[sideDir * depth * 0.24, RACK_SIDE_HEIGHT + RACK_CAP_HEIGHT * 0.2, 0]}>
        <boxGeometry args={[RACK_CAP_DEPTH, RACK_CAP_HEIGHT, height - 0.18]} />
        {commonMaterial}
      </mesh>
      <mesh rotation={[0, sideDir * Math.PI / 2, 0]} position={[sideDir * depth * 0.26, RACK_SIDE_HEIGHT + RACK_CAP_HEIGHT + 0.002, 0]}>
        <planeGeometry args={[height - 0.26, RACK_TRIM_WIDTH]} />
        <meshBasicMaterial color="#cda451" transparent opacity={rackConfig.rackTrimOpacity} />
      </mesh>
      <mesh rotation={[0, sideDir * Math.PI / 2, 0]} position={[sideDir * depth * 0.2, RACK_SIDE_HEIGHT + RACK_CAP_HEIGHT + 0.004, 0]}>
        <planeGeometry args={[height - 0.3, depth * 0.18]} />
        <meshBasicMaterial
          color="#f4d28a"
          transparent
          opacity={rackConfig.rackWoodAccentOpacity}
          toneMapped={false}
        />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[sideDir * depth * 0.16, RACK_SIDE_HEIGHT * 0.54, -height * 0.22]}
        rotation={[0.18 * sideDir, 0, 0]}
      >
        <boxGeometry args={[depth * 0.42, RACK_SIDE_HEIGHT * 0.74, RACK_SHOULDER_BLOCK]} />
        {commonMaterial}
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[sideDir * depth * 0.16, RACK_SIDE_HEIGHT * 0.54, height * 0.22]}
        rotation={[-0.18 * sideDir, 0, 0]}
      >
        <boxGeometry args={[depth * 0.42, RACK_SIDE_HEIGHT * 0.74, RACK_SHOULDER_BLOCK]} />
        {commonMaterial}
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[sideDir * (depth * plaqueConfig.sidePlaqueOffset + RACK_PLAQUE_INSET), RACK_PLAQUE_HEIGHT * 1.42, 0]}
        rotation={[0, sideDir * plaqueConfig.sidePlaqueYaw, 0]}
      >
        <boxGeometry args={[depth * 0.18, RACK_PLAQUE_HEIGHT * 1.28, RACK_PLAQUE_WIDTH * 1.16]} />
        <meshStandardMaterial
          color="#774729"
          map={props.woodTexture}
          metalness={rackConfig.rackWoodMetalness}
          roughness={rackConfig.rackWoodRoughness * 0.94}
        />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[sideDir * (depth * (plaqueConfig.sidePlaqueOffset - 0.08) + RACK_PLAQUE_INSET), RACK_PLAQUE_HEIGHT * 1.34, 0]}
        rotation={[0, sideDir * (plaqueConfig.sidePlaqueYaw * 0.76), 0]}
      >
        <boxGeometry args={[depth * plaqueConfig.sidePlaqueBridgeLength, RACK_PLAQUE_HEIGHT * 0.62, RACK_PLAQUE_WIDTH * 0.52]} />
        <meshStandardMaterial
          color="#6e4027"
          map={props.woodTexture}
          metalness={rackConfig.rackWoodMetalness}
          roughness={rackConfig.rackWoodRoughness}
        />
      </mesh>
      <mesh
        rotation={[0, sideDir * Math.PI / 2, 0]}
        position={[sideDir * (depth * (plaqueConfig.sidePlaqueOffset + 0.03) + RACK_PLAQUE_INSET), RACK_PLAQUE_HEIGHT * 1.96, 0]}
      >
        <planeGeometry args={[RACK_PLAQUE_WIDTH * 1.02, depth * 0.11]} />
        <meshBasicMaterial
          color="#f0cd85"
          transparent
          opacity={rackConfig.rackWoodAccentOpacity + 0.08}
          toneMapped={false}
        />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[sideDir * (depth * plaqueConfig.sidePlaqueOffset + RACK_PLAQUE_INSET + 0.03), RACK_PLAQUE_HEIGHT * 1.96, 0]}
        rotation={[0, sideDir * plaqueConfig.sidePlaqueYaw, 0]}
      >
        <boxGeometry args={[depth * plaqueConfig.sidePlaqueBackerThickness, RACK_PLAQUE_HEIGHT * 0.22, RACK_PLAQUE_WIDTH * 1.16]} />
        <meshStandardMaterial
          color="#82512f"
          map={props.woodTexture}
          metalness={rackConfig.rackWoodMetalness}
          roughness={rackConfig.rackWoodRoughness * 0.92}
        />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[sideDir * (depth * plaqueConfig.sidePlaqueOffset + RACK_PLAQUE_INSET + 0.03), RACK_PLAQUE_HEIGHT * 0.72, 0]}
        rotation={[0, sideDir * plaqueConfig.sidePlaqueYaw, 0]}
      >
        <boxGeometry args={[depth * plaqueConfig.sidePlaqueBackerThickness, RACK_PLAQUE_HEIGHT * 0.18, RACK_PLAQUE_WIDTH * 1.12]} />
        <meshStandardMaterial
          color="#6e4027"
          map={props.woodTexture}
          metalness={rackConfig.rackWoodMetalness}
          roughness={rackConfig.rackWoodRoughness}
        />
      </mesh>
      <SeatPlaque
        height={RACK_PLAQUE_WIDTH * plaqueConfig.sidePlaqueScale}
        position={[sideDir * (depth * plaqueConfig.sidePlaqueOffset + RACK_PLAQUE_INSET + 0.04), RACK_PLAQUE_HEIGHT * plaqueConfig.sidePlaqueLift, 0]}
        rotation={[0, sideDir * plaqueConfig.sidePlaqueYaw, 0]}
        texture={props.plaqueTexture}
        width={RACK_PLAQUE_HEIGHT * plaqueConfig.sidePlaqueScale}
      />
    </group>
  );
}

function buildRackSlotDividerOffsets(args: {
  seat: "north" | "east" | "west";
  centers: readonly (readonly [number, number, number])[];
  basePosition: readonly [number, number, number];
}) {
  if (args.centers.length < 2) {
    return [];
  }

  return args.centers.slice(0, -1).map((center, index) => {
    const nextCenter = args.centers[index + 1]!;
    const midpoint =
      args.seat === "north"
        ? (center[0] + nextCenter[0]) / 2 - args.basePosition[0]
        : (center[2] + nextCenter[2]) / 2 - args.basePosition[2];
    return midpoint;
  });
}

export function getRackShellBasePosition(args: {
  seat: "north" | "east" | "west";
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  sampleSize: { width: number; height: number };
}) {
  if (args.seat === "north") {
    return [
      (args.minX + args.maxX) / 2,
      0.1,
      args.minZ - args.sampleSize.width * 0.14
    ] as const;
  }

  return [
    args.seat === "east"
      ? args.maxX + args.sampleSize.width * 0.16
      : args.minX - args.sampleSize.width * 0.16,
    0.1,
    (args.minZ + args.maxZ) / 2
  ] as const;
}

function SeatPlaque(props: {
  height: number;
  position: [number, number, number];
  rotation: [number, number, number];
  texture: Texture;
  width: number;
}) {
  return (
    <group position={props.position} rotation={props.rotation}>
      <mesh position={[0, 0, -0.028]}>
        <boxGeometry args={[props.width + 0.14, props.height + 0.14, 0.056]} />
        <meshStandardMaterial color="#9b7a33" metalness={0.34} roughness={0.46} />
      </mesh>
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[props.width + 0.08, props.height + 0.08, 0.024]} />
        <meshStandardMaterial color="#0f241a" metalness={0.18} roughness={0.58} />
      </mesh>
      <mesh>
        <planeGeometry args={[props.width, props.height]} />
        <meshBasicMaterial map={props.texture} transparent />
      </mesh>
    </group>
  );
}

function buildSeatPlaqueSrc(
  label: string,
  options?: {
    vertical?: boolean;
  }
) {
  const isVertical = options?.vertical ?? false;
  const width = isVertical ? 220 : 420;
  const height = isVertical ? 420 : 220;
  const textTransform = isVertical
    ? `translate(${width / 2} ${height / 2}) rotate(-90)`
    : `translate(${width / 2} ${height / 2})`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="28" fill="#0f241a" stroke="#9f7c34" stroke-width="10"/>
  <rect x="22" y="22" width="${width - 44}" height="${height - 44}" rx="20" fill="#153224" stroke="#c6a65d" stroke-opacity="0.55" stroke-width="3"/>
  <g transform="${textTransform}">
    <text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, serif" font-size="${isVertical ? 64 : 78}" fill="#f0ddb1" letter-spacing="6">${label}</text>
  </g>
</svg>
`)}`;
}

function buildScorePlaqueSrc() {
  const width = 380;
  const height = 220;
  return `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="28" fill="#0f241a" stroke="#9f7c34" stroke-width="10"/>
  <rect x="22" y="22" width="${width - 44}" height="${height - 44}" rx="20" fill="#153224" stroke="#c6a65d" stroke-opacity="0.55" stroke-width="3"/>
  <text x="98" y="72" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#f0ddb1" letter-spacing="4">WE</text>
  <text x="282" y="72" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#f0ddb1" letter-spacing="4">THEY</text>
  <text x="98" y="156" text-anchor="middle" font-family="Georgia, serif" font-size="66" fill="#f0ddb1">0</text>
  <text x="282" y="156" text-anchor="middle" font-family="Georgia, serif" font-size="66" fill="#f0ddb1">0</text>
</svg>
`)}`;
}

function buildWorldPlateAlphaSrc(args: {
  insetX: number;
  insetY: number;
}) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024">
  <rect width="1536" height="1024" fill="#ffffff"/>
  <rect
    x="${args.insetX}"
    y="${args.insetY}"
    width="${1536 - args.insetX * 2}"
    height="${1024 - args.insetY * 2}"
    rx="48"
    fill="#000000"
  />
</svg>
`)}`;
}

function buildReferenceDragonAlphaSrc() {
  const config = getAltTableReferenceCenterMaskConfig();
  const dragonField = config.dragonField;

  return `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024">
  <defs>
    <radialGradient id="dragonMask" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="58%" stop-color="#f0f0f0"/>
      <stop offset="82%" stop-color="#7a7a7a"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
  </defs>
  <rect width="1536" height="1024" fill="#000000"/>
  <ellipse
    cx="${dragonField.cx}"
    cy="${dragonField.cy}"
    rx="${dragonField.rx}"
    ry="${dragonField.ry}"
    fill="url(#dragonMask)"
  />
</svg>
`)}`;
}

function buildReferenceHardwareAlphaSrc() {
  const config = getAltTableReferenceHardwareMaskConfig();
  const rackRects = [
    config.topRack,
    config.leftRack,
    config.rightRack,
    config.frontRail,
    config.scorePlaque,
    config.passPlaque,
    config.specialCardPlaque
  ];

  const rackMarkup = rackRects
    .map(
      (rect) => `
  <rect
    x="${rect.x}"
    y="${rect.y}"
    width="${rect.width}"
    height="${rect.height}"
    rx="${rect.radius}"
    fill="#ffffff"
  />`
    )
    .join("");

  return `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024">
  <rect width="1536" height="1024" fill="#000000"/>
  ${rackMarkup}
</svg>
`)}`;
}

function supportsWebGlCanvas() {
  if (typeof document === "undefined") {
    return false;
  }

  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    return false;
  }

  const canvas = document.createElement("canvas");
  if (typeof canvas.getContext !== "function") {
    return false;
  }

  try {
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}
