import { describe, expect, it } from "vitest";
import { resolveBrowserBackendBaseUrl } from "../../apps/web/src/backend/settings";

describe("backend settings defaults", () => {
  it("uses the current backend host origin when the dashboard is served on port 4310", () => {
    expect(
      resolveBrowserBackendBaseUrl({
        protocol: "https:",
        host: "192.168.50.196:4310",
        port: "4310",
        origin: "https://192.168.50.196:4310"
      })
    ).toBe("https://192.168.50.196:4310");
  });

  it("keeps Vite dev origins from becoming backend API defaults", () => {
    expect(
      resolveBrowserBackendBaseUrl({
        protocol: "http:",
        host: "localhost:5173",
        port: "5173",
        origin: "http://localhost:5173"
      })
    ).toBeNull();
  });
});
