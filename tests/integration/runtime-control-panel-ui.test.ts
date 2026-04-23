import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
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

    expect(html).toContain("Array.isArray(entry.options)");
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

  it("renders option-backed config entries as dropdowns even from stale string metadata", async () => {
    const status = {
      checked_at: new Date().toISOString(),
      admin_safety: { locked: false, blocked_actions: [] },
      backend: {
        running: true,
        pid: 123,
        uptime_seconds: 4,
        port_listeners: [123],
        pid_file: "backend.pid",
        log_file: "backend.log",
        runtime_dir: ".runtime"
      },
      endpoints: {
        health: { ok: true, label: "HTTP 200", detail: "OK" },
        decision: { ok: true, label: "HTTP 400", detail: "Bad Request" }
      },
      postgres: {
        container_running: true,
        ready: true,
        detail: "accepting connections"
      },
      git: {
        branch: "main",
        local_commit: "local",
        remote_commit: "remote",
        ahead: 0,
        behind: 0,
        dirty: true
      },
      tools: {
        node: { ok: true, label: "v20", detail: "node" }
      },
      runtime: {
        backend_public_url: "http://192.168.50.196:4310",
        backend_local_url: "http://127.0.0.1:4310",
        detected_ethernet: "192.168.50.196",
        detected_wireless: null,
        detected_default: "192.168.50.196",
        backend_host_ip_override: null,
        config_pending_restart: true,
        python_venv_exists: true,
        node_modules_exists: true,
        lightgbm_model_exists: false
      },
      recent_logs: { backend: [], actions: [] }
    };
    const config = {
      entries: [
        {
          key: "TELEMETRY_MODE",
          label: "Telemetry mode",
          category: "Admin",
          type: "string",
          input: "text",
          options: ["minimal", "full"],
          savedValue: "",
          effectiveValue: "minimal",
          value: "",
          overrideEnabled: true,
          overrideValue: "",
          description: "Default simulator telemetry mode.",
          requiresRestart: true
        },
        {
          key: "SIM_PROVIDER",
          label: "Provider",
          category: "Simulator",
          type: "string",
          input: "text",
          options: ["local", "server_heuristic", "lightgbm_model"],
          savedValue: "server_heuristic",
          effectiveValue: "server_heuristic",
          value: "server_heuristic",
          overrideEnabled: true,
          overrideValue: "server_heuristic",
          description: "Default simulator provider.",
          requiresRestart: true
        },
        {
          key: "SIM_WORKER_COUNT",
          label: "Worker count",
          category: "Simulator",
          type: "number",
          input: "number",
          savedValue: "3",
          effectiveValue: "3",
          value: "3",
          overrideEnabled: true,
          overrideValue: "",
          description: "Default simulator worker count.",
          requiresRestart: true
        },
        {
          key: "ENABLE_ADMIN_SIM_CONTROL",
          label: "Simulator admin APIs",
          category: "Admin",
          type: "boolean",
          input: "boolean",
          savedValue: "true",
          effectiveValue: "true",
          value: "true",
          overrideEnabled: true,
          overrideValue: "",
          description: "Enable simulator admin APIs.",
          requiresRestart: true
        }
      ],
      pending_restart: true,
      runtime_differs_from_disk_config: true
    };

    const dom = new JSDOM(renderRuntimeControlPanel(), {
      runScripts: "dangerously",
      url: "http://localhost:4310/admin/control",
      beforeParse(window) {
        window.fetch = (async (input: string | URL | Request) => {
          const url = String(input);
          const payload = url.endsWith("/api/admin/runtime/status")
            ? status
            : url.endsWith("/api/admin/runtime/config")
              ? config
              : {};
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }) as typeof window.fetch;
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    const document = dom.window.document;
    const telemetryMode = document.querySelector<HTMLSelectElement>(
      'select[data-key="TELEMETRY_MODE"][data-field="savedValue"]'
    );
    const provider = document.querySelector<HTMLSelectElement>(
      'select[data-key="SIM_PROVIDER"][data-field="savedValue"]'
    );
    const workerCount = document.querySelector<HTMLInputElement>(
      'input[data-key="SIM_WORKER_COUNT"][type="number"]'
    );
    const simControl = document.querySelector<HTMLSelectElement>(
      'select[data-key="ENABLE_ADMIN_SIM_CONTROL"][data-field="savedValue"]'
    );

    expect(telemetryMode).not.toBeNull();
    expect(telemetryMode?.value).toBe("minimal");
    expect(provider).not.toBeNull();
    expect(provider?.value).toBe("server_heuristic");
    expect(workerCount).not.toBeNull();
    expect(workerCount?.value).toBe("3");
    expect(simControl).not.toBeNull();
    expect(simControl?.value).toBe("true");
    expect(
      document.querySelector('input[data-key="TELEMETRY_MODE"]')
    ).toBeNull();
    expect(document.querySelector("#runtime")?.textContent).toContain(
      "Pending restartYes"
    );
    expect(document.querySelector("#git")?.textContent).toContain("DIRTY");
    expect(document.querySelector("#git")?.textContent).not.toContain("FAIL");

    dom.window.close();
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
