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
      <RoundedBox
        args={[TABLE_W, TABLE_H, TABLE_D]}
        radius={0.12}
        smoothness={12}
        position={[0, 0, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          map={woodTexture}
          color="#5a240b"
          roughness={0.58}
          metalness={0.04}
          emissive="#120603"
          emissiveIntensity={0.12}
        />
      </RoundedBox>

      <mesh position={[0, FELT_Y - 0.03, -FELT_D / 2 - 0.11]} castShadow receiveShadow>
        <boxGeometry args={[FELT_W + 0.72, 0.07, 0.16]} />
        <meshStandardMaterial map={woodTexture} color="#2a0e04" roughness={0.68} metalness={0.03} emissive="#110502" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[0, FELT_Y - 0.03, FELT_D / 2 + 0.11]} castShadow receiveShadow>
        <boxGeometry args={[FELT_W + 0.72, 0.07, 0.16]} />
        <meshStandardMaterial map={woodTexture} color="#2a0e04" roughness={0.68} metalness={0.03} emissive="#110502" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[-FELT_W / 2 - 0.11, FELT_Y - 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.16, 0.07, FELT_D + 0.4]} />
        <meshStandardMaterial map={woodTexture} color="#2a0e04" roughness={0.68} metalness={0.03} emissive="#110502" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[FELT_W / 2 + 0.11, FELT_Y - 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.16, 0.07, FELT_D + 0.4]} />
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
          color="#2c6a35"
          roughness={0.96}
          metalness={0}
          emissive="#07150a"
          emissiveIntensity={0.12}
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
        <boxGeometry args={[FELT_W - 0.35, 0.012, 0.018]} />
        <meshStandardMaterial color="#c58b2c" roughness={0.36} metalness={0.72} />
      </mesh>
      <mesh position={[0, FELT_Y + 0.009, FELT_D / 2 - 0.18]} receiveShadow>
        <boxGeometry args={[FELT_W - 0.35, 0.012, 0.018]} />
        <meshStandardMaterial color="#c58b2c" roughness={0.36} metalness={0.72} />
      </mesh>
      <mesh position={[-FELT_W / 2 + 0.18, FELT_Y + 0.009, 0]} receiveShadow>
        <boxGeometry args={[0.018, 0.012, FELT_D - 0.35]} />
        <meshStandardMaterial color="#c58b2c" roughness={0.36} metalness={0.72} />
      </mesh>
      <mesh position={[FELT_W / 2 - 0.18, FELT_Y + 0.009, 0]} receiveShadow>
        <boxGeometry args={[0.018, 0.012, FELT_D - 0.35]} />
        <meshStandardMaterial color="#c58b2c" roughness={0.36} metalness={0.72} />
      </mesh>

      <ContactShadows position={[0, -0.16, 0]} scale={18} blur={2.4} opacity={0.36} far={10} />
    </group>
  );
}
