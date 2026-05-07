#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const FIELD_SEPARATOR = "\u001f";

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const parsed = {
    command: null,
    values: {},
    archiveFiles: []
  };

  if (argv.length === 0) {
    fail("Missing capture-db-core command.");
  }

  parsed.command = argv[0];
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      fail(`Unexpected argument: ${token}`);
    }

    if (token === "--archive-file") {
      const value = argv[index + 1];
      if (!value) {
        fail("Missing value for --archive-file.");
      }
      parsed.archiveFiles.push(value);
      index += 1;
      continue;
    }

    const value = argv[index + 1];
    if (!value) {
      fail(`Missing value for ${token}.`);
    }
    parsed.values[token.slice(2)] = value;
    index += 1;
  }

  return parsed;
}

function requireValue(values, key) {
  const value = values[key];
  if (value === undefined || value === null || value === "") {
    fail(`Missing required value for --${key}.`);
  }
  return value;
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/gu, "\"\"")}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function sanitizeDatabaseUrl(value) {
  if (!value) {
    return "";
  }
  return value.replace(
    /\/\/([^:/@]+):([^@/]+)@/u,
    (_match, user) => `//${user}:***@`
  );
}

function sanitizeEnvValue(key, value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  if (/url/iu.test(key)) {
    return sanitizeDatabaseUrl(String(value));
  }

  if (/password|secret|token|key/iu.test(key)) {
    return "***";
  }

  return String(value);
}

