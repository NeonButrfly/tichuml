import { FOUNDATION_MILESTONE, workspaceManifests } from "@tichuml/shared";
import { FoundationPanel } from "@tichuml/ui-kit";

export function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">TichuML</p>
        <h1>Foundation Scaffold</h1>
        <p className="summary">
          Milestone 0 locks in the monorepo, shared tooling, database bootstrap,
          and build pipeline before any engine or UI behavior is introduced.
        </p>
      </section>

      <FoundationPanel title="Workspace readiness">
        <ul className="manifest-list">
          {workspaceManifests.map((manifest) => (
            <li key={manifest.packageName}>
              <strong>{manifest.displayName}</strong>
              <span>{manifest.packageName}</span>
              <span>{manifest.stage}</span>
            </li>
          ))}
        </ul>
      </FoundationPanel>

      <footer className="footer-note">
        Authoritative gameplay starts in the next milestone. Current stage:{" "}
        {FOUNDATION_MILESTONE}.
      </footer>
    </main>
  );
}

