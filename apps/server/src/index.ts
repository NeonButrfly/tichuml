import { FOUNDATION_MILESTONE, defaultDatabaseUrl } from "@tichuml/shared";

export function createServerManifest() {
  return {
    service: "server",
    milestone: FOUNDATION_MILESTONE,
    databaseUrl: defaultDatabaseUrl
  };
}

