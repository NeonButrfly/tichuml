import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSimDashboardControlApiBaseUrl } from "../../apps/web/src/SimControlDashboard";

describe("simulator dashboard routing", () => {
  it("keeps browser admin API base separate from controller backend_url", () => {
    expect(
      resolveSimDashboardControlApiBaseUrl({
        settingsBackendBaseUrl: "http://127.0.0.1:4310",
        sameOriginBackendUrl: "https://192.168.50.196:4310"
      })
    ).toBe("https://192.168.50.196:4310");

    expect(
      resolveSimDashboardControlApiBaseUrl({
        settingsBackendBaseUrl: "http://localhost:4310",
        sameOriginBackendUrl: null
      })
    ).toBe("http://localhost:4310");
  });

  it("does not use the mutable controller Backend URL field for admin API calls", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "apps", "web", "src", "SimControlDashboard.tsx"),
      "utf8"
    );

    expect(source).toContain("controlApiBaseUrl");
    expect(source).toContain("getSimControllerStatus(controlApiBaseUrl)");
    expect(source).toContain("testBackendHealth(controlApiBaseUrl)");
    expect(source).toMatch(/postSimControllerAction\(\s*controlApiBaseUrl/);
    expect(source).toContain("backend_url: form.backendUrl");
    expect(source).not.toMatch(/postSimControllerAction\(\s*form\.backendUrl/);
  });
});
