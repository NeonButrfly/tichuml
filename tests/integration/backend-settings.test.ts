import { describe, expect, it } from "vitest";
import {
  resolveBrowserBackendBaseUrl,
  resolveHostedDecisionModeDefault
} from "../../apps/web/src/backend/settings";

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

  it("maps hosted non-loopback browser sessions back to the backend port", () => {
    expect(
      resolveBrowserBackendBaseUrl({
        protocol: "http:",
        host: "192.168.50.36:5174",
        port: "5174",
        origin: "http://192.168.50.36:5174"
      })
    ).toBe("http://192.168.50.36:4310");
  });

  it("defaults hosted non-loopback browser sessions to server-backed decisions", () => {
    expect(
      resolveHostedDecisionModeDefault({
        protocol: "http:",
        host: "192.168.50.36:5174",
        port: "5174",
        origin: "http://192.168.50.36:5174"
      })
    ).toBe("server_heuristic");
  });

  it("keeps localhost dev sessions on local decisions by default", () => {
    expect(
      resolveHostedDecisionModeDefault({
        protocol: "http:",
        host: "localhost:5173",
        port: "5173",
        origin: "http://localhost:5173"
      })
    ).toBeNull();
  });
});
