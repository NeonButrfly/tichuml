import { ContactShadows, RoundedBox } from "@react-three/drei";
import type { CanvasTexture } from "three";
import {
  FELT_D,
  FELT_W,
  FELT_Y,
  TABLE_D,
  TABLE_H,
  TABLE_W
} from "./sceneConstants";

type Props = {
  woodTexture: CanvasTexture;
  feltTexture: CanvasTexture;
  feltGoldOverlayTexture: CanvasTexture;
};

export function TableMeshes({
  woodTexture,
  feltTexture,
  feltGoldOverlayTexture
}: Props) {
  return (
    <group userData={{ meshRole: "TableRoot" }}>
      <mesh position={[0, -0.24, 0]} castShadow receiveShadow>
        <boxGeometry args={[15, 0.18, 11.2]} />
        <meshStandardMaterial
          map={woodTexture}
          color="#5c2812"
          roughness={0.62}
          metalness={0.02}
          emissive="#160803"
          emissiveIntensity={0.08}
        />
      </mesh>

      <RoundedBox
        args={[TABLE_W, TABLE_H, TABLE_D]}
        radius={0.14}
        smoothness={14}
        position={[0, 0, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          map={woodTexture}
          color="#6a2d12"
          roughness={0.58}
          metalness={0.04}
          emissive="#1a0a04"
          emissiveIntensity={0.14}
        />
      </RoundedBox>

      <mesh position={[0, FELT_Y - 0.02, -FELT_D / 2 - 0.16]} castShadow receiveShadow>
        <boxGeometry args={[FELT_W + 0.9, 0.075, 0.22]} />
        <meshStandardMaterial map={woodTexture} color="#2a0e04" roughness={0.68} metalness={0.03} emissive="#110502" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[0, FELT_Y - 0.02, FELT_D / 2 + 0.16]} castShadow receiveShadow>
        <boxGeometry args={[FELT_W + 0.9, 0.075, 0.22]} />
        <meshStandardMaterial map={woodTexture} color="#2a0e04" roughness={0.68} metalness={0.03} emissive="#110502" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[-FELT_W / 2 - 0.16, FELT_Y - 0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.22, 0.075, FELT_D + 0.58]} />
        <meshStandardMaterial map={woodTexture} color="#2a0e04" roughness={0.68} metalness={0.03} emissive="#110502" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[FELT_W / 2 + 0.16, FELT_Y - 0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.22, 0.075, FELT_D + 0.58]} />
        <meshStandardMaterial map={woodTexture} color="#2a0e04" roughness={0.68} metalness={0.03} emissive="#110502" emissiveIntensity={0.08} />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FELT_Y, 0]}
        userData={{ meshRole: "felt-inset" }}
        receiveShadow
      >
        <planeGeometry args={[FELT_W, FELT_D]} />
        <meshStandardMaterial
          map={feltTexture}
          color="#2f7138"
          roughness={0.96}
          metalness={0}
          emissive="#0b1f10"
          emissiveIntensity={0.2}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_Y + 0.003, 0]}>
        <planeGeometry args={[FELT_W, FELT_D]} />
        <meshStandardMaterial
          map={feltGoldOverlayTexture}
          transparent
          depthWrite={false}
          roughness={0.9}
        />
      </mesh>

      <mesh position={[0, FELT_Y + 0.009, -FELT_D / 2 + 0.18]} receiveShadow>
        <boxGeometry args={[FELT_W - 0.36, 0.012, 0.02]} />
        <meshStandardMaterial color="#c58b2c" roughness={0.36} metalness={0.72} />
      </mesh>
      <mesh position={[0, FELT_Y + 0.009, FELT_D / 2 - 0.18]} receiveShadow>
        <boxGeometry args={[FELT_W - 0.36, 0.012, 0.02]} />
        <meshStandardMaterial color="#c58b2c" roughness={0.36} metalness={0.72} />
      </mesh>
      <mesh position={[-FELT_W / 2 + 0.18, FELT_Y + 0.009, 0]} receiveShadow>
        <boxGeometry args={[0.02, 0.012, FELT_D - 0.36]} />
        <meshStandardMaterial color="#c58b2c" roughness={0.36} metalness={0.72} />
      </mesh>
      <mesh position={[FELT_W / 2 - 0.18, FELT_Y + 0.009, 0]} receiveShadow>
        <boxGeometry args={[0.02, 0.012, FELT_D - 0.36]} />
        <meshStandardMaterial color="#c58b2c" roughness={0.36} metalness={0.72} />
      </mesh>

      <ContactShadows position={[0, -0.18, 0]} scale={20} blur={2.8} opacity={0.32} far={11} />
    </group>
  );
}
