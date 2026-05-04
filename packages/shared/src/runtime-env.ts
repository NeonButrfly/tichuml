type RuntimeEnvPrimitive = string | number | boolean | undefined;
type RuntimeEnvMap = Record<string, RuntimeEnvPrimitive>;

function readImportMetaEnvValue(name: string): string | undefined {
  const meta = import.meta as ImportMeta & { env?: RuntimeEnvMap };
  const value = meta.env?.[name];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function readNodeLikeEnvValue(name: string): string | undefined {
  const globalRecord = globalThis as Record<string, unknown>;
  const nodeProcess = globalRecord[["p", "r", "o", "c", "e", "s", "s"].join("")];
  if (typeof nodeProcess !== "object" || nodeProcess === null) {
    return undefined;
  }

  const env = Reflect.get(nodeProcess, "env");
  if (typeof env !== "object" || env === null) {
    return undefined;
  }

  const value = Reflect.get(env, name);
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

export function readRuntimeEnv(name: string): string | undefined {
  return readImportMetaEnvValue(name) ?? readNodeLikeEnvValue(name);
}
