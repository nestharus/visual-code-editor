import { actorFromString, type ActorKind } from "./actors";
import {
  groundingSourceFromString,
  trustStateFromString,
  type TrustSignal,
} from "./trust";
import { WIDGET_ID_PATTERN } from "./widget";

export type ScreenKind =
  | "page"
  | "modal"
  | "overlay"
  | "dialog"
  | "popover"
  | "drawer"
  | "sidepanel"
  | "toast";

export type ScreenEdgeKind =
  | "navigate"
  | "open-modal"
  | "close-modal"
  | "push"
  | "pop"
  | "replace"
  | "redirect"
  | "user-back";

export type ScreenEdgeTrigger =
  | "click"
  | "keyboard"
  | "auto"
  | "route"
  | "parent-request";

export interface Screen {
  id: string;
  label: string;
  kind: ScreenKind;
  route: string | null;
  widgetIds: readonly string[];
  trust: TrustSignal;
  attributionActor: ActorKind;
  createdAtMs: number;
}

export interface ScreenEdge {
  id: string;
  fromScreenId: string;
  toScreenId: string;
  kind: ScreenEdgeKind;
  trigger: ScreenEdgeTrigger;
  trust: TrustSignal;
  attributionActor: ActorKind;
  observedAtMs: number;
}

export const SCREEN_ID_PATTERN = /^screen:[a-zA-Z0-9._-]+$/;
export const SCREEN_EDGE_ID_PATTERN = /^screen-edge:[a-zA-Z0-9._-]+$/;

export const ALL_SCREEN_KINDS = [
  "page",
  "modal",
  "overlay",
  "dialog",
  "popover",
  "drawer",
  "sidepanel",
  "toast",
] as const satisfies readonly ScreenKind[];

export const ALL_SCREEN_EDGE_KINDS = [
  "navigate",
  "open-modal",
  "close-modal",
  "push",
  "pop",
  "replace",
  "redirect",
  "user-back",
] as const satisfies readonly ScreenEdgeKind[];

export const ALL_SCREEN_EDGE_TRIGGERS = [
  "click",
  "keyboard",
  "auto",
  "route",
  "parent-request",
] as const satisfies readonly ScreenEdgeTrigger[];

const SCREEN_KIND_SET: ReadonlySet<string> = new Set(ALL_SCREEN_KINDS);
const SCREEN_EDGE_KIND_SET: ReadonlySet<string> = new Set(ALL_SCREEN_EDGE_KINDS);
const SCREEN_EDGE_TRIGGER_SET: ReadonlySet<string> = new Set(
  ALL_SCREEN_EDGE_TRIGGERS,
);

export function screenKindFromString(value: string): ScreenKind {
  if (SCREEN_KIND_SET.has(value)) {
    return value as ScreenKind;
  }

  throw new Error(`Unknown screen kind: ${value}`);
}

export function screenEdgeKindFromString(value: string): ScreenEdgeKind {
  if (SCREEN_EDGE_KIND_SET.has(value)) {
    return value as ScreenEdgeKind;
  }

  throw new Error(`Unknown screen edge kind: ${value}`);
}

export function screenEdgeTriggerFromString(value: string): ScreenEdgeTrigger {
  if (SCREEN_EDGE_TRIGGER_SET.has(value)) {
    return value as ScreenEdgeTrigger;
  }

  throw new Error(`Unknown screen edge trigger: ${value}`);
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

function validateActor(actor: ActorKind, fieldName: string): void {
  try {
    actorFromString(actor);
  } catch (error) {
    throw new Error(`${fieldName} must be an ActorKind`, { cause: error });
  }
}

function requireNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer`);
  }
  if (value < 0) {
    throw new Error(`${fieldName} must be >= 0`);
  }
}

export function makeScreen(partial: Screen): Screen {
  if (!SCREEN_ID_PATTERN.test(partial.id)) {
    throw new Error("Screen id must match ^screen:[a-zA-Z0-9._-]+$");
  }
  validateNonEmptyString(partial.label, "Screen label");
  screenKindFromString(partial.kind);

  if (partial.route !== null && typeof partial.route !== "string") {
    throw new Error("Screen route must be a string or null");
  }

  const widgetIds: string[] = [];
  const seenWidgetIds = new Set<string>();
  for (const widgetId of partial.widgetIds) {
    if (!WIDGET_ID_PATTERN.test(widgetId)) {
      throw new Error("Screen widgetIds must match ^widget:[a-zA-Z0-9._-]+$");
    }
    if (seenWidgetIds.has(widgetId)) {
      continue;
    }
    seenWidgetIds.add(widgetId);
    widgetIds.push(widgetId);
  }

  validateTrustSignal(partial.trust);
  validateActor(partial.attributionActor, "Screen attributionActor");
  requireNonNegativeInteger(partial.createdAtMs, "Screen createdAtMs");

  return {
    ...partial,
    widgetIds,
  };
}

export function makeScreenEdge(partial: ScreenEdge): ScreenEdge {
  if (!SCREEN_EDGE_ID_PATTERN.test(partial.id)) {
    throw new Error(
      "ScreenEdge id must match ^screen-edge:[a-zA-Z0-9._-]+$",
    );
  }
  if (!SCREEN_ID_PATTERN.test(partial.fromScreenId)) {
    throw new Error(
      "ScreenEdge fromScreenId must match ^screen:[a-zA-Z0-9._-]+$",
    );
  }
  if (!SCREEN_ID_PATTERN.test(partial.toScreenId)) {
    throw new Error(
      "ScreenEdge toScreenId must match ^screen:[a-zA-Z0-9._-]+$",
    );
  }
  screenEdgeKindFromString(partial.kind);
  screenEdgeTriggerFromString(partial.trigger);

  validateTrustSignal(partial.trust);
  validateActor(partial.attributionActor, "ScreenEdge attributionActor");
  requireNonNegativeInteger(partial.observedAtMs, "ScreenEdge observedAtMs");

  return { ...partial };
}
