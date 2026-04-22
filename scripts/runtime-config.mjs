#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";

function parseEnvValue(rawValue) {
  let value = "";
  let mode = "plain";
  let escaped = false;

  for (let index = 0; index < rawValue.length; index += 1) {
    const char = rawValue[index] ?? "";

    if (escaped) {
      if (mode === "double") {
        if (char === "n") value += "\n";
        else if (char === "r") value += "\r";
        else if (char === "t") value += "\t";
        else value += char;
      } else {
        value += char;
      }
      escaped = false;
      continue;
    }

    if (mode === "plain") {
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "'") {
        mode = "single";
        continue;
      }
      if (char === "\"") {
        mode = "double";
        continue;
      }
      if (char === "#" && (index === 0 || /\s/u.test(rawValue[index - 1] ?? ""))) {
        break;
      }
      value += char;
      continue;
    }

    if (mode === "single") {
      if (char === "'") mode = "plain";
      else value += char;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") mode = "plain";
    else value += char;
  }

  return value.trimEnd();
}

function parseEnvText(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/u)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/u);
    if (!match) continue;
    values[match[1]] = parseEnvValue(match[2] ?? "");
  }
  return values;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(value)) {
    return value;
  }
  return `'${String(value).replace(/'/gu, "'\\''")}'`;
}

function detectPrimaryIp() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }
  return "127.0.0.1";
}

function defaults(values) {
  const port = values.PORT || "4310";
  const hostIp = values.BACKEND_HOST_IP || detectPrimaryIp();
  return {
    ...values,
    REPO_URL: "https://github.com/NeonButrfly/tichuml.git",
    GIT_BRANCH: "main",
    AUTO_UPDATE_ON_START: "true",
    PORT: port,
    HOST: "0.0.0.0",
    BACKEND_HOST_IP: hostIp,
    BACKEND_PUBLIC_URL: `http://${hostIp}:${port}`,
    BACKEND_LOCAL_URL: `http://127.0.0.1:${port}`,
    POSTGRES_USER: "tichu",
    POSTGRES_DB: "tichu",
    POSTGRES_PORT: "54329",
    ...Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== "")
    )
  };
}

const [command, envFile] = process.argv.slice(2);
if (!command || !envFile) {
  console.error("Usage: runtime-config.mjs export-shell <env-file>");
  process.exit(2);
}

const values = defaults(
  fs.existsSync(envFile) ? parseEnvText(fs.readFileSync(envFile, "utf8")) : {}
);

if (command === "export-shell") {
  for (const [key, value] of Object.entries(values)) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
      console.log(`export ${key}=${shellQuote(value)}`);
    }
  }
} else if (command === "json") {
  console.log(JSON.stringify(values, null, 2));
} else {
  console.error(`Unsupported runtime-config command: ${command}`);
  process.exit(2);
}
