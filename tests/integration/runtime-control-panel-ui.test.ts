import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyRuntimeGitStatus,
  formatRuntimeYesNo,
  renderRuntimeControlPanel
} from "../../apps/server/src/services/runtime-control-panel";

describe("runtime and simulator control GUI contracts", () => {
  it("maps restart pending and git status without false fail states", () => {
    expect(formatRuntimeYesNo(true)).toBe("Yes");
    expect(formatRuntimeYesNo(false)).toBe("No");
    expect(
      classifyRuntimeGitStatus({ dirty: false, ahead: 0, behind: 0 })
    ).toEqual({
      state: "current",
      label: "CLEAN / CURRENT",
      tone: "ok"
    });
    expect(
      classifyRuntimeGitStatus({ dirty: true, ahead: 0, behind: 0 })
    ).toMatchObject({
      state: "dirty",
      label: "DIRTY",
      tone: "warn"
    });
    expect(
      classifyRuntimeGitStatus({ dirty: false, ahead: 2, behind: 1 })
    ).toMatchObject({
      state: "diverged",
      label: "ahead 2 / behind 1",
      tone: "warn"
    });
    expect(
      classifyRuntimeGitStatus({ dirty: null, ahead: null, behind: null })
    ).toMatchObject({
      state: "unknown",
      label: "UNKNOWN",
      tone: "warn"
    });
  });

  it("renders runtime config enums as selects and avoids duplicate status blocks", () => {
    const html = renderRuntimeControlPanel();

    expect(html).toContain("entry.input === 'select'");
    expect(html).toContain("<select data-key=");
    expect(html).toContain("CLEAN / CURRENT");
    expect(html).toContain("DIRTY");
    expect(html).toContain("UNKNOWN");
    expect(html).toContain("Pending restart");
    expect(html).not.toContain("Restart pending', html");
    expect(html).not.toContain(
      '<button data-action="apply-config-restart">Apply config + restart</button>'
    );
  });

  it("keeps the simulator dashboard provider and telemetry mode as dropdowns", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "apps", "web", "src", "SimControlDashboard.tsx"),
      "utf8"
    );
    const styles = fs.readFileSync(
      path.join(process.cwd(), "apps", "web", "src", "styles.css"),
      "utf8"
    );

    expect(source).toMatch(/Provider\s*<select/su);
    expect(source).toMatch(/Telemetry mode\s*<select/su);
    expect(source).toContain('type="number"');
    expect(source).toContain('type="checkbox"');
    expect(source).not.toContain("getNetworkFallbackBackendUrl");
    expect(styles).toContain(".sim-workers");
    expect(styles).toContain("overflow-x: auto");
    expect(styles).toContain("overflow-wrap: anywhere");
  });
});
