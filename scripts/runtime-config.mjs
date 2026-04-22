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
  const ethernet = [];
  const wireless = [];
  const fallback = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    const normalizedName = name.toLowerCase();
    if (/^(docker|br-|veth|virbr|vmnet|tun|tap)/u.test(normalizedName)) {
      continue;
    }
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4") continue;
      if (entry.internal) {
        fallback.push(entry.address);
      } else if (/^(eth|en|eno|ens)/u.test(normalizedName)) {
        ethernet.push(entry.address);
      } else if (/^(wlan|wlp|wifi|wi-fi)/u.test(normalizedName)) {
        wireless.push(entry.address);
      } else {
        fallback.push(entry.address);
      }
    }
  }
  return ethernet[0] ?? wireless[0] ?? fallback.find((ip) => ip !== "127.0.0.1") ?? "127.0.0.1";
}

function defaults(values) {
  const port = values.PORT || "4310";
  const hostIp =
    values.BACKEND_HOST_IP_OVERRIDE_ENABLED === "true"
      ? values.BACKEND_HOST_IP_OVERRIDE || values.BACKEND_HOST_IP || detectPrimaryIp()
      : values.BACKEND_HOST_IP || detectPrimaryIp();
  const publicUrl =
    values.BACKEND_PUBLIC_URL_OVERRIDE_ENABLED === "true"
      ? values.BACKEND_PUBLIC_URL_OVERRIDE || values.BACKEND_PUBLIC_URL || `http://${hostIp}:${port}`
      : values.BACKEND_PUBLIC_URL || `http://${hostIp}:${port}`;
  const localUrl =
    values.BACKEND_LOCAL_URL_OVERRIDE_ENABLED === "true"
      ? values.BACKEND_LOCAL_URL_OVERRIDE || values.BACKEND_LOCAL_URL || `http://127.0.0.1:${port}`
      : values.BACKEND_LOCAL_URL || `http://127.0.0.1:${port}`;
  const baseUrl =
    values.BACKEND_BASE_URL_OVERRIDE_ENABLED === "true"
      ? values.BACKEND_BASE_URL_OVERRIDE || values.BACKEND_BASE_URL || publicUrl
      : values.BACKEND_BASE_URL || publicUrl;
  return {
    ...values,
    REPO_URL: "https://github.com/NeonButrfly/tichuml.git",
    GIT_BRANCH: "main",
    AUTO_UPDATE_ON_START: "true",
    PORT: port,
    HOST: "0.0.0.0",
    BACKEND_HOST_IP: hostIp,
    BACKEND_PUBLIC_URL: publicUrl,
    BACKEND_LOCAL_URL: localUrl,
    BACKEND_BASE_URL: baseUrl,
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
