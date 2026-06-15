#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".yml",
  ".yaml",
  ".sh",
  ".ps1",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".js",
  ".jsx"
]);

const SHELL_BUILTINS = new Set([
  ".",
  ":",
  "[",
  "[[",
  "alias",
  "bg",
  "bind",
  "break",
  "builtin",
  "caller",
  "case",
  "cd",
  "command",
  "compgen",
  "complete",
  "continue",
  "declare",
  "dirs",
  "do",
  "done",
  "echo",
  "enable",
  "esac",
  "eval",
  "exec",
  "exit",
  "export",
  "false",
  "fc",
  "fg",
  "fi",
  "for",
  "function",
  "getopts",
  "hash",
  "help",
  "history",
  "if",
  "jobs",
  "kill",
  "let",
  "local",
  "logout",
  "mapfile",
  "popd",
  "printf",
  "pushd",
  "pwd",
  "read",
  "readonly",
  "return",
  "select",
  "set",
  "shift",
  "shopt",
  "source",
  "suspend",
  "test",
  "then",
  "time",
  "times",
  "trap",
  "true",
  "type",
  "typeset",
  "ulimit",
  "umask",
  "unalias",
  "unset",
  "until",
  "wait",
  "while"
]);

const ALLOWLIST = new Set([
  ...SHELL_BUILTINS,
  "7z",
  "7zz",
  "awk",
  "basename",
  "bash",
  "cat",
  "chmod",
  "chown",
  "cp",
  "curl",
  "cygpath",
  "cut",
  "date",
  "dirname",
  "docker",
  "docker-compose",
  "env",
  "find",
  "git",
  "grep",
  "head",
  "id",
  "jq",
  "mkdir",
  "mktemp",
  "mv",
  "node",
  "nohup",
  "npm",
  "pg_dump",
  "pg_isready",
  "pg_restore",
  "pgrep",
  "ps",
  "psql",
  "python",
  "python3",
  "py",
  "powershell",
  "pwsh",
  "realpath",
  "rm",
  "sed",
  "seq",
  "sha256sum",
  "sleep",
  "sort",
  "sudo",
  "tail",
  "tar",
  "tee",
  "timeout",
  "touch",
  "tr",
  "tsc",
  "tsx",
  "uname",
  "uniq",
  "wc",
  "which"
]);

