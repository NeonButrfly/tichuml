import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ParsedEnvLine = {
  raw: string;
  key?: string;
  value?: string;
};

export type ParsedEnvFile = {
  values: Record<string, string>;
  lines: ParsedEnvLine[];
};

function parseEnvValue(rawValue: string): string {
  let value = "";
  let mode: "plain" | "single" | "double" = "plain";
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
      if (char === "'") {
        mode = "plain";
      } else {
        value += char;
      }
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      mode = "plain";
    } else {
      value += char;
    }
  }

  return value.trimEnd();
}

export function parseEnvText(text: string): ParsedEnvFile {
  const values: Record<string, string> = {};
  const lines = text.split(/\r?\n/u).map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return { raw };
    }

    const match = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/u);
    if (!match) {
      return { raw };
    }

    const key = match[1] ?? "";
    const value = parseEnvValue(match[2] ?? "");
    values[key] = value;
    return { raw, key, value };
  });
  return { values, lines };
}

export function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return parseEnvText(fs.readFileSync(filePath, "utf8")).values;
}

export function formatEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(value)) {
    return value;
  }
  return `"${value
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, "\\\"")
    .replace(/\$/gu, "\\$")
    .replace(/`/gu, "\\`")}"`;
}

export function writeEnvText(
  parsed: ParsedEnvFile,
  values: Record<string, string>,
  orderedKeys: string[]
): string {
  const written = new Set<string>();
  const lines = parsed.lines.map((entry) => {
    if (!entry.key || !(entry.key in values)) {
      return entry.raw;
    }
    written.add(entry.key);
    return `${entry.key}=${formatEnvValue(values[entry.key] ?? "")}`;
  });

  for (const key of orderedKeys) {
    if (key in values && !written.has(key)) {
      lines.push(`${key}=${formatEnvValue(values[key] ?? "")}`);
      written.add(key);
    }
  }

  for (const key of Object.keys(values).sort()) {
    if (!written.has(key)) {
      lines.push(`${key}=${formatEnvValue(values[key] ?? "")}`);
    }
  }

  return `${lines.join("\n").replace(/\n+$/u, "")}\n`;
}

export function writeFileAtomic(filePath: string, contents: string): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(tempPath, contents, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

export type DetectedIpInfo = {
  primary: string | null;
  addresses: string[];
};

export function detectSystemIps(): DetectedIpInfo {
  const addresses: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  const unique = [...new Set(addresses)];
  return {
    primary: unique[0] ?? null,
    addresses: unique
  };
}
