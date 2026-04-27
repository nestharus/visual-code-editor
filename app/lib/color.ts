import { actorFromString, type ActorKind } from "./actors";
import {
  groundingSourceFromString,
  trustStateFromString,
  type TrustSignal,
} from "./trust";

export type ColorRole =
  | "primary"
  | "secondary"
  | "accent"
  | "neutral"
  | "surface"
  | "background"
  | "text"
  | "border"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "muted"
  | "decorative";

export type ContrastLevel = "pass-aa" | "pass-aaa" | "fail" | "not-text";

export interface ColorToken {
  id: string;
  name: string;
  role: ColorRole;
  hexValue: string;
  description: string | null;
  trust: TrustSignal;
  attributionActor: ActorKind;
  createdAtMs: number;
}

export interface ContrastPair {
  id: string;
  foregroundTokenId: string;
  backgroundTokenId: string;
  ratio: number;
  levelNormalText: ContrastLevel;
  levelLargeText: ContrastLevel;
  levelUiComponent: ContrastLevel;
  computedAtMs: number;
}

export interface ColorPalette {
  id: string;
  workspaceId: string;
  tokens: readonly ColorToken[];
  contrastPairs: readonly ContrastPair[];
  computedAtMs: number;
}

export const COLOR_TOKEN_ID_PATTERN = /^color-token:[a-zA-Z0-9._-]+$/;
export const CONTRAST_PAIR_ID_PATTERN = /^contrast-pair:[a-zA-Z0-9._-]+$/;
export const COLOR_PALETTE_ID_PATTERN = /^color-palette:[a-zA-Z0-9._-]+$/;
export const HEX_VALUE_PATTERN = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;

const COLOR_ROLES = [
  "primary",
  "secondary",
  "accent",
  "neutral",
  "surface",
  "background",
  "text",
  "border",
  "success",
  "warning",
  "error",
  "info",
  "muted",
  "decorative",
] as const satisfies readonly ColorRole[];

const CONTRAST_LEVELS = [
  "pass-aa",
  "pass-aaa",
  "fail",
  "not-text",
] as const satisfies readonly ContrastLevel[];

const COLOR_ROLE_SET: ReadonlySet<string> = new Set(COLOR_ROLES);
const CONTRAST_LEVEL_SET: ReadonlySet<string> = new Set(CONTRAST_LEVELS);

export function colorRoleFromString(value: string): ColorRole {
  if (COLOR_ROLE_SET.has(value)) {
    return value as ColorRole;
  }

  throw new Error(`Unknown color role: ${value}`);
}

export function contrastLevelFromString(value: string): ContrastLevel {
  if (CONTRAST_LEVEL_SET.has(value)) {
    return value as ContrastLevel;
  }

  throw new Error(`Unknown contrast level: ${value}`);
}

function validateNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function validateTrustSignal(trust: TrustSignal): void {
  trustStateFromString(trust.state);
  if (trust.grounding !== null) {
    groundingSourceFromString(trust.grounding);
  }

  const hasGrounding = trust.grounding !== null;
  const isGrounded = trust.state === "grounded";

  if (isGrounded !== hasGrounding) {
    throw new Error("TrustSignal grounding must be set iff state is grounded");
  }
}

export function makeColorToken(partial: ColorToken): ColorToken {
  if (!COLOR_TOKEN_ID_PATTERN.test(partial.id)) {
    throw new Error("ColorToken id must match ^color-token:[a-zA-Z0-9._-]+$");
  }
  validateNonEmptyString(partial.name, "ColorToken name");
  colorRoleFromString(partial.role);
  if (!HEX_VALUE_PATTERN.test(partial.hexValue)) {
    throw new Error(
      "ColorToken hexValue must match ^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$",
    );
  }
  if (partial.description !== null && typeof partial.description !== "string") {
    throw new Error("ColorToken description must be a string or null");
  }
  validateTrustSignal(partial.trust);

  try {
    actorFromString(partial.attributionActor);
  } catch (error) {
    throw new Error("ColorToken attributionActor must be an ActorKind", {
      cause: error,
    });
  }

  if (partial.createdAtMs < 0) {
    throw new Error("ColorToken createdAtMs must be >= 0");
  }

  return { ...partial };
}

export function makeContrastPair(partial: ContrastPair): ContrastPair {
  if (!CONTRAST_PAIR_ID_PATTERN.test(partial.id)) {
    throw new Error(
      "ContrastPair id must match ^contrast-pair:[a-zA-Z0-9._-]+$",
    );
  }
  if (!COLOR_TOKEN_ID_PATTERN.test(partial.foregroundTokenId)) {
    throw new Error(
      "ContrastPair foregroundTokenId must match ^color-token:[a-zA-Z0-9._-]+$",
    );
  }
  if (!COLOR_TOKEN_ID_PATTERN.test(partial.backgroundTokenId)) {
    throw new Error(
      "ContrastPair backgroundTokenId must match ^color-token:[a-zA-Z0-9._-]+$",
    );
  }
  if (partial.foregroundTokenId === partial.backgroundTokenId) {
    throw new Error(
      "ContrastPair foregroundTokenId and backgroundTokenId must be different",
    );
  }
  if (partial.ratio < 1.0) {
    throw new Error("ContrastPair ratio must be >= 1.0");
  }
  contrastLevelFromString(partial.levelNormalText);
  contrastLevelFromString(partial.levelLargeText);
  contrastLevelFromString(partial.levelUiComponent);

  if (partial.computedAtMs < 0) {
    throw new Error("ContrastPair computedAtMs must be >= 0");
  }

  return { ...partial };
}

export function makeColorPalette(partial: ColorPalette): ColorPalette {
  if (!COLOR_PALETTE_ID_PATTERN.test(partial.id)) {
    throw new Error(
      "ColorPalette id must match ^color-palette:[a-zA-Z0-9._-]+$",
    );
  }
  validateNonEmptyString(partial.workspaceId, "ColorPalette workspaceId");

  if (partial.tokens.length === 0) {
    throw new Error("ColorPalette tokens must contain at least one token");
  }

  const tokens = partial.tokens.map(makeColorToken);
  const tokenIds = new Set<string>();
  for (const token of tokens) {
    if (tokenIds.has(token.id)) {
      throw new Error("ColorPalette tokens must be deduped by id");
    }
    tokenIds.add(token.id);
  }

  const contrastPairs = partial.contrastPairs.map(makeContrastPair);

  if (partial.computedAtMs < 0) {
    throw new Error("ColorPalette computedAtMs must be >= 0");
  }

  return {
    ...partial,
    tokens: Object.freeze(tokens),
    contrastPairs: Object.freeze(contrastPairs),
  };
}
