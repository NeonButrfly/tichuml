import {
  SCHEMA_VERSION,
  type AltTableLayout,
  type CardFanSettings,
  type PassingLaneId,
  PASSING_LANE_IDS
} from "./schema.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function validateVec3(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isObject(value)) {
    errors.push(`${path}: expected object with x, y, z`);
    return errors;
  }
  if (!isNumber(value.x)) errors.push(`${path}.x: expected number`);
  if (!isNumber(value.y)) errors.push(`${path}.y: expected number`);
  if (!isNumber(value.z)) errors.push(`${path}.z: expected number`);
  return errors;
}

function validateScale3(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isObject(value)) {
    errors.push(`${path}: expected object with x, y, z`);
    return errors;
  }
  if (!isNumber(value.x)) errors.push(`${path}.x: expected number`);
  if (!isNumber(value.y)) errors.push(`${path}.y: expected number`);
  if (!isNumber(value.z)) errors.push(`${path}.z: expected number`);
  return errors;
}

function validateHandMaster(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isObject(value)) {
    errors.push(`${path}: expected hand master object`);
    return errors;
  }
  errors.push(...validateVec3(value.position, `${path}.position`));
  errors.push(...validateVec3(value.rotation, `${path}.rotation`));
  errors.push(...validateScale3(value.scale, `${path}.scale`));
  errors.push(...validateVec3(value.pivot, `${path}.pivot`));
  return errors;
}

function validateFanSettings(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isObject(value)) {
    errors.push(`${path}: expected fan settings object`);
    return errors;
  }
  const numberFields: (keyof CardFanSettings)[] = [
    "cardCount", "cardWidth", "cardHeight", "overlap", "spread",
    "arc", "depthStep", "localRotationStep", "startOffset"
  ];
  for (const field of numberFields) {
    if (!isNumber(value[field])) {
      errors.push(`${path}.${field}: expected number`);
    }
  }
  if (value.fanDirection !== 1 && value.fanDirection !== -1) {
    errors.push(`${path}.fanDirection: expected 1 or -1`);
  }
  if (!isBoolean(value.reverseOrder)) {
    errors.push(`${path}.reverseOrder: expected boolean`);
  }
  errors.push(...validateVec3(value.cardLocalRotation, `${path}.cardLocalRotation`));
  errors.push(...validateVec3(value.cardLocalPivot, `${path}.cardLocalPivot`));
  return errors;
}

function validateSideHand(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isObject(value)) {
    errors.push(`${path}: expected side hand object`);
    return errors;
  }
  if (value.id !== "north" && value.id !== "east" && value.id !== "west" && value.id !== "south") {
    errors.push(`${path}.id: expected "north", "east", "west", or "south"`);
  }
  errors.push(...validateHandMaster(value.master, `${path}.master`));
  errors.push(...validateFanSettings(value.fan, `${path}.fan`));
  return errors;
}

function validatePassingLane(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isObject(value)) {
    errors.push(`${path}: expected passing lane object`);
    return errors;
  }
  if (typeof value.id !== "string") {
    errors.push(`${path}.id: expected string`);
  }
  errors.push(...validateVec3(value.position, `${path}.position`));
  errors.push(...validateVec3(value.rotation, `${path}.rotation`));
  errors.push(...validateScale3(value.scale, `${path}.scale`));
  errors.push(...validateVec3(value.arrowOffset, `${path}.arrowOffset`));
  if (!isNumber(value.width)) errors.push(`${path}.width: expected number`);
  if (!isNumber(value.height)) errors.push(`${path}.height: expected number`);
  if (!isNumber(value.arrowRotation)) errors.push(`${path}.arrowRotation: expected number`);
  if (!isNumber(value.arrowScale)) errors.push(`${path}.arrowScale: expected number`);
  if (!isBoolean(value.visible)) errors.push(`${path}.visible: expected boolean`);
  if (!isBoolean(value.locked)) errors.push(`${path}.locked: expected boolean`);
  if (!isNumber(value.borderThickness)) errors.push(`${path}.borderThickness: expected number`);
  if (!isNumber(value.borderOpacity)) errors.push(`${path}.borderOpacity: expected number`);
  if (!isNumber(value.fillOpacity)) errors.push(`${path}.fillOpacity: expected number`);
  return errors;
}

export function validateAltTableLayout(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObject(data)) {
    return { valid: false, errors: ["Layout must be an object"], warnings: [] };
  }

  if (!isNumber(data.schemaVersion)) {
    errors.push("schemaVersion: expected number");
  } else if (data.schemaVersion > SCHEMA_VERSION) {
    errors.push(`schemaVersion ${data.schemaVersion} is newer than supported version ${SCHEMA_VERSION}`);
  } else if (data.schemaVersion < SCHEMA_VERSION) {
    warnings.push(`schemaVersion ${data.schemaVersion} is older than current version ${SCHEMA_VERSION}; some fields may use defaults`);
  }

  if (!isObject(data.coordinateSystem)) {
    errors.push("coordinateSystem: expected object");
  }

  if (!isObject(data.table)) {
    errors.push("table: expected object");
  } else {
    if (!isNumber(data.table.designWidth)) errors.push("table.designWidth: expected number");
    if (!isNumber(data.table.designHeight)) errors.push("table.designHeight: expected number");
    if (!isNumber(data.table.worldWidth)) errors.push("table.worldWidth: expected number");
    if (!isNumber(data.table.worldHeight)) errors.push("table.worldHeight: expected number");
  }

  if (!isObject(data.hands)) {
    errors.push("hands: expected object");
  } else {
    errors.push(...validateSideHand(data.hands.north, "hands.north"));
    errors.push(...validateSideHand(data.hands.east, "hands.east"));
    errors.push(...validateSideHand(data.hands.west, "hands.west"));
    errors.push(...validateSideHand(data.hands.south, "hands.south"));
  }

  if (!isObject(data.passingLanes)) {
    errors.push("passingLanes: expected object");
  } else {
    for (const laneId of PASSING_LANE_IDS) {
      const lane = data.passingLanes[laneId as PassingLaneId];
      if (!lane) {
        errors.push(`passingLanes.${laneId}: missing`);
      } else {
        errors.push(...validatePassingLane(lane, `passingLanes.${laneId}`));
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function safeParseLayout(json: string): { layout: AltTableLayout | null; errors: string[]; warnings: string[] } {
  try {
    const parsed = JSON.parse(json);
    const result = validateAltTableLayout(parsed);
    if (!result.valid) {
      return { layout: null, errors: result.errors, warnings: result.warnings };
    }
    return { layout: parsed as AltTableLayout, errors: [], warnings: result.warnings };
  } catch (error) {
    return { layout: null, errors: [`JSON parse error: ${error instanceof Error ? error.message : String(error)}`], warnings: [] };
  }
}
