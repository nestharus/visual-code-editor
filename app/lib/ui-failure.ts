import { actorFromString, type ActorKind } from "./actors";
import {
  groundingSourceFromString,
  trustStateFromString,
  type TrustSignal,
} from "./trust";

export const ALL_UI_FAILURE_KINDS = [
  "test-failure",
  "runtime-error",
  "a11y-violation",
  "contrast-violation",
  "render-error",
  "performance-budget",
] as const;

export type UiFailureKind = (typeof ALL_UI_FAILURE_KINDS)[number];

export const ALL_UI_FAILURE_SEVERITIES = [
  "blocker",
  "critical",
  "major",
  "minor",
  "info",
] as const;

export type UiFailureSeverity = (typeof ALL_UI_FAILURE_SEVERITIES)[number];

export interface UiFailure {
  id: string;
  widgetId: string | null;
  screenId: string | null;
  variantCellId: string | null;
  kind: UiFailureKind;
  severity: UiFailureSeverity;
  message: string;
  evidenceUrl: string | null;
  trust: TrustSignal;
  attributionActor: ActorKind;
  detectedAtMs: number;
}

export const UI_FAILURE_ID_PATTERN = /^ui-failure:[a-zA-Z0-9._-]+$/;

const UI_FAILURE_KIND_SET: ReadonlySet<string> = new Set(ALL_UI_FAILURE_KINDS);
const UI_FAILURE_SEVERITY_SET: ReadonlySet<string> = new Set(
  ALL_UI_FAILURE_SEVERITIES,
);

export function uiFailureKindFromString(value: string): UiFailureKind {
  if (UI_FAILURE_KIND_SET.has(value)) {
    return value as UiFailureKind;
  }

  throw new Error(`Unknown UI failure kind: ${value}`);
}

export function uiFailureSeverityFromString(
  value: string,
): UiFailureSeverity {
  if (UI_FAILURE_SEVERITY_SET.has(value)) {
    return value as UiFailureSeverity;
  }

  throw new Error(`Unknown UI failure severity: ${value}`);
}

function validateNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function validateOptionalString(value: string | null, fieldName: string): void {
  if (value !== null && typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null`);
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

export function makeUiFailure(partial: UiFailure): UiFailure {
  if (!UI_FAILURE_ID_PATTERN.test(partial.id)) {
    throw new Error("UiFailure id must match ^ui-failure:[a-zA-Z0-9._-]+$");
  }

  validateOptionalString(partial.widgetId, "UiFailure widgetId");
  validateOptionalString(partial.screenId, "UiFailure screenId");
  validateOptionalString(partial.variantCellId, "UiFailure variantCellId");
  if (
    partial.widgetId === null &&
    partial.screenId === null &&
    partial.variantCellId === null
  ) {
    throw new Error(
      "UiFailure requires at least one of widgetId, screenId, or variantCellId",
    );
  }

  uiFailureKindFromString(partial.kind);
  uiFailureSeverityFromString(partial.severity);
  validateNonEmptyString(partial.message, "UiFailure message");

  validateOptionalString(partial.evidenceUrl, "UiFailure evidenceUrl");
  validateTrustSignal(partial.trust);

  try {
    actorFromString(partial.attributionActor);
  } catch (error) {
    throw new Error("UiFailure attributionActor must be an ActorKind", {
      cause: error,
    });
  }

  if (partial.detectedAtMs < 0) {
    throw new Error("UiFailure detectedAtMs must be >= 0");
  }

  return { ...partial };
}
