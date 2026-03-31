import type { PropsWithChildren } from "react";
import { FOUNDATION_MILESTONE } from "@tichuml/shared";

export function FoundationPanel({
  title,
  children
}: PropsWithChildren<{ title: string }>) {
  return (
    <section className="foundation-panel">
      <header className="foundation-panel__header">
        <span>{title}</span>
        <small>{FOUNDATION_MILESTONE}</small>
      </header>
      <div>{children}</div>
    </section>
  );
}
