import { useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import { ALT_TABLE_CAMERA_TARGET } from "./sceneConstants";

export function CameraRig() {
  const camera = useThree((state) => state.camera);

  useLayoutEffect(() => {
    camera.lookAt(...ALT_TABLE_CAMERA_TARGET);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}
