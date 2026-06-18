import type { GameTableViewProps } from "../game-table-views";
import { FreshAltTable } from "../altTableFresh/FreshAltTable";

export function AltTable3DRoute(props: GameTableViewProps) {
  return <FreshAltTable {...props} showDebug={props.uiMode === "debug"} />;
}
