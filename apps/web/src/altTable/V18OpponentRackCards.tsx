import { useMemo } from "react";

import {
  makeOpponentRackAnchors,
  type CardRackAnchor
} from "./v18CardRackMath";

type Props = {
  cardBackSrc: string;
  renderCardPlane: (anchor: CardRackAnchor, src: string) => React.ReactNode;
};

export function V18OpponentRackCards({ cardBackSrc, renderCardPlane }: Props) {
  const anchors = useMemo(() => makeOpponentRackAnchors(), []);

  return <>{anchors.map((anchor) => renderCardPlane(anchor, cardBackSrc))}</>;
}
