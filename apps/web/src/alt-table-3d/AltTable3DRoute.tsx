import type { GameTableViewProps } from "../game-table-views";
import "./alt-table-3d.css";
import { AltTichuTable3D } from "./AltTichuTable3D";

export function AltTable3DRoute(_props: GameTableViewProps) {
  return (
    <main className="alt-table-3d-route">
      <AltTichuTable3D />
    </main>
  );
}
