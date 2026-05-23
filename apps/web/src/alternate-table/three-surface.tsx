import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import type {
  ImmersiveSceneCard,
  ImmersiveSceneModel,
  ImmersiveScenePassRoute
} from "./phaser-surface";

type AlternateTableThreeSurfaceProps = {
  model: ImmersiveSceneModel;
};

type TablePoint = {
  x: number;
  z: number;
  depth: number;
};

type CardPlacement = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

function supportsThreeCanvas() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  return !/jsdom/i.test(window.navigator?.userAgent ?? "");
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function createWoodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#6d4d34");
  gradient.addColorStop(0.28, "#7a5638");
  gradient.addColorStop(0.62, "#5d3f2a");
  gradient.addColorStop(1, "#3f2a1c");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let stripe = 0; stripe < 40; stripe += 1) {
    const y = (stripe / 39) * canvas.height;
    context.strokeStyle = `rgba(255, 222, 177, ${0.025 + (stripe % 3) * 0.01})`;
    context.lineWidth = 1 + (stripe % 4) * 0.4;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(
      canvas.width * 0.18,
      y - 16,
      canvas.width * 0.62,
      y + 24,
      canvas.width,
      y - 8
    );
    context.stroke();
  }

  for (let knot = 0; knot < 18; knot += 1) {
    const cx = ((knot * 173) % 900) + 60;
    const cy = ((knot * 127) % 760) + 120;
    const rx = 22 + (knot % 5) * 10;
    const ry = 12 + (knot % 4) * 7;
    context.strokeStyle = "rgba(48, 31, 20, 0.3)";
    context.lineWidth = 2;
    for (let ring = 0; ring < 3; ring += 1) {
      context.beginPath();
      context.ellipse(cx, cy, rx + ring * 10, ry + ring * 6, 0, 0, Math.PI * 2);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createWallTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#7a5b45");
  gradient.addColorStop(0.55, "#664936");
  gradient.addColorStop(1, "#4a3528");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let panel = 0; panel < 18; panel += 1) {
    const x = (panel / 18) * canvas.width;
    context.fillStyle = "rgba(39, 25, 18, 0.22)";
    context.fillRect(x, 0, 4, canvas.height);
    context.fillStyle = "rgba(255, 223, 181, 0.05)";
    context.fillRect(x + 6, 0, 1.5, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1.6, 1);
  texture.needsUpdate = true;
  return texture;
}

function createCardTexture(card: ImmersiveSceneCard) {
  const canvas = document.createElement("canvas");
  canvas.width = 420;
  canvas.height = 600;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const radius = 28;
  context.fillStyle = card.faceDown ? "#283247" : card.card.kind === "special" ? "#f3ede2" : "#faf7f0";
  context.strokeStyle = card.faceDown ? "rgba(232, 224, 210, 0.72)" : "#ddd2c3";
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(radius, 0);
  context.arcTo(canvas.width, 0, canvas.width, canvas.height, radius);
  context.arcTo(canvas.width, canvas.height, 0, canvas.height, radius);
  context.arcTo(0, canvas.height, 0, 0, radius);
  context.arcTo(0, 0, canvas.width, 0, radius);
  context.closePath();
  context.fill();
  context.stroke();

  if (card.faceDown) {
    context.strokeStyle = "rgba(232, 224, 210, 0.22)";
    context.lineWidth = 6;
    context.strokeRect(54, 72, canvas.width - 108, canvas.height - 144);
    context.lineWidth = 2;
    context.beginPath();
    context.arc(canvas.width / 2, canvas.height / 2, 54, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(canvas.width / 2 - 86, canvas.height / 2);
    context.lineTo(canvas.width / 2 + 86, canvas.height / 2);
    context.moveTo(canvas.width / 2, canvas.height / 2 - 76);
    context.lineTo(canvas.width / 2, canvas.height / 2 + 76);
    context.stroke();
  } else {
    const tint =
      card.card.kind === "special"
        ? card.card.special === "phoenix"
          ? "#c46b59"
          : card.card.special === "dragon"
            ? "#cb9a37"
            : card.card.special === "mahjong"
              ? "#539a54"
              : "#847157"
        : card.card.suit === "jade"
          ? "#2d976d"
          : card.card.suit === "sword"
            ? "#4a6ba8"
            : card.card.suit === "pagoda"
              ? "#c45a48"
              : "#c79c31";
    const rank =
      card.card.kind === "special"
        ? card.card.special === "mahjong"
          ? "1"
          : card.card.special === "dog"
            ? "DOG"
            : card.card.special === "phoenix"
              ? "PHX"
              : "DRG"
        : card.card.rank === 11
          ? "J"
          : card.card.rank === 12
            ? "Q"
            : card.card.rank === 13
              ? "K"
              : card.card.rank === 14
                ? "A"
                : String(card.card.rank);
    const suit =
      card.card.kind === "special"
        ? card.card.special === "mahjong"
          ? "MAH"
          : card.card.special === "dog"
            ? "DOG"
            : card.card.special === "phoenix"
              ? "PHX"
              : "DRG"
        : card.card.suit === "jade"
          ? "J"
          : card.card.suit === "sword"
            ? "S"
            : card.card.suit === "pagoda"
              ? "P"
              : "*";

    context.fillStyle = "rgba(255,255,255,0.1)";
    context.fillRect(24, 24, canvas.width - 48, 114);
    context.fillStyle = tint;
    context.font = "700 74px Georgia";
    context.fillText(rank, 34, 94);
    context.font = "500 48px Georgia";
    context.fillText(suit, 40, 152);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2 + 12);
    context.globalAlpha = card.card.kind === "special" ? 0.92 : 0.78;
    context.font = card.card.kind === "special" ? "700 84px Georgia" : "600 118px Georgia";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(suit, 0, 0);
    context.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function mapPoseToTable(
  screenX: number,
  screenY: number,
  geometry: ImmersiveSceneModel["geometry"]
): TablePoint {
  const horizontal = clamp(
    (screenX - geometry.centerX) / Math.max(geometry.tableRadiusX, 1),
    -1,
    1
  );
  const nearFraction = clamp(
    (screenY - geometry.backY) / Math.max(geometry.frontY - geometry.backY, 1),
    0,
    1
  );
  const compression = THREE.MathUtils.lerp(0.58, 1.02, nearFraction);
  return {
    x: horizontal * 4.8 * compression,
    z: THREE.MathUtils.lerp(-3.05, 2.72, nearFraction),
    depth: nearFraction
  };
}

function createHandPlacement(
  item: ImmersiveSceneCard,
  index: number,
  count: number
): CardPlacement {
  const midpoint = (count - 1) / 2;
  const spread = Math.max(midpoint, 1);
  const offset = midpoint === 0 ? 0 : (index - midpoint) / spread;
  if (item.position === "bottom") {
    return {
      position: [offset * 2.7, 0.5 + (item.selected ? 0.08 : 0), 1.6 + Math.abs(offset) * 0.14],
      rotation: [-0.18, 0, THREE.MathUtils.degToRad(item.pose.rotation * 0.72)],
      scale: [0.62, 0.88, 1]
    };
  }

  if (item.position === "top") {
    return {
      position: [offset * 1.95, 0.48, -2.45 - Math.abs(offset) * 0.08],
      rotation: [-0.05, 0, THREE.MathUtils.degToRad(item.pose.rotation * 0.86)],
      scale: [0.48, 0.68, 1]
    };
  }

  const yaw = item.position === "left" ? 0.34 : -0.34;
  return {
    position: [
      item.position === "left" ? -4.3 - Math.abs(offset) * 0.18 : 4.3 + Math.abs(offset) * 0.18,
      0.54,
      -0.35 + offset * 2.15
    ],
    rotation: [-0.12, yaw, THREE.MathUtils.degToRad(item.pose.rotation * 0.52)],
    scale: [0.56, 0.8, 1]
  };
}

function createFlatPlacement(
  item: ImmersiveSceneCard | ImmersiveScenePassRoute,
  geometry: ImmersiveSceneModel["geometry"]
): CardPlacement {
  const point = mapPoseToTable(item.pose.screenX, item.pose.screenY, geometry);
  return {
    position: [point.x, 0.14, point.z],
    rotation: [-Math.PI / 2, 0, THREE.MathUtils.degToRad(item.pose.rotation)],
    scale: [item.width / 108, item.height / 152, 1]
  };
}

function CardMesh({
  item,
  geometry,
  mode,
  orderIndex = 0,
  orderCount = 1
}: {
  item: ImmersiveSceneCard;
  geometry: ImmersiveSceneModel["geometry"];
  mode: "hand" | "flat";
  orderIndex?: number;
  orderCount?: number;
}) {
  const texture = useMemo(() => createCardTexture(item), [item]);
  const placement =
    mode === "hand"
      ? createHandPlacement(item, orderIndex, orderCount)
      : createFlatPlacement(item, geometry);

  return (
    <group position={placement.position} rotation={placement.rotation} scale={placement.scale}>
      <mesh castShadow receiveShadow>
        <planeGeometry args={[1, 1.42]} />
        <meshStandardMaterial map={texture ?? undefined} color="#ffffff" roughness={0.34} metalness={0.02} />
      </mesh>
    </group>
  );
}

function PassSlotMesh({
  route,
  geometry
}: {
  route: ImmersiveScenePassRoute;
  geometry: ImmersiveSceneModel["geometry"];
}) {
  const placement = createFlatPlacement(route, geometry);
  return (
    <group position={placement.position} rotation={placement.rotation} scale={placement.scale}>
      <mesh receiveShadow>
        <planeGeometry args={[1, 1.42]} />
        <meshStandardMaterial
          color={route.selected ? "#d2b06d" : "#f0e0c4"}
          transparent
          opacity={route.occupied ? 0.18 : 0.08}
          roughness={0.52}
          metalness={0.04}
        />
      </mesh>
      <mesh position={[0, 0.002, 0]}>
        <planeGeometry args={[0.86, 1.2]} />
        <meshStandardMaterial
          color={route.selected ? "#f6d693" : "#7f6445"}
          transparent
          opacity={route.selected ? 0.28 : 0.12}
        />
      </mesh>
      {route.assignedCard && (
        <CardMesh
          item={{
            key: `${route.key}-card`,
            card: route.assignedCard,
            position: route.targetPosition,
            pose: { ...route.pose, rotation: 0 },
            width: route.width * 0.92,
            height: route.height * 0.92,
            faceDown: route.faceDown
          }}
          geometry={geometry}
          mode="flat"
        />
      )}
    </group>
  );
}

function TableScene({ model }: { model: ImmersiveSceneModel }) {
  const woodTexture = useMemo(createWoodTexture, []);
  const wallTexture = useMemo(createWallTexture, []);
  const tableWidth = 12.8;
  const tableDepth = 8.8;
  const northCards = model.remoteCards.filter((item) => item.position === "top");
  const westCards = model.remoteCards.filter((item) => item.position === "left");
  const eastCards = model.remoteCards.filter((item) => item.position === "right");

  return (
    <>
      <color attach="background" args={["#0f0a08"]} />
      <fog attach="fog" args={["#0f0a08", 12, 19]} />
      <ambientLight intensity={0.9} />
      <hemisphereLight args={["#f3dfbc", "#251710", 1.1]} />
      <directionalLight
        position={[4.4, 8, 5.8]}
        intensity={1.9}
        color="#ffe7bf"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={26}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      <spotLight position={[-5.6, 6.2, 6]} intensity={1.2} angle={0.5} penumbra={0.7} color="#f5dfbd" />
      <spotLight position={[5.6, 6.2, 6]} intensity={1.2} angle={0.5} penumbra={0.7} color="#f5dfbd" />

      <mesh position={[0, 3.6, -6.2]} receiveShadow>
        <planeGeometry args={[26, 11]} />
        <meshStandardMaterial map={wallTexture ?? undefined} color="#6a4d3a" roughness={0.92} metalness={0.02} />
      </mesh>
      <mesh position={[-7.8, 1.4, -2.4]} rotation={[0, Math.PI / 2.9, 0]}>
        <boxGeometry args={[2.2, 3.4, 2.4]} />
        <meshStandardMaterial color="#1f1714" roughness={0.98} />
      </mesh>
      <mesh position={[7.8, 1.45, -2.25]} rotation={[0, -Math.PI / 3.1, 0]}>
        <boxGeometry args={[2.2, 3.4, 2.4]} />
        <meshStandardMaterial color="#211917" roughness={0.98} />
      </mesh>
      <mesh position={[-6.1, 2.2, -5.4]}>
        <cylinderGeometry args={[0.48, 0.58, 0.82, 24]} />
        <meshStandardMaterial color="#6d513b" roughness={0.84} />
      </mesh>
      <mesh position={[6.2, 2.1, -5.15]}>
        <cylinderGeometry args={[0.48, 0.58, 0.82, 24]} />
        <meshStandardMaterial color="#6d513b" roughness={0.84} />
      </mesh>

      <group position={[0, 0, -0.2]}>
        <mesh position={[0, -0.48, 0]} castShadow receiveShadow scale={[1, 1, 0.98]}>
          <cylinderGeometry args={[6.18, 6.28, 0.9, 64]} />
          <meshStandardMaterial color="#2b1d15" roughness={0.86} metalness={0.06} />
        </mesh>
        <mesh position={[0, -0.03, 0]} castShadow receiveShadow scale={[1, 1, 0.99]}>
          <cylinderGeometry args={[6.08, 6.18, 0.26, 64]} />
          <meshStandardMaterial color="#4d321f" roughness={0.76} metalness={0.08} />
        </mesh>
        <mesh position={[0, 0.11, 0]} castShadow receiveShadow scale={[tableWidth / 12, 0.14, tableDepth / 8]}>
          <cylinderGeometry args={[6, 6, 0.1, 96]} />
          <meshStandardMaterial map={woodTexture ?? undefined} color="#69452e" roughness={0.72} metalness={0.03} />
        </mesh>
        <mesh position={[0, 0.135, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[4.6, 5.45, 96]} />
          <meshStandardMaterial color="#c49d63" transparent opacity={0.15} roughness={0.36} metalness={0.44} />
        </mesh>
      </group>

      {model.passRoutes.map((route) => (
        <PassSlotMesh key={route.key} route={route} geometry={model.geometry} />
      ))}

      {northCards.map((item, index) => (
        <CardMesh
          key={item.key}
          item={item}
          geometry={model.geometry}
          mode="hand"
          orderIndex={index}
          orderCount={northCards.length}
        />
      ))}
      {westCards.map((item, index) => (
        <CardMesh
          key={item.key}
          item={item}
          geometry={model.geometry}
          mode="hand"
          orderIndex={index}
          orderCount={westCards.length}
        />
      ))}
      {eastCards.map((item, index) => (
        <CardMesh
          key={item.key}
          item={item}
          geometry={model.geometry}
          mode="hand"
          orderIndex={index}
          orderCount={eastCards.length}
        />
      ))}
      {model.trickCards.map((item) => (
        <group key={item.key}>
          <CardMesh
            item={{
              ...item,
              position: "top"
            }}
            geometry={model.geometry}
            mode="flat"
          />
        </group>
      ))}
      {model.southCards.map((item, index, list) => (
        <CardMesh
          key={item.key}
          item={item}
          geometry={model.geometry}
          mode="hand"
          orderIndex={index}
          orderCount={list.length}
        />
      ))}

      <ContactShadows
        position={[0, 0.02, 0]}
        opacity={0.34}
        scale={15}
        blur={2.6}
        far={8.8}
        resolution={1024}
        color="#000000"
      />

    </>
  );
}

function FallbackSurface() {
  return (
    <div className="alternate-three-surface" aria-hidden="true">
      <div className="alternate-three-surface__room" />
      <div className="alternate-three-surface__vignette" />
    </div>
  );
}

export function AlternateTableThreeSurface(
  props: AlternateTableThreeSurfaceProps
) {
  if (!supportsThreeCanvas()) {
    return <FallbackSurface />;
  }

  return (
    <div className="alternate-three-surface" aria-hidden="true">
      <Canvas
        shadows
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.75]}
        camera={{
          position: [props.model.cameraYaw * 0.72, 3.45, 8.1],
          fov: 34,
          near: 0.1,
          far: 40
        }}
      >
        <TableScene model={props.model} />
      </Canvas>
    </div>
  );
}