function readDotEnv(envPath) {
  const result = {};
  if (!fs.existsSync(envPath)) {
    return result;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/gu);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
    timeout: options.timeoutMs ?? 20000,
    windowsHide: true
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function runOptionalCommand(command, args, options = {}) {
  try {
    return runCommand(command, args, options);
  } catch (error) {
    return {
      status: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}

function runPsql(databaseUrl, sql, options = {}) {
  const args = [
    databaseUrl,
    "--no-psqlrc",
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-F",
    FIELD_SEPARATOR,
    "-c",
    sql
  ];
  const result = runCommand("psql", args, {
    cwd: options.cwd,
    env: options.env,
    timeoutMs: options.timeoutMs ?? 30000
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `psql exited with code ${result.status}`);
  }

  const stdout = result.stdout.replace(/\r\n/gu, "\n").trimEnd();
  if (!stdout) {
    return [];
  }

  return stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split(FIELD_SEPARATOR));
}

function runOptionalPsql(databaseUrl, sql, warnings, description) {
  try {
    return runPsql(databaseUrl, sql);
  } catch (error) {
    warnings.push(
      `${description} failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

function scalarValue(rows) {
  if (!rows || rows.length === 0 || rows[0].length === 0) {
    return null;
  }
  return rows[0][0] ?? null;
}

function formatTable(headers, rows) {
  if (!rows || rows.length === 0) {
    return "(none)";
  }

  const widths = headers.map((header) => header.length);
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index], String(cell ?? "").length);
    });
  }

  const formatRow = (row) =>
    row
      .map((cell, index) => String(cell ?? "").padEnd(widths[index], " "))
      .join(" | ");

  const divider = widths.map((width) => "-".repeat(width)).join("-+-");
  return [formatRow(headers), divider, ...rows.map((row) => formatRow(row))].join(
    "\n"
  );
}

function pushSection(lines, title, body) {
  lines.push(title);
  lines.push("=".repeat(title.length));
  lines.push(typeof body === "string" ? body : body.join("\n"));
  lines.push("");
}

function selectExistingColumns(columnMap, tableName, preferredColumns) {
  const columns = columnMap.get(tableName) ?? [];
  return preferredColumns.filter((column) => columns.includes(column));
}

function buildOrderColumn(columnMap, tableName, preferredColumns) {
  const columns = columnMap.get(tableName) ?? [];
  return preferredColumns.find((column) => columns.includes(column)) ?? null;
}

function createContext(values) {
  const repoRoot = path.resolve(requireValue(values, "repo-root"));
  const stagingDir = path.resolve(requireValue(values, "staging-dir"));
  const databaseUrl = requireValue(values, "database-url");
  const envPath = path.join(repoRoot, ".env");
  const diskEnv = readDotEnv(envPath);
  const parsedUrl = (() => {
    try {
      return new URL(databaseUrl);
    } catch {
      return null;
    }
  })();

  const databaseName =
    parsedUrl?.pathname?.replace(/^\/+/u, "") ||
    diskEnv.POSTGRES_DB ||
    "unknown";
  const databaseHost = parsedUrl?.hostname || diskEnv.POSTGRES_HOST || "local";

  return {
    repoRoot,
    stagingDir,
    databaseUrl,
    createdUtc: requireValue(values, "created-utc"),
    createdLocal: requireValue(values, "created-local"),
    captureId: requireValue(values, "capture-id"),
    label: values.label ?? "",
    reason: values.reason ?? "",
    notes: values.notes ?? "",
    splitSize: requireValue(values, "split-size"),
    commandLine: requireValue(values, "command-line"),
    scriptVersion: requireValue(values, "script-version"),
    archiveBaseName: requireValue(values, "archive-base-name"),
    archivePath: requireValue(values, "archive-path"),
    warnings: [
      "Active writers can make this snapshot non-quiescent; the dump and diagnostics may reflect slightly different moments in time."
    ],
    diskEnv,
    parsedUrl,
    databaseName,
    databaseHost
  };
}

function getSchemaInfo(context) {
  const tableRows = runPsql(
    context.databaseUrl,
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
  );
  const columnRows = runPsql(
    context.databaseUrl,
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;"
  );

  const tables = tableRows.map((row) => row[0]);
  const columnMap = new Map();
  for (const table of tables) {
    columnMap.set(table, []);
  }
  for (const [tableName, columnName] of columnRows) {
    if (!columnMap.has(tableName)) {
      columnMap.set(tableName, []);
    }
    columnMap.get(tableName).push(columnName);
  }

  return { tables, columnMap };
}

function countTable(context, tableName, schemaInfo) {
  if (!schemaInfo.tables.includes(tableName)) {
    return null;
  }
  const value = scalarValue(
    runPsql(
      context.databaseUrl,
      `SELECT COUNT(*)::text FROM public.${quoteIdentifier(tableName)};`
    )
  );
  return value;
}

function queryDistinctCombined(context, schemaInfo, columnName) {
  const sources = [];
  for (const tableName of ["decisions", "events"]) {
    if ((schemaInfo.columnMap.get(tableName) ?? []).includes(columnName)) {
      sources.push(
        `SELECT ${quoteIdentifier(columnName)}::text AS value FROM public.${quoteIdentifier(
          tableName
        )} WHERE ${quoteIdentifier(columnName)} IS NOT NULL`
      );
    }
  }

  if (sources.length === 0) {
    context.warnings.push(
      `No decisions/events table exposes ${columnName}; skipping combined distinct count.`
    );
    return null;
  }

  const sql = `SELECT COUNT(DISTINCT value)::text FROM (${sources.join(
    " UNION ALL "
  )}) AS combined;`;
  return scalarValue(runPsql(context.databaseUrl, sql));
}

function queryLatestMatches(context, schemaInfo) {
  if (!schemaInfo.tables.includes("matches")) {
    context.warnings.push("matches table is missing; latest matches section skipped.");
    return [];
  }

  const selected = selectExistingColumns(schemaInfo.columnMap, "matches", [
    "id",
    "game_id",
    "status",
    "requested_provider",
    "provider",
    "provider_used",
    "created_at",
    "updated_at",
    "completed_at"
  ]);

  if (selected.length === 0) {
    context.warnings.push("matches table has no expected reporting columns.");
    return [];
  }

  const orderColumn =
    buildOrderColumn(schemaInfo.columnMap, "matches", [
      "updated_at",
      "completed_at",
      "created_at",
      "id"
    ]) ?? selected[0];

  const sql = `SELECT ${selected
    .map((column) => `COALESCE(${quoteIdentifier(column)}::text, '')`)
    .join(", ")} FROM public."matches" ORDER BY ${quoteIdentifier(
    orderColumn
  )} DESC NULLS LAST LIMIT 20;`;
  return {
    headers: selected,
    rows: runPsql(context.databaseUrl, sql)
  };
}

function queryGroupedCounts(context, tableName, columnName, title, schemaInfo) {
  if (
    !schemaInfo.tables.includes(tableName) ||
    !(schemaInfo.columnMap.get(tableName) ?? []).includes(columnName)
  ) {
    context.warnings.push(
      `${tableName}.${columnName} is missing; skipping ${title.toLowerCase()}.`
    );
    return null;
  }

  const sql = `SELECT COALESCE(${quoteIdentifier(
    columnName
  )}::text, '<null>') AS value, COUNT(*)::text AS row_count FROM public.${quoteIdentifier(
    tableName
  )} GROUP BY 1 ORDER BY COUNT(*) DESC, 1 ASC LIMIT 50;`;
  return {
    title,
    headers: [columnName, "count"],
    rows: runPsql(context.databaseUrl, sql)
  };
}

function queryColumnRanges(context, schemaInfo) {
  const rows = [];
  for (const tableName of ["matches", "hands", "decisions", "events"]) {
    if (!schemaInfo.tables.includes(tableName)) {
      continue;
    }
    for (const columnName of ["ts", "created_at", "updated_at", "completed_at"]) {
      if (!(schemaInfo.columnMap.get(tableName) ?? []).includes(columnName)) {
        continue;
      }
      const sql = `SELECT COALESCE(MIN(${quoteIdentifier(
        columnName
      )})::text, ''), COALESCE(MAX(${quoteIdentifier(
        columnName
      )})::text, '') FROM public.${quoteIdentifier(tableName)};`;
      const range = runPsql(context.databaseUrl, sql)[0] ?? ["", ""];
      rows.push([tableName, columnName, range[0] || "<null>", range[1] || "<null>"]);
    }
  }
  return rows;
}

function queryLatestGames(context, schemaInfo) {
  const sources = [];
  const decisionTime = buildOrderColumn(schemaInfo.columnMap, "decisions", [
    "created_at",
    "ts",
    "updated_at"
  ]);
  const eventTime = buildOrderColumn(schemaInfo.columnMap, "events", [
    "ts",
    "created_at",
    "updated_at"
  ]);

  if (
    schemaInfo.tables.includes("decisions") &&
    (schemaInfo.columnMap.get("decisions") ?? []).includes("game_id") &&
    decisionTime
  ) {
    sources.push(
      `SELECT game_id::text AS game_id, ${quoteIdentifier(
        decisionTime
      )} AS observed_at, 'decisions'::text AS source FROM public."decisions" WHERE game_id IS NOT NULL AND ${quoteIdentifier(
        decisionTime
      )} IS NOT NULL`
    );
  }

  if (
    schemaInfo.tables.includes("events") &&
    (schemaInfo.columnMap.get("events") ?? []).includes("game_id") &&
    eventTime
  ) {
    sources.push(
      `SELECT game_id::text AS game_id, ${quoteIdentifier(
        eventTime
      )} AS observed_at, 'events'::text AS source FROM public."events" WHERE game_id IS NOT NULL AND ${quoteIdentifier(
        eventTime
      )} IS NOT NULL`
    );
  }

  if (sources.length === 0) {
    context.warnings.push(
      "No decisions/events game timestamp source exists; latest games section skipped."
    );
    return [];
  }

  const sql = `SELECT game_id, MAX(observed_at)::text AS latest_seen, COUNT(*) FILTER (WHERE source = 'decisions')::text AS decision_rows, COUNT(*) FILTER (WHERE source = 'events')::text AS event_rows FROM (${sources.join(
    " UNION ALL "
  )}) AS combined GROUP BY game_id ORDER BY MAX(observed_at) DESC NULLS LAST LIMIT 20;`;
  return runPsql(context.databaseUrl, sql);
}

function queryLifecycleAnomalies(context, schemaInfo) {
  const sections = [];

  if (
    schemaInfo.tables.includes("matches") &&
    (schemaInfo.columnMap.get("matches") ?? []).includes("updated_at") &&
    (schemaInfo.columnMap.get("matches") ?? []).includes("completed_at")
  ) {
    const sql = `SELECT COALESCE(id::text, ''), COALESCE(game_id::text, ''), COALESCE(updated_at::text, ''), COALESCE(completed_at::text, '') FROM public."matches" WHERE completed_at IS NOT NULL AND updated_at IS NOT NULL AND updated_at > completed_at ORDER BY updated_at DESC NULLS LAST LIMIT 20;`;
    sections.push({
      title: "Completed matches updated after completed_at",
      headers: ["id", "game_id", "updated_at", "completed_at"],
      rows: runPsql(context.databaseUrl, sql)
    });
  } else {
    context.warnings.push(
      "matches.updated_at/completed_at missing; cannot report post-completion updates."
    );
  }

  const matchColumns = schemaInfo.columnMap.get("matches") ?? [];
  const decisionTime = buildOrderColumn(schemaInfo.columnMap, "decisions", [
    "created_at",
    "ts",
    "updated_at"
  ]);
  const eventTime = buildOrderColumn(schemaInfo.columnMap, "events", [
    "ts",
    "created_at",
    "updated_at"
  ]);

  if (
    schemaInfo.tables.includes("matches") &&
    matchColumns.includes("game_id") &&
    matchColumns.includes("completed_at") &&
    ((schemaInfo.tables.includes("decisions") &&
      (schemaInfo.columnMap.get("decisions") ?? []).includes("game_id") &&
      decisionTime) ||
      (schemaInfo.tables.includes("events") &&
        (schemaInfo.columnMap.get("events") ?? []).includes("game_id") &&
        eventTime))
  ) {
    const sources = [];
    if (
      schemaInfo.tables.includes("decisions") &&
      (schemaInfo.columnMap.get("decisions") ?? []).includes("game_id") &&
      decisionTime
    ) {
      sources.push(
        `SELECT game_id::text AS game_id, ${quoteIdentifier(
          decisionTime
        )} AS observed_at FROM public."decisions" WHERE game_id IS NOT NULL AND ${quoteIdentifier(
          decisionTime
        )} IS NOT NULL`
      );
    }
    if (
      schemaInfo.tables.includes("events") &&
      (schemaInfo.columnMap.get("events") ?? []).includes("game_id") &&
      eventTime
    ) {
      sources.push(
        `SELECT game_id::text AS game_id, ${quoteIdentifier(
          eventTime
        )} AS observed_at FROM public."events" WHERE game_id IS NOT NULL AND ${quoteIdentifier(
          eventTime
        )} IS NOT NULL`
      );
    }

    const sql = `WITH latest_activity AS (SELECT game_id, MAX(observed_at) AS latest_observed_at FROM (${sources.join(
      " UNION ALL "
    )}) AS unioned GROUP BY game_id) SELECT COALESCE(m.id::text, ''), COALESCE(m.game_id::text, ''), COALESCE(m.completed_at::text, ''), COALESCE(a.latest_observed_at::text, '') FROM public."matches" AS m JOIN latest_activity AS a ON a.game_id = m.game_id::text WHERE m.completed_at IS NOT NULL AND a.latest_observed_at > m.completed_at ORDER BY a.latest_observed_at DESC NULLS LAST LIMIT 20;`;
    sections.push({
      title: "Completed matches whose activity continued after completed_at",
      headers: ["id", "game_id", "completed_at", "latest_activity"],
      rows: runPsql(context.databaseUrl, sql)
    });
  } else {
    context.warnings.push(
      "Cannot compare completed_at against related decision/event activity for matches."
    );
  }

  if (
    schemaInfo.tables.includes("matches") &&
    matchColumns.includes("created_at") &&
    (matchColumns.includes("completed_at") || matchColumns.includes("status"))
  ) {
    const statusFilter = matchColumns.includes("status")
      ? "AND COALESCE(status::text, '') NOT IN ('completed', 'complete', 'done')"
      : "";
    const completedFilter = matchColumns.includes("completed_at")
      ? "AND completed_at IS NULL"
      : "";
    const sql = `SELECT COALESCE(id::text, ''), COALESCE(game_id::text, ''), COALESCE(status::text, ''), COALESCE(created_at::text, ''), COALESCE(updated_at::text, '') FROM public."matches" WHERE created_at < NOW() - INTERVAL '30 minutes' ${completedFilter} ${statusFilter} ORDER BY created_at ASC NULLS LAST LIMIT 20;`;
    sections.push({
      title: "Running matches older than 30 minutes",
      headers: ["id", "game_id", "status", "created_at", "updated_at"],
      rows: runPsql(context.databaseUrl, sql)
    });
  } else {
    context.warnings.push(
      "Cannot evaluate long-running matches because created_at/completion columns are missing."
    );
  }

  const mixedProviderSources = [];
  for (const tableName of ["decisions", "events"]) {
    const columns = schemaInfo.columnMap.get(tableName) ?? [];
    if (!schemaInfo.tables.includes(tableName) || !columns.includes("game_id")) {
      continue;
    }
    for (const providerColumn of ["provider", "requested_provider", "provider_used"]) {
      if (columns.includes(providerColumn)) {
        mixedProviderSources.push(
          `SELECT game_id::text AS game_id, ${sqlLiteral(
            `${tableName}.${providerColumn}`
          )} AS provider_source, COALESCE(${quoteIdentifier(
            providerColumn
          )}::text, '<null>') AS provider_value FROM public.${quoteIdentifier(
            tableName
          )} WHERE game_id IS NOT NULL`
        );
      }
    }
  }

  if (mixedProviderSources.length > 0) {
    const sql = `WITH provider_values AS (${mixedProviderSources.join(
      " UNION ALL "
    )}) SELECT game_id, COUNT(DISTINCT provider_value)::text AS distinct_values, STRING_AGG(DISTINCT provider_source || '=' || provider_value, ', ' ORDER BY provider_source || '=' || provider_value) AS details FROM provider_values GROUP BY game_id HAVING COUNT(DISTINCT provider_value) > 1 ORDER BY COUNT(DISTINCT provider_value) DESC, game_id ASC LIMIT 20;`;
    sections.push({
      title: "Matches with mixed provider/requested_provider values",
      headers: ["game_id", "distinct_values", "details"],
      rows: runPsql(context.databaseUrl, sql)
    });
  } else {
    context.warnings.push(
      "No provider/requested_provider columns were found on decisions/events for mixed-provider analysis."
    );
  }

  return sections;
}

function queryWriteAmplification(context) {
  const sql = `SELECT relname, COALESCE(n_live_tup::text, '0'), COALESCE(n_tup_ins::text, '0'), COALESCE(n_tup_upd::text, '0'), COALESCE(n_tup_del::text, '0'), COALESCE(ROUND((n_tup_upd::numeric / NULLIF(n_tup_ins, 0)), 2)::text, '<na>') AS updates_per_insert FROM pg_stat_user_tables WHERE schemaname = 'public' AND relname IN ('matches', 'hands', 'decisions', 'events', 'schema_migrations') ORDER BY relname ASC;`;
  return runOptionalPsql(
    context.databaseUrl,
    sql,
    context.warnings,
    "write amplification summary"
  );
}

function tableHasColumns(schemaInfo, tableName, columns) {
  const available = schemaInfo.columnMap.get(tableName) ?? [];
  return columns.every((column) => available.includes(column));
}

function queryCountWhere(context, tableName, expression) {
  return scalarValue(
    runOptionalPsql(
      context.databaseUrl,
      `SELECT COUNT(*)::text FROM public.${quoteIdentifier(tableName)} WHERE ${expression};`,
      context.warnings,
      `${tableName} count query`
    )
  );
}

function formatCoverage(numerator, denominator) {
  const num = Number(numerator);
  const den = Number(denominator);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) {
    return "<na>";
  }
  return `${((num / den) * 100).toFixed(2)}%`;
}

function writeMlExportStatusReport(context, schemaInfo) {
  const lines = [
    "TichuML ML/export status",
    "========================",
    `Created UTC: ${context.createdUtc}`,
    `Created local: ${context.createdLocal}`,
    ""
  ];

  if (!schemaInfo.tables.includes("decisions")) {
    context.warnings.push("decisions table is missing; ml-export-status.txt is limited.");
    pushSection(lines, "Warnings", ["- decisions table is missing."]);
    fs.writeFileSync(path.join(context.stagingDir, "ml-export-status.txt"), lines.join("\n"), "utf8");
    return;
  }

  const totalDecisions = countTable(context, "decisions", schemaInfo) ?? "0";
  const summaryRows = [["total_decisions", totalDecisions]];
  if ((schemaInfo.columnMap.get("decisions") ?? []).includes("state_norm")) {
    const present = queryCountWhere(context, "decisions", "state_norm IS NOT NULL") ?? "0";
    summaryRows.push(["state_norm_present", present]);
    summaryRows.push(["state_norm_coverage", formatCoverage(present, totalDecisions)]);
  }
  if ((schemaInfo.columnMap.get("decisions") ?? []).includes("has_candidate_scores")) {
    const present =
      queryCountWhere(context, "decisions", "COALESCE(has_candidate_scores, FALSE)") ?? "0";
    summaryRows.push(["has_candidate_scores", present]);
    summaryRows.push(["candidate_scores_coverage", formatCoverage(present, totalDecisions)]);
  }
  if ((schemaInfo.columnMap.get("decisions") ?? []).includes("fallback_used")) {
    summaryRows.push([
      "fallback_used_true",
      queryCountWhere(context, "decisions", "COALESCE(fallback_used, FALSE)") ?? "0"
    ]);
  }
  if ((schemaInfo.columnMap.get("decisions") ?? []).includes("chosen_action_is_legal")) {
    const legal =
      queryCountWhere(
        context,
        "decisions",
        "COALESCE(chosen_action_is_legal, TRUE)"
      ) ?? "0";
    const illegal =
      queryCountWhere(
        context,
        "decisions",
        "NOT COALESCE(chosen_action_is_legal, TRUE)"
      ) ?? "0";
    summaryRows.push(["chosen_action_is_legal_true", legal]);
    summaryRows.push(["chosen_action_is_legal_false", illegal]);
  }
  if ((schemaInfo.columnMap.get("decisions") ?? []).includes("outcome_reward")) {
    const attributed =
      queryCountWhere(context, "decisions", "outcome_reward IS NOT NULL") ?? "0";
    summaryRows.push(["outcome_reward_present", attributed]);
    summaryRows.push(["outcome_reward_coverage", formatCoverage(attributed, totalDecisions)]);
  }
  if ((schemaInfo.columnMap.get("decisions") ?? []).includes("outcome_components")) {
    const attributed =
      queryCountWhere(context, "decisions", "outcome_components IS NOT NULL") ?? "0";
    summaryRows.push(["outcome_components_present", attributed]);
    summaryRows.push([
      "outcome_components_coverage",
      formatCoverage(attributed, totalDecisions)
    ]);
  }
  if ((schemaInfo.columnMap.get("decisions") ?? []).includes("outcome_version")) {
    summaryRows.push([
      "outcome_version_present",
      queryCountWhere(
        context,
        "decisions",
        "outcome_version IS NOT NULL AND outcome_version <> ''"
      ) ?? "0"
    ]);
  }
  pushSection(
    lines,
    "Decision export readiness summary",
    formatTable(["metric", "value"], summaryRows)
  );

  if (
    tableHasColumns(schemaInfo, "decisions", [
      "state_norm",
      "chosen_action_is_legal",
      "outcome_reward"
    ])
  ) {
    const acceptanceRows =
      runOptionalPsql(
        context.databaseUrl,
        `SELECT
          COUNT(*) FILTER (WHERE state_norm IS NOT NULL AND COALESCE(chosen_action_is_legal, TRUE) AND outcome_reward IS NOT NULL)::text,
          COUNT(*) FILTER (WHERE state_norm IS NULL)::text,
          COUNT(*) FILTER (WHERE NOT COALESCE(chosen_action_is_legal, TRUE))::text,
          COUNT(*) FILTER (WHERE outcome_reward IS NULL)::text
        FROM public."decisions";`,
        context.warnings,
        "estimated export acceptance query"
      ) ?? [];
    pushSection(
      lines,
      "Estimated ml:export acceptance and rejection counts",
      formatTable(
        ["accepted_minimum_fields", "missing_state_norm", "illegal_choice", "missing_outcome_reward"],
        acceptanceRows
      )
    );
  } else {
    context.warnings.push(
      "decisions state_norm/chosen_action_is_legal/outcome_reward coverage is incomplete; estimated export acceptance counts skipped."
    );
  }

  const replayRows = [];
  if (
    tableHasColumns(schemaInfo, "matches", ["game_id"]) &&
    tableHasColumns(schemaInfo, "decisions", ["game_id"])
  ) {
    replayRows.push([
      "decisions_without_matching_match",
      scalarValue(
        runOptionalPsql(
          context.databaseUrl,
          `SELECT COUNT(*)::text FROM public."decisions" AS d LEFT JOIN public."matches" AS m ON m.game_id::text = d.game_id::text WHERE m.game_id IS NULL;`,
          context.warnings,
          "decisions without matching match query"
        )
      ) ?? "0"
    ]);
  }
  if (
    tableHasColumns(schemaInfo, "matches", ["game_id"]) &&
    tableHasColumns(schemaInfo, "events", ["game_id"])
  ) {
    replayRows.push([
      "events_without_matching_match",
      scalarValue(
        runOptionalPsql(
          context.databaseUrl,
          `SELECT COUNT(*)::text FROM public."events" AS e LEFT JOIN public."matches" AS m ON m.game_id::text = e.game_id::text WHERE m.game_id IS NULL;`,
          context.warnings,
          "events without matching match query"
        )
      ) ?? "0"
    ]);
  }
  if (
    tableHasColumns(schemaInfo, "decisions", ["game_id", "hand_id"]) &&
    tableHasColumns(schemaInfo, "events", ["game_id", "hand_id"])
  ) {
    replayRows.push([
      "decision_hand_pairs_without_event_pair",
      scalarValue(
        runOptionalPsql(
          context.databaseUrl,
          `WITH event_pairs AS (SELECT DISTINCT game_id::text AS game_id, hand_id::text AS hand_id FROM public."events")
           SELECT COUNT(*)::text
           FROM (
             SELECT DISTINCT d.game_id::text AS game_id, d.hand_id::text AS hand_id
             FROM public."decisions" AS d
             LEFT JOIN event_pairs AS ep
               ON ep.game_id = d.game_id::text AND ep.hand_id = d.hand_id::text
             WHERE ep.game_id IS NULL
           ) AS unmatched;`,
          context.warnings,
          "decision/event hand pair consistency query"
        )
      ) ?? "0"
    ]);
  }
  pushSection(
    lines,
    "Replay consistency stats",
    formatTable(["metric", "count"], replayRows)
  );

  const metadataSections = [];
  for (const tableName of ["matches", "decisions", "events"]) {
    if (!tableHasColumns(schemaInfo, tableName, ["metadata"])) {
      continue;
    }
    const rows =
      runOptionalPsql(
        context.databaseUrl,
        `SELECT key_name, COUNT(*)::text
         FROM (
           SELECT 'seed'::text AS key_name FROM public.${quoteIdentifier(tableName)} WHERE metadata ? 'seed'
           UNION ALL
           SELECT 'resolved_run_seed'::text FROM public.${quoteIdentifier(tableName)} WHERE metadata ? 'resolved_run_seed'
           UNION ALL
           SELECT 'rollout_seed'::text FROM public.${quoteIdentifier(tableName)} WHERE metadata ? 'rollout_seed'
           UNION ALL
           SELECT 'entropy_game_id'::text FROM public.${quoteIdentifier(tableName)} WHERE metadata ? 'entropy_game_id'
           UNION ALL
           SELECT 'primary_provider'::text FROM public.${quoteIdentifier(tableName)} WHERE metadata ? 'primary_provider'
           UNION ALL
           SELECT 'local_fallback_used'::text FROM public.${quoteIdentifier(tableName)} WHERE metadata ? 'local_fallback_used'
         ) AS keys
         GROUP BY key_name
         ORDER BY key_name ASC;`,
        context.warnings,
        `${tableName} metadata seed info query`
      ) ?? [];
    if (rows.length > 0) {
      metadataSections.push({
        title: `${tableName} metadata seed info`,
        headers: ["metadata_key", "rows_with_key"],
        rows
      });
    }
  }
  if (metadataSections.length === 0) {
    pushSection(lines, "Entropy seed info", "(no metadata seed keys were found)");
  } else {
    for (const section of metadataSections) {
      pushSection(lines, section.title, formatTable(section.headers, section.rows));
    }
  }

  if (context.warnings.length > 0) {
    pushSection(
      lines,
      "Warnings",
      context.warnings.map((warning) => `- ${warning}`)
    );
  }

  fs.writeFileSync(path.join(context.stagingDir, "ml-export-status.txt"), lines.join("\n"), "utf8");
}

function writeDecisionProviderSummaryReport(context, schemaInfo) {
  const lines = [
    "TichuML decision/provider summary",
    "=================================",
    `Created UTC: ${context.createdUtc}`,
    `Created local: ${context.createdLocal}`,
    ""
  ];

  const sections = [];
  for (const tableName of ["decisions", "events", "matches"]) {
    for (const columnName of ["provider_used", "requested_provider", "provider"]) {
      const grouped = queryGroupedCounts(
        context,
        tableName,
        columnName,
        `${tableName}.${columnName} counts`,
        schemaInfo
      );
      if (grouped) {
        sections.push(grouped);
      }
    }
  }
  for (const tableName of ["decisions", "events", "matches"]) {
    const fallback = queryGroupedCounts(
      context,
      tableName,
      "fallback_used",
      `${tableName}.fallback_used counts`,
      schemaInfo
    );
    if (fallback) {
      sections.push(fallback);
    }
  }
  for (const tableName of ["decisions", "events"]) {
    const legal = queryGroupedCounts(
      context,
      tableName,
      "chosen_action_is_legal",
      `${tableName}.chosen_action_is_legal counts`,
      schemaInfo
    );
    if (legal) {
      sections.push(legal);
    }
  }

  if (
    tableHasColumns(schemaInfo, "decisions", ["phase", "provider_used"])
  ) {
    sections.push({
      title: "decisions phase/provider matrix",
      headers: ["phase", "provider_used", "count"],
      rows:
        runOptionalPsql(
          context.databaseUrl,
          `SELECT COALESCE(phase::text, '<null>'), COALESCE(provider_used::text, '<null>'), COUNT(*)::text
           FROM public."decisions"
           GROUP BY 1, 2
           ORDER BY COUNT(*) DESC, 1 ASC, 2 ASC
           LIMIT 100;`,
          context.warnings,
          "decisions phase/provider matrix query"
        ) ?? []
    });
  }

  const mixedProviderSections = queryLifecycleAnomalies(context, schemaInfo).filter((section) =>
    /mixed provider\/requested_provider/u.test(section.title)
  );
  if (mixedProviderSections.length === 0) {
    pushSection(lines, "Mixed-provider matches", "(analysis unavailable)");
  } else {
    for (const section of mixedProviderSections) {
      pushSection(lines, section.title, formatTable(section.headers, section.rows));
    }
  }

  for (const section of sections) {
    pushSection(lines, section.title, formatTable(section.headers, section.rows));
  }

  fs.writeFileSync(
    path.join(context.stagingDir, "decision-provider-summary.txt"),
    lines.join("\n"),
    "utf8"
  );
}

function buildStatusReport(context, schemaInfo) {
  const lines = [];
  const tableCounts = {};

  lines.push("TichuML database capture status");
  lines.push("============================");
  lines.push(`Created UTC: ${context.createdUtc}`);
  lines.push(`Created local: ${context.createdLocal}`);
  lines.push(`Database URL: ${sanitizeDatabaseUrl(context.databaseUrl)}`);
  lines.push(`Database name: ${context.databaseName}`);
  lines.push(
    "Snapshot note: active writers may make this capture non-quiescent; the dump and diagnostics are still useful for triage."
  );
  lines.push("");

  const countRows = [];
  for (const tableName of [
    "matches",
    "hands",
    "decisions",
    "events",
    "schema_migrations"
  ]) {
    const count = countTable(context, tableName, schemaInfo);
    tableCounts[tableName] = count === null ? null : Number(count);
    countRows.push([tableName, count ?? "<missing>"]);
    if (count === null) {
      context.warnings.push(`${tableName} table is missing.`);
    }
  }
  pushSection(lines, "Table counts", formatTable(["table", "count"], countRows));

  const distinctRows = [
    ["game_id", queryDistinctCombined(context, schemaInfo, "game_id") ?? "<na>"],
    ["hand_id", queryDistinctCombined(context, schemaInfo, "hand_id") ?? "<na>"]
  ];
  pushSection(
    lines,
    "Distinct identifiers from decisions/events",
    formatTable(["column", "distinct_count"], distinctRows)
  );

  const rangeRows = queryColumnRanges(context, schemaInfo);
  pushSection(
    lines,
    "Timestamp ranges",
    formatTable(["table", "column", "min", "max"], rangeRows)
  );

  const latestMatches = queryLatestMatches(context, schemaInfo);
  pushSection(
    lines,
    "Latest 20 matches",
    latestMatches.headers
      ? formatTable(latestMatches.headers, latestMatches.rows)
      : "(matches unavailable)"
  );

  const groupedSections = [];
  for (const tableName of ["decisions", "events", "matches"]) {
    for (const columnName of ["provider", "requested_provider", "provider_used"]) {
      const grouped = queryGroupedCounts(
        context,
        tableName,
        columnName,
        `${tableName}.${columnName} counts`,
        schemaInfo
      );
      if (grouped) {
        groupedSections.push(grouped);
      }
    }
  }
  for (const grouped of groupedSections) {
    pushSection(
      lines,
      grouped.title,
      formatTable(grouped.headers, grouped.rows)
    );
  }

  for (const tableName of ["decisions", "events", "matches"]) {
    const grouped = queryGroupedCounts(
      context,
      tableName,
      "fallback_used",
      `${tableName}.fallback_used counts`,
      schemaInfo
    );
    if (grouped) {
      pushSection(lines, grouped.title, formatTable(grouped.headers, grouped.rows));
    }
  }

  for (const tableName of ["decisions", "events"]) {
    const grouped = queryGroupedCounts(
      context,
      tableName,
      "chosen_action_is_legal",
      `${tableName}.chosen_action_is_legal counts`,
      schemaInfo
    );
    if (grouped) {
      pushSection(lines, grouped.title, formatTable(grouped.headers, grouped.rows));
    }
  }

  const phaseCounts = queryGroupedCounts(
    context,
    "decisions",
    "phase",
    "Decision phase counts",
    schemaInfo
  );
  if (phaseCounts) {
    pushSection(lines, phaseCounts.title, formatTable(phaseCounts.headers, phaseCounts.rows));
  }

  const eventTypeCounts = queryGroupedCounts(
    context,
    "events",
    "event_type",
    "Event type counts",
    schemaInfo
  );
  if (eventTypeCounts) {
    pushSection(
      lines,
      eventTypeCounts.title,
      formatTable(eventTypeCounts.headers, eventTypeCounts.rows)
    );
  }

  const latestGames = queryLatestGames(context, schemaInfo);
  pushSection(
    lines,
    "Latest 20 games by decision/event timestamp",
    formatTable(["game_id", "latest_seen", "decision_rows", "event_rows"], latestGames)
  );

  const anomalySections = queryLifecycleAnomalies(context, schemaInfo);
  for (const section of anomalySections) {
    pushSection(lines, section.title, formatTable(section.headers, section.rows));
  }

  const writeAmplificationRows = queryWriteAmplification(context);
  pushSection(
    lines,
    "Write amplification snapshot (pg_stat_user_tables)",
    formatTable(
      [
        "table",
        "n_live_tup",
        "n_tup_ins",
        "n_tup_upd",
        "n_tup_del",
        "updates_per_insert"
      ],
      writeAmplificationRows ?? []
    )
  );

  const activityRows = runOptionalPsql(
    context.databaseUrl,
    "SELECT state, COUNT(*)::text FROM pg_stat_activity WHERE datname = current_database() GROUP BY state ORDER BY state;",
    context.warnings,
    "pg_stat_activity state summary"
  );
  pushSection(
    lines,
    "pg_stat_activity state summary",
    formatTable(["state", "count"], activityRows ?? [])
  );

  if (context.warnings.length > 0) {
    pushSection(
      lines,
      "Warnings",
      context.warnings.map((warning) => `- ${warning}`)
    );
  }

  return { text: lines.join("\n").trimEnd() + "\n", tableCounts };
}

function writeQueryReport(context, fileName, title, sections) {
  const lines = [
    title,
    "=".repeat(title.length),
    `Created UTC: ${context.createdUtc}`,
    `Created local: ${context.createdLocal}`,
    ""
  ];

  for (const section of sections) {
    pushSection(
      lines,
      section.title,
      formatTable(section.headers, section.rows ?? [])
    );
  }

  fs.writeFileSync(path.join(context.stagingDir, fileName), lines.join("\n"), "utf8");
}

function writeTableSizesReport(context) {
  const databaseSize = scalarValue(
    runOptionalPsql(
      context.databaseUrl,
      "SELECT pg_size_pretty(pg_database_size(current_database())) || ' (' || pg_database_size(current_database())::text || ' bytes)'",
      context.warnings,
      "database size query"
    )
  );

  const perTable = runOptionalPsql(
    context.databaseUrl,
    "SELECT c.relname, pg_size_pretty(pg_total_relation_size(c.oid)), pg_total_relation_size(c.oid)::text, pg_size_pretty(pg_relation_size(c.oid)), pg_relation_size(c.oid)::text, pg_size_pretty(pg_indexes_size(c.oid)), pg_indexes_size(c.oid)::text, pg_size_pretty(COALESCE(pg_total_relation_size(c.reltoastrelid), 0)), COALESCE(pg_total_relation_size(c.reltoastrelid), 0)::text, COALESCE(c.reltuples::bigint, 0)::text FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY pg_total_relation_size(c.oid) DESC;",
    context.warnings,
    "per-table size query"
  );

  const largestIndexes = runOptionalPsql(
    context.databaseUrl,
    "SELECT indexrelid::regclass::text AS index_name, indrelid::regclass::text AS table_name, pg_size_pretty(pg_relation_size(indexrelid)), pg_relation_size(indexrelid)::text FROM pg_index ORDER BY pg_relation_size(indexrelid) DESC LIMIT 25;",
    context.warnings,
    "largest index size query"
  );

  const lines = [
    "TichuML database table sizes",
    "============================",
    `Created UTC: ${context.createdUtc}`,
    `Created local: ${context.createdLocal}`,
    `Database size: ${databaseSize ?? "<unavailable>"}`,
    ""
  ];
  pushSection(
    lines,
    "Per-table sizes",
    formatTable(
      [
        "table",
        "total_size",
        "total_bytes",
        "table_size",
        "table_bytes",
        "index_size",
        "index_bytes",
        "toast_size",
        "toast_bytes",
        "row_estimate"
      ],
      perTable ?? []
    )
  );
  pushSection(
    lines,
    "Largest indexes",
    formatTable(["index_name", "table_name", "size", "size_bytes"], largestIndexes ?? [])
  );
  fs.writeFileSync(
    path.join(context.stagingDir, "db-table-sizes.txt"),
    lines.join("\n"),
    "utf8"
  );
}

function writeStatsReport(context) {
  const sections = [
    {
      title: "pg_stat_user_tables",
      headers: [
        "table",
        "live_tup",
        "dead_tup",
        "inserts",
        "updates",
        "deletes",
        "hot_updates",
        "vacuum_count",
        "autovacuum_count",
        "analyze_count",
        "autoanalyze_count"
      ],
      rows:
        runOptionalPsql(
          context.databaseUrl,
          "SELECT relname, n_live_tup::text, n_dead_tup::text, n_tup_ins::text, n_tup_upd::text, n_tup_del::text, n_tup_hot_upd::text, vacuum_count::text, autovacuum_count::text, analyze_count::text, autoanalyze_count::text FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY (n_tup_ins + n_tup_upd + n_tup_del) DESC, relname ASC;",
          context.warnings,
          "pg_stat_user_tables query"
        ) ?? []
    },
    {
      title: "pg_stat_user_indexes",
      headers: ["table", "index", "idx_scan", "idx_tup_read", "idx_tup_fetch"],
      rows:
        runOptionalPsql(
          context.databaseUrl,
          "SELECT relname, indexrelname, idx_scan::text, idx_tup_read::text, idx_tup_fetch::text FROM pg_stat_user_indexes WHERE schemaname = 'public' ORDER BY idx_scan DESC, relname ASC, indexrelname ASC;",
          context.warnings,
          "pg_stat_user_indexes query"
        ) ?? []
    },
    {
      title: "pg_stat_bgwriter",
      headers: [
        "checkpoints_timed",
        "checkpoints_req",
        "checkpoint_write_time",
        "checkpoint_sync_time",
        "buffers_checkpoint",
        "buffers_clean",
        "maxwritten_clean",
        "buffers_backend",
        "buffers_backend_fsync",
        "buffers_alloc"
      ],
      rows:
        runOptionalPsql(
          context.databaseUrl,
          "SELECT checkpoints_timed::text, checkpoints_req::text, checkpoint_write_time::text, checkpoint_sync_time::text, buffers_checkpoint::text, buffers_clean::text, maxwritten_clean::text, buffers_backend::text, buffers_backend_fsync::text, buffers_alloc::text FROM pg_stat_bgwriter;",
          context.warnings,
          "pg_stat_bgwriter query"
        ) ?? []
    },
    {
      title: "pg_stat_database for current DB",
      headers: [
        "database",
        "numbackends",
        "xact_commit",
        "xact_rollback",
        "blks_read",
        "blks_hit",
        "tup_inserted",
        "tup_updated",
        "tup_deleted",
        "deadlocks",
        "temp_files",
        "temp_bytes"
      ],
      rows:
        runOptionalPsql(
          context.databaseUrl,
          "SELECT datname, numbackends::text, xact_commit::text, xact_rollback::text, blks_read::text, blks_hit::text, tup_inserted::text, tup_updated::text, tup_deleted::text, deadlocks::text, temp_files::text, temp_bytes::text FROM pg_stat_database WHERE datname = current_database();",
          context.warnings,
          "pg_stat_database query"
        ) ?? []
    },
    {
      title: "pg_stat_all_tables for key telemetry tables",
      headers: [
        "table",
        "seq_scan",
        "seq_tup_read",
        "idx_scan",
        "idx_tup_fetch",
        "n_live_tup",
        "n_dead_tup",
        "last_vacuum",
        "last_autovacuum",
        "last_analyze",
        "last_autoanalyze"
      ],
      rows:
        runOptionalPsql(
          context.databaseUrl,
          "SELECT relname, seq_scan::text, seq_tup_read::text, idx_scan::text, idx_tup_fetch::text, n_live_tup::text, n_dead_tup::text, COALESCE(last_vacuum::text, ''), COALESCE(last_autovacuum::text, ''), COALESCE(last_analyze::text, ''), COALESCE(last_autoanalyze::text, '') FROM pg_stat_all_tables WHERE schemaname = 'public' AND relname IN ('matches', 'hands', 'decisions', 'events', 'schema_migrations') ORDER BY relname ASC;",
          context.warnings,
          "pg_stat_all_tables query"
        ) ?? []
    }
  ];

  const walRows = runOptionalPsql(
    context.databaseUrl,
    "SELECT wal_records::text, wal_fpi::text, wal_bytes::text, wal_buffers_full::text, wal_write::text, wal_sync::text, wal_write_time::text, wal_sync_time::text FROM pg_stat_wal;",
    context.warnings,
    "pg_stat_wal query"
  );
  if (walRows) {
    sections.push({
      title: "pg_stat_wal",
      headers: [
        "wal_records",
        "wal_fpi",
        "wal_bytes",
        "wal_buffers_full",
        "wal_write",
        "wal_sync",
        "wal_write_time",
        "wal_sync_time"
      ],
      rows: walRows
    });
  }

  writeQueryReport(context, "db-stats.txt", "TichuML Postgres stats", sections);
}

function writeActivityReport(context) {
  const rows =
    runOptionalPsql(
      context.databaseUrl,
      "SELECT pid::text, COALESCE(usename, ''), COALESCE(application_name, ''), COALESCE(client_addr::text, ''), COALESCE(state, ''), COALESCE(wait_event_type, ''), COALESCE(wait_event, ''), COALESCE(backend_start::text, ''), COALESCE(xact_start::text, ''), COALESCE(query_start::text, ''), COALESCE(AGE(NOW(), COALESCE(query_start, backend_start))::text, ''), LEFT(REGEXP_REPLACE(COALESCE(query, ''), '\\s+', ' ', 'g'), 220) FROM pg_stat_activity WHERE datname = current_database() AND state IN ('active', 'idle in transaction') ORDER BY query_start DESC NULLS LAST, backend_start DESC NULLS LAST;",
      context.warnings,
      "pg_stat_activity detail query"
    ) ?? [];

  writeQueryReport(context, "db-activity.txt", "TichuML pg_stat_activity snapshot", [
    {
      title: "Active and idle-in-transaction sessions",
      headers: [
        "pid",
        "usename",
        "application_name",
        "client_addr",
        "state",
        "wait_event_type",
        "wait_event",
        "backend_start",
        "xact_start",
        "query_start",
        "age",
        "query"
      ],
      rows
    }
  ]);
}

function writeSettingsReport(context) {
  const versionRows =
    runOptionalPsql(
      context.databaseUrl,
      "SELECT version();",
      context.warnings,
      "version() query"
    ) ?? [];

  const settingRows =
    runOptionalPsql(
      context.databaseUrl,
      "SELECT name, setting, COALESCE(unit, '') FROM pg_settings WHERE name IN ('synchronous_commit', 'wal_level', 'max_wal_size', 'checkpoint_timeout', 'shared_buffers', 'work_mem', 'maintenance_work_mem', 'effective_cache_size', 'fsync', 'full_page_writes', 'autovacuum', 'max_connections') ORDER BY name ASC;",
      context.warnings,
      "pg_settings query"
    ) ?? [];

  const lines = [
    "TichuML PostgreSQL settings",
    "===========================",
    `Created UTC: ${context.createdUtc}`,
    `Created local: ${context.createdLocal}`,
    ""
  ];
  pushSection(
    lines,
    "version()",
    versionRows.length > 0 ? versionRows.map((row) => row[0]) : ["<unavailable>"]
  );
  pushSection(
    lines,
    "Selected settings",
    formatTable(["name", "setting", "unit"], settingRows)
  );
  fs.writeFileSync(path.join(context.stagingDir, "db-settings.txt"), lines.join("\n"), "utf8");
}

function writeIndexesReport(context, schemaInfo) {
  const interestingTables = new Set(["matches", "decisions", "events"]);
  for (const tableName of schemaInfo.tables) {
    const columns = schemaInfo.columnMap.get(tableName) ?? [];
    if (columns.includes("game_id") || columns.includes("hand_id")) {
      interestingTables.add(tableName);
    }
  }

  const tableList = Array.from(interestingTables).sort();
  const sql = `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN (${tableList
    .map(sqlLiteral)
    .join(", ")}) ORDER BY tablename ASC, indexname ASC;`;
  const rows = runOptionalPsql(
    context.databaseUrl,
    sql,
    context.warnings,
    "pg_indexes query"
  );

  const lines = [
    "-- TichuML capture-db index definitions",
    `-- Created UTC: ${context.createdUtc}`,
    `-- Created local: ${context.createdLocal}`,
    ""
  ];

  let currentTable = "";
  for (const row of rows ?? []) {
    const [tableName, indexName, indexDefinition] = row;
    if (tableName !== currentTable) {
      currentTable = tableName;
      lines.push(`-- ${tableName}`);
    }
    lines.push(`-- ${indexName}`);
    lines.push(indexDefinition.endsWith(";") ? indexDefinition : `${indexDefinition};`);
    lines.push("");
  }

  if ((rows ?? []).length === 0) {
    lines.push("-- No matching indexes found.");
    lines.push("");
  }

  fs.writeFileSync(path.join(context.stagingDir, "db-indexes.sql"), lines.join("\n"), "utf8");
}

function writeColumnsReport(context) {
  const rows =
    runOptionalPsql(
      context.databaseUrl,
      "SELECT table_name, column_name, data_type, CASE WHEN udt_name <> data_type THEN udt_name ELSE '' END AS udt_name, is_nullable, COALESCE(column_default, '') FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name ASC, ordinal_position ASC;",
      context.warnings,
      "information_schema.columns query"
    ) ?? [];
  writeQueryReport(context, "db-columns.txt", "TichuML public table columns", [
    {
      title: "Columns",
      headers: [
        "table_name",
        "column_name",
        "data_type",
        "udt_name",
        "is_nullable",
        "column_default"
      ],
      rows
    }
  ]);
}

function writeGitStatus(context) {
  const branch = runOptionalCommand(
    "git",
    ["branch", "--show-current"],
    { cwd: context.repoRoot, timeoutMs: 15000 }
  );
  const head = runOptionalCommand("git", ["rev-parse", "HEAD"], {
    cwd: context.repoRoot,
    timeoutMs: 15000
  });
  const status = runOptionalCommand("git", ["status", "--short"], {
    cwd: context.repoRoot,
    timeoutMs: 15000
  });
  const log = runOptionalCommand("git", ["log", "--oneline", "-10"], {
    cwd: context.repoRoot,
    timeoutMs: 15000
  });
  const remote = runOptionalCommand("git", ["ls-remote", "origin", "refs/heads/main"], {
    cwd: context.repoRoot,
    timeoutMs: 20000
  });

  const branchValue = branch.status === 0 ? branch.stdout.trim() : "<unavailable>";
  const headValue = head.status === 0 ? head.stdout.trim() : "<unavailable>";
  const remoteMainValue =
    remote.status === 0 && remote.stdout.trim()
      ? remote.stdout.trim().split(/\s+/u)[0]
      : "<unavailable>";
  const dirty = status.status === 0 && status.stdout.trim().length > 0;
  const localMatchesRemote =
    headValue !== "<unavailable>" &&
    remoteMainValue !== "<unavailable>" &&
    headValue === remoteMainValue
      ? "true"
      : headValue !== "<unavailable>" && remoteMainValue !== "<unavailable>"
        ? "false"
        : "<undetermined>";

  const lines = [
    "TichuML git status",
    "==================",
    `Current branch: ${branchValue}`,
    `HEAD SHA: ${headValue}`,
    `Remote main SHA: ${remoteMainValue}`,
    `LOCAL_HEAD == REMOTE_MAIN: ${localMatchesRemote}`,
    `Dirty: ${dirty ? "true" : "false"}`,
    "",
    "git status --short",
    "------------------",
    status.status === 0 && status.stdout.trim() ? status.stdout.trimEnd() : "(clean)",
    "",
    "Most recent 10 commits",
    "----------------------",
    log.status === 0 && log.stdout.trim() ? log.stdout.trimEnd() : "<unavailable>",
    ""
  ];

  fs.writeFileSync(path.join(context.stagingDir, "git-status.txt"), lines.join("\n"), "utf8");
  return { branch: branchValue, head: headValue, dirty };
}

function writeEnvRedacted(context) {
  const merged = { ...context.diskEnv };
  for (const key of Object.keys(process.env)) {
    if (!(key in merged) || process.env[key]) {
      merged[key] = process.env[key];
    }
  }

  merged.DATABASE_URL = context.databaseUrl;

  const lines = [
    "TichuML redacted environment",
    "============================",
    `Created UTC: ${context.createdUtc}`,
    `Created local: ${context.createdLocal}`,
    ""
  ];

  const explicitKeys = ["DATABASE_URL", "PG_BOOTSTRAP_URL"];
  for (const key of explicitKeys) {
    if (merged[key]) {
      lines.push(`${key}=${sanitizeEnvValue(key, merged[key])}`);
    }
  }

  const postgresKeys = Object.keys(merged)
    .filter((key) => key.startsWith("POSTGRES_"))
    .sort((left, right) => left.localeCompare(right));
  for (const key of postgresKeys) {
    lines.push(`${key}=${sanitizeEnvValue(key, merged[key])}`);
  }

  const backendKeys = Object.keys(merged)
    .filter((key) =>
      [
        "BACKEND_URL",
        "BACKEND_PORT",
        "BACKEND_HOST",
        "SERVER_PORT",
        "PORT"
      ].includes(key)
    )
    .sort((left, right) => left.localeCompare(right));
  for (const key of backendKeys) {
    lines.push(`${key}=${sanitizeEnvValue(key, merged[key])}`);
  }

  lines.push("");
  lines.push(`node_version=${process.version}`);

  const npmVersion = runOptionalCommand("npm", ["--version"], {
    cwd: context.repoRoot,
    timeoutMs: 10000
  });
  lines.push(
    `npm_version=${npmVersion.status === 0 ? npmVersion.stdout.trim() : "<unavailable>"}`
  );
  lines.push(`os_platform=${os.platform()}`);
  lines.push(`os_release=${os.release()}`);
  lines.push(`os_arch=${os.arch()}`);
  lines.push(`hostname=${os.hostname()}`);
  lines.push("");

  fs.writeFileSync(path.join(context.stagingDir, "env-redacted.txt"), lines.join("\n"), "utf8");
}

function writeDockerStatus(context) {
  const lines = [
    "TichuML docker status",
    "=====================",
    `Created UTC: ${context.createdUtc}`,
    `Created local: ${context.createdLocal}`,
    ""
  ];

  const dockerVersion = runOptionalCommand("docker", ["--version"], {
    cwd: context.repoRoot,
    timeoutMs: 10000
  });
  if (dockerVersion.status !== 0) {
    lines.push("Docker unavailable; skipping docker diagnostics.");
    lines.push(dockerVersion.stderr.trim() || dockerVersion.stdout.trim() || "");
    lines.push("");
    fs.writeFileSync(path.join(context.stagingDir, "docker-status.txt"), lines.join("\n"), "utf8");
    return;
  }

  lines.push(dockerVersion.stdout.trim());
  lines.push("");

  const dockerPs = runOptionalCommand("docker", ["ps"], {
    cwd: context.repoRoot,
    timeoutMs: 15000
  });
  lines.push("docker ps");
  lines.push("---------");
  lines.push(dockerPs.stdout.trimEnd() || dockerPs.stderr.trimEnd() || "(no output)");
  lines.push("");

  if (fs.existsSync(path.join(context.repoRoot, "docker-compose.yml"))) {
    const composePs = runOptionalCommand("docker", ["compose", "ps"], {
      cwd: context.repoRoot,
      timeoutMs: 15000
    });
    lines.push("docker compose ps");
    lines.push("-----------------");
    lines.push(composePs.stdout.trimEnd() || composePs.stderr.trimEnd() || "(no output)");
    lines.push("");
  }

  const nameRows = runOptionalCommand(
    "docker",
    ["ps", "--format", "{{.Names}}"],
    { cwd: context.repoRoot, timeoutMs: 10000 }
  );
  const candidateNames = (nameRows.stdout || "")
    .split(/\r?\n/gu)
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && /tichu/iu.test(value));

  lines.push("docker stats --no-stream");
  lines.push("------------------------");
  if (candidateNames.length === 0) {
    lines.push("(no running tichu containers)");
  } else {
    const stats = runOptionalCommand("docker", ["stats", "--no-stream", ...candidateNames], {
      cwd: context.repoRoot,
      timeoutMs: 20000
    });
    lines.push(stats.stdout.trimEnd() || stats.stderr.trimEnd() || "(no output)");
  }
  lines.push("");

  fs.writeFileSync(path.join(context.stagingDir, "docker-status.txt"), lines.join("\n"), "utf8");
}

function writeRunNotes(context) {
  const lines = [
    "TichuML DB capture notes",
    "========================",
    `capture_id=${context.captureId}`,
    `label=${context.label || ""}`,
    `capture_reason=${context.reason || ""}`,
    `notes=${context.notes || ""}`,
    `generated_command_line=${context.commandLine}`,
    `split_size=${context.splitSize}`,
    `script_version=${context.scriptVersion}`,
    `repo_path=${context.repoRoot}`,
    `capture_path=${context.stagingDir}`,
    "snapshot_warning=Active writers may make this capture non-quiescent; compare timestamps across dump and summary files before drawing strict ordering conclusions.",
    ""
  ];
  fs.writeFileSync(path.join(context.stagingDir, "run-notes.txt"), lines.join("\n"), "utf8");
}

function writeRestoreReadme(context) {
  const lines = [
    "# Restore",
    "",
    "Restore into a new database unless you intentionally want to overwrite an existing target.",
    "Use a PostgreSQL client version compatible with the target server.",
    "",
    "```bash",
    "createdb tichu_restore",
    'pg_restore --clean --if-exists --no-owner --dbname "$RESTORE_DATABASE_URL" db.dump',
    "```",
    "",
    "For the local Docker dev database, running pg_restore from the postgres container avoids local client/server version drift.",
    "",
    `Capture created UTC: ${context.createdUtc}`,
    `Capture created local: ${context.createdLocal}`,
    ""
  ];
  fs.writeFileSync(path.join(context.stagingDir, "RESTORE.md"), lines.join("\n"), "utf8");
}

function buildManifest(context, gitMetadata, tableCounts) {
  return {
    capture_id: context.captureId,
    label: context.label || null,
    created_utc: context.createdUtc,
    created_local: context.createdLocal,
    repo_path: context.repoRoot,
    git_branch: gitMetadata.branch,
    git_head: gitMetadata.head,
    dirty: gitMetadata.dirty,
    database_host: context.databaseHost,
    database_name: context.databaseName,
    dump_file: "db.dump",
    archive_files: [],
    split_size: context.splitSize,
    table_counts: tableCounts,
    warnings: context.warnings,
    script_version: context.scriptVersion
  };
}

function writeManifest(context, manifest) {
  fs.writeFileSync(
    path.join(context.stagingDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

function runCollect(values) {
  const context = createContext(values);
  fs.mkdirSync(context.stagingDir, { recursive: true });

  const schemaInfo = getSchemaInfo(context);
  const statusReport = buildStatusReport(context, schemaInfo);
  fs.writeFileSync(path.join(context.stagingDir, "db-status.txt"), statusReport.text, "utf8");

  writeTableSizesReport(context);
  writeStatsReport(context);
  writeActivityReport(context);
  writeSettingsReport(context);
  writeIndexesReport(context, schemaInfo);
  writeColumnsReport(context);
  const gitMetadata = writeGitStatus(context);
  writeEnvRedacted(context);
  writeDockerStatus(context);
  writeMlExportStatusReport(context, schemaInfo);
  writeDecisionProviderSummaryReport(context, schemaInfo);
  writeRunNotes(context);
  writeRestoreReadme(context);
  writeManifest(context, buildManifest(context, gitMetadata, statusReport.tableCounts));
}

function runFinalize(values, archiveFiles) {
  const manifestPath = path.resolve(requireValue(values, "manifest"));
  const splitSize = requireValue(values, "split-size");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.archive_files = archiveFiles;
  manifest.split_size = splitSize;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

try {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === "collect") {
    runCollect(parsed.values);
  } else if (parsed.command === "finalize-manifest") {
    runFinalize(parsed.values, parsed.archiveFiles);
  } else {
    fail(`Unknown capture-db-core command: ${parsed.command}`);
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
}