const IGNORED_ROOTS = new Set([
  ".git",
  ".runtime",
  "coverage",
  "diagnostics",
  "dist",
  "node_modules",
  "training-runs"
]);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`Missing value for ${token}`);
    }
    parsed[token.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function walkTextFiles(rootDir) {
  const results = [];
  const queue = [rootDir];
  while (queue.length > 0) {
    const currentDir = queue.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name === "." || entry.name === "..") {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, fullPath).replace(/\\/gu, "/");
      if (entry.isDirectory()) {
        if (IGNORED_ROOTS.has(entry.name)) {
          continue;
        }
        queue.push(fullPath);
        continue;
      }
      if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push({ fullPath, relativePath });
      }
    }
  }
  return results.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractShellFunctionDefs(content) {
  const defs = [];
  const patterns = [
    /^\s*function\s+([A-Za-z_][A-Za-z0-9_-]*)\s*(?:\(\))?\s*\{/gmu,
    /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\(\)\s*\{/gmu
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      defs.push(match[1]);
    }
  }
  return Array.from(new Set(defs)).sort((left, right) => left.localeCompare(right));
}

function extractShellSources(content) {
  const results = [];
  const sourcePattern =
    /^\s*(?:source|\.)\s+(?:"([^"]+)"|'([^']+)'|([^\s#;]+))/gmu;
  let match;
  while ((match = sourcePattern.exec(content)) !== null) {
    results.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return results.filter((value) => value.length > 0);
}

function resolveSourcedPath(repoRoot, fromFile, sourceValue) {
  const baseDir = path.dirname(fromFile);
  const normalizedSource = sourceValue
    .replace(/\$SCRIPT_DIR/gu, baseDir.replace(/\\/gu, "/"))
    .replace(/\$\{SCRIPT_DIR\}/gu, baseDir.replace(/\\/gu, "/"))
    .replace(/\$SCRIPT_REPO_ROOT/gu, repoRoot.replace(/\\/gu, "/"))
    .replace(/\$\{SCRIPT_REPO_ROOT\}/gu, repoRoot.replace(/\\/gu, "/"))
    .replace(/\$REPO_ROOT/gu, repoRoot.replace(/\\/gu, "/"))
    .replace(/\$\{REPO_ROOT\}/gu, repoRoot.replace(/\\/gu, "/"))
    .replace(/\$BACKEND_REPO_ROOT/gu, repoRoot.replace(/\\/gu, "/"))
    .replace(/\$\{BACKEND_REPO_ROOT\}/gu, repoRoot.replace(/\\/gu, "/"))
    .replace(/\$repo_root/gu, repoRoot.replace(/\\/gu, "/"))
    .replace(/\$\{repo_root\}/gu, repoRoot.replace(/\\/gu, "/"))
    .replace(/\$PSScriptRoot/gu, baseDir.replace(/\\/gu, "/"))
    .replace(/\$\{PSScriptRoot\}/gu, baseDir.replace(/\\/gu, "/"));

  const candidate =
    normalizedSource.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(normalizedSource)
      ? normalizedSource
      : path.resolve(baseDir, normalizedSource);
  if (!candidate.startsWith(repoRoot) && !fs.existsSync(candidate)) {
    return null;
  }
  return fs.existsSync(candidate) ? path.resolve(candidate) : null;
}

function extractShellCommandTokens(content) {
  const tokens = [];
  const lines = content.split(/\r?\n/gu);
  const definitionPattern =
    /^\s*(?:function\s+)?[A-Za-z_][A-Za-z0-9_-]*\s*(?:\(\))?\s*\{/u;
  const commandSubstitutionPattern = /\$\(\s*([A-Za-z_][A-Za-z0-9_-]*)\b/gu;
  const hereDocStartPattern = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/gu;
  let hereDocDelimiter = null;
  let insideSingleQuoteBlock = false;
  let insideDoubleQuoteBlock = false;

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    if (hereDocDelimiter !== null) {
      if (trimmed === hereDocDelimiter) {
        hereDocDelimiter = null;
      }
      return;
    }

    if (definitionPattern.test(line)) {
      return;
    }
    if (/^\s*[A-Za-z_][A-Za-z0-9_-]*\s*[+-]?=\(/u.test(line)) {
      return;
    }
    if (/^\s*[A-Za-z0-9_|-]+\)\s*(?:;;)?\s*$/u.test(trimmed)) {
      return;
    }

    let hereDocMatch;
    while ((hereDocMatch = hereDocStartPattern.exec(line)) !== null) {
      hereDocDelimiter = hereDocMatch[2];
    }
    hereDocStartPattern.lastIndex = 0;

    const singleQuoteCount = (line.match(/'/gu) ?? []).length;
    const doubleQuoteCount = (line.match(/"/gu) ?? []).length;
    const startsMultiLineSingle =
      !insideSingleQuoteBlock &&
      singleQuoteCount % 2 === 1 &&
      /\b(?:node|python|python3|jq)\b.*'/u.test(line);
    const startsMultiLineDouble =
      !insideDoubleQuoteBlock &&
      doubleQuoteCount % 2 === 1 &&
      /(?:=\s*"|<<<?\s*")/u.test(line);

    if (insideSingleQuoteBlock || insideDoubleQuoteBlock) {
      if (insideSingleQuoteBlock && singleQuoteCount % 2 === 1) {
        insideSingleQuoteBlock = false;
      }
      if (insideDoubleQuoteBlock && doubleQuoteCount % 2 === 1) {
        insideDoubleQuoteBlock = false;
      }
      return;
    }

    if (startsMultiLineSingle) {
      insideSingleQuoteBlock = true;
    }
    if (startsMultiLineDouble) {
      insideDoubleQuoteBlock = true;
    }

    const workingLine = line.replace(/(['"]).*?\1/gu, " ");
    let commandSubstitutionMatch;
    while ((commandSubstitutionMatch = commandSubstitutionPattern.exec(workingLine)) !== null) {
      tokens.push({
        token: commandSubstitutionMatch[1],
        lineNumber: lineIndex + 1
      });
    }
    commandSubstitutionPattern.lastIndex = 0;

    const segments = workingLine.split(/(?:&&|\|\||;|\||\(|\))/u);
    for (const segment of segments) {
      const candidate = segment.trimStart();
      if (!candidate) {
        continue;
      }
      if (/^[A-Za-z_][A-Za-z0-9_-]*\s*[+-]?=/u.test(candidate)) {
        continue;
      }
      const match = candidate.match(/^!?([A-Za-z_][A-Za-z0-9_-]*)\b/u);
      if (!match) {
        continue;
      }
      const token = match[1];
      const nextChar = candidate.slice(match[0].length).match(/^\s*(.)/u)?.[1] ?? "";
      if (
        nextChar === "=" ||
        nextChar === ")" ||
        SHELL_BUILTINS.has(token) ||
        /^(?:then|do|done|else|elif|fi|in|esac)$/u.test(token)
      ) {
        continue;
      }
      tokens.push({
        token,
        lineNumber: lineIndex + 1
      });
    }
  });

  return tokens;
}

function findCommandOnPath(token) {
  if (ALLOWLIST.has(token)) {
    return true;
  }

  const probe =
    process.platform === "win32" && !token.includes("/")
      ? spawnSync("where.exe", [token], {
          encoding: "utf8",
          stdio: "ignore"
        })
      : spawnSync("sh", ["-lc", `command -v ${token} >/dev/null 2>&1`], {
          encoding: "utf8",
          stdio: "ignore"
        });
  return probe.status === 0;
}

function toRelative(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/gu, "/");
}

function buildShellGraph(repoRoot, shellFiles) {
  const byPath = new Map();
  for (const filePath of shellFiles) {
    const content = readText(filePath);
    byPath.set(filePath, {
      filePath,
      relativePath: toRelative(repoRoot, filePath),
      content,
      defs: extractShellFunctionDefs(content),
      sources: extractShellSources(content)
    });
  }

  for (const node of byPath.values()) {
    node.resolvedSources = node.sources
      .map((sourceValue) => resolveSourcedPath(repoRoot, node.filePath, sourceValue))
      .filter((candidate) => candidate !== null && byPath.has(candidate));
  }

  const memo = new Map();
  const collectAvailableDefs = (filePath, stack = new Set()) => {
    if (memo.has(filePath)) {
      return memo.get(filePath);
    }
    if (stack.has(filePath)) {
      return new Set();
    }
    stack.add(filePath);
    const node = byPath.get(filePath);
    const defs = new Set(node?.defs ?? []);
    for (const sourcePath of node?.resolvedSources ?? []) {
      for (const definition of collectAvailableDefs(sourcePath, stack)) {
        defs.add(definition);
      }
    }
    stack.delete(filePath);
    memo.set(filePath, defs);
    return defs;
  };

  for (const node of byPath.values()) {
    node.availableDefs = collectAvailableDefs(node.filePath);
    node.tokens = extractShellCommandTokens(node.content);
  }

  return byPath;
}

function collectHelperInventory(repoRoot, shellGraph) {
  const inventory = [];
  for (const node of shellGraph.values()) {
    if (!/common|helper/iu.test(path.basename(node.filePath))) {
      continue;
    }
    for (const helperName of node.defs) {
      const usedBy = [];
      for (const consumer of shellGraph.values()) {
        if (consumer.filePath === node.filePath) {
          continue;
        }
        const usesHelper = consumer.tokens.some((token) => token.token === helperName);
        const sourcesHelper = consumer.availableDefs.has(helperName);
        if (usesHelper || sourcesHelper) {
          usedBy.push(consumer.relativePath);
        }
      }
      inventory.push({
        helper_name: helperName,
        defining_file: node.relativePath,
        used_by: Array.from(new Set(usedBy)).sort((left, right) =>
          left.localeCompare(right)
        )
      });
    }
  }

  return inventory.sort((left, right) =>
    left.helper_name.localeCompare(right.helper_name) ||
    left.defining_file.localeCompare(right.defining_file)
  );
}

function checkShellHelperReferences(shellGraph) {
  const failures = [];
  const allDefinedHelpers = new Set();
  for (const node of shellGraph.values()) {
    for (const helperName of node.defs) {
      allDefinedHelpers.add(helperName);
    }
  }

  for (const node of shellGraph.values()) {
    for (const token of node.tokens) {
      const looksLikeHelper =
        token.token === "die" || token.token.includes("_") || token.token.includes("-");
      if (!looksLikeHelper) {
        continue;
      }
      const looksLikeCriticalHelper =
        /^(?:db_|db-|log_|log-|ensure_|ensure-|wait_|wait-|print_|print-|kill_|kill-|load_|load-|require_|require-|common_|common-|build_|build-|verify_|verify-|run_|run-|start_|start-|stop_|stop-|restart_|restart-|update_|update-|write_|write-|assert_|assert-|curl_|curl-|cd_|cd-|git_|git-)/u.test(
          token.token
        ) || token.token === "die";
      if (
        node.availableDefs.has(token.token) ||
        SHELL_BUILTINS.has(token.token) ||
        findCommandOnPath(token.token)
      ) {
        continue;
      }
      if (!allDefinedHelpers.has(token.token) && !looksLikeCriticalHelper) {
        continue;
      }
      failures.push(
        `${node.relativePath}:${token.lineNumber} unresolved command/helper '${token.token}'`
      );
    }
  }
  return failures;
}

function ensureScriptsRootRules(repoRoot) {
  const failures = [];
  const scriptsRoot = path.join(repoRoot, "scripts");
  const topLevelEntries = fs.readdirSync(scriptsRoot, { withFileTypes: true });
  for (const entry of topLevelEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    failures.push(
      `scripts/${entry.name} must not exist because all scripts must live directly in scripts/`
    );
  }

  const scriptFiles = topLevelEntries.filter((entry) => entry.isFile());
  const normalizedNames = new Map();
  for (const file of scriptFiles) {
    const baseName = path.basename(file.name, path.extname(file.name));
    const normalized = baseName.toLowerCase().replace(/[-_]/gu, "");
    if (file.name.includes("_")) {
      failures.push(`Forbidden underscore in scripts/${file.name}`);
    }
    if (/-linux|-windows/iu.test(baseName)) {
      failures.push(`Forbidden platform suffix in scripts/${file.name}`);
    }
    if (!normalizedNames.has(normalized)) {
      normalizedNames.set(normalized, new Set());
    }
    normalizedNames.get(normalized).add(baseName);
  }

  for (const [normalized, names] of normalizedNames.entries()) {
    const distinctNames = Array.from(names);
    if (distinctNames.length > 1) {
      failures.push(
        `Conflicting script name variants for '${normalized}': ${distinctNames.join(", ")}`
      );
    }
  }

  return failures;
}

function checkStaleReferences(repoRoot, textFiles) {
  const failures = [];
  const stalePatterns = [
    { pattern: /scripts[\\/](?:linux|windows)\b/gu, message: "obsolete nested script path" },
    { pattern: /scripts[\\/]lib[\\/]/gu, message: "obsolete nested scripts/lib reference" },
    { pattern: /check-scripts\.(?:sh|ps1)\b/gu, message: "obsolete check-scripts reference" }
  ];

  for (const file of textFiles) {
    const content = readText(file.fullPath);
    for (const { pattern, message } of stalePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        failures.push(`${file.relativePath}: stale reference '${match[0]}' (${message})`);
      }
    }
  }

  return failures;
}

function writeInventoryArtifacts(repoRoot, helperInventory) {
  const artifactDir = path.join(repoRoot, ".runtime", "verify-scripts");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactDir, "helper-inventory.json"),
    `${JSON.stringify(helperInventory, null, 2)}\n`,
    "utf8"
  );

  const lines = ["Helper inventory", "================", ""];
  for (const item of helperInventory) {
    lines.push(`${item.helper_name}`);
    lines.push(`  defining file: ${item.defining_file}`);
    lines.push(
      `  used by: ${item.used_by.length > 0 ? item.used_by.join(", ") : "(none)"}`
    );
    lines.push("");
  }
  fs.writeFileSync(
    path.join(artifactDir, "helper-inventory.txt"),
    `${lines.join("\n")}`,
    "utf8"
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args["repo-root"] ?? process.cwd());
  const scriptsRoot = path.join(repoRoot, "scripts");
  if (!fs.existsSync(scriptsRoot)) {
    throw new Error(`Missing scripts directory at ${scriptsRoot}`);
  }

  const textFiles = walkTextFiles(repoRoot);
  const shellFiles = fs
    .readdirSync(scriptsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sh"))
    .map((entry) => path.join(scriptsRoot, entry.name))
    .sort((left, right) => left.localeCompare(right));

  const shellGraph = buildShellGraph(repoRoot, shellFiles);
  const helperInventory = collectHelperInventory(repoRoot, shellGraph);
  writeInventoryArtifacts(repoRoot, helperInventory);

  const failures = [
    ...ensureScriptsRootRules(repoRoot),
    ...checkShellHelperReferences(shellGraph),
    ...checkStaleReferences(repoRoot, textFiles)
  ];

  const summaryLines = [
    "verify-scripts core report",
    "==========================",
    `Repo root: ${repoRoot}`,
    `Shell scripts scanned: ${shellFiles.length}`,
    `Text files scanned for stale refs: ${textFiles.length}`,
    `Helper inventory entries: ${helperInventory.length}`,
    `Helper inventory JSON: ${path.join(".runtime", "verify-scripts", "helper-inventory.json")}`,
    ""
  ];

  if (helperInventory.length > 0) {
    summaryLines.push("Helper inventory sample");
    summaryLines.push("-----------------------");
    for (const item of helperInventory.slice(0, 10)) {
      summaryLines.push(
        `${item.helper_name} -> ${item.defining_file} -> ${
          item.used_by.length > 0 ? item.used_by.join(", ") : "(none)"
        }`
      );
    }
    summaryLines.push("");
  }

  if (failures.length > 0) {
    summaryLines.push("Failures");
    summaryLines.push("--------");
    for (const failure of failures) {
      summaryLines.push(`- ${failure}`);
    }
    console.error(summaryLines.join("\n"));
    process.exit(1);
  }

  summaryLines.push("No core script-layout, helper-resolution, or stale-reference failures found.");
  console.log(summaryLines.join("\n"));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
