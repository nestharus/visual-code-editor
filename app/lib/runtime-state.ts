import { actorFromString, type ActorKind } from "./actors";
import { SCREEN_ID_PATTERN } from "./screen";
import {
  groundingSourceFromString,
  trustStateFromString,
  type TrustSignal,
} from "./trust";
import { WIDGET_ID_PATTERN } from "./widget";

export type RuntimeStateKind =
  | "component-tree"
  | "props-only"
  | "signal-graph"
  | "network-log"
  | "console-log"
  | "dom-snapshot";

export type RuntimeStateNodeKind =
  | "component"
  | "element"
  | "text"
  | "fragment"
  | "portal";

export interface RuntimeStateNode {
  kind: RuntimeStateNodeKind;
  name: string;
  propsSummary: string;
  childrenCount: number;
}

export interface RuntimeStateCapture {
  id: string;
  widgetId: string | null;
  screenId: string | null;
  kind: RuntimeStateKind;
  nodes: readonly RuntimeStateNode[];
  rawPayloadPath: string | null;
  trust: TrustSignal;
  attributionActor: ActorKind;
  capturedAtMs: number;
}

export const RUNTIME_STATE_CAPTURE_ID_PATTERN =
  /^runtime-capture:[a-zA-Z0-9._-]+$/;

export const ALL_RUNTIME_STATE_KINDS = [
  "component-tree",
  "props-only",
  "signal-graph",
  "network-log",
  "console-log",
  "dom-snapshot",
] as const satisfies readonly RuntimeStateKind[];

export const ALL_RUNTIME_STATE_NODE_KINDS = [
  "component",
  "element",
  "text",
  "fragment",
  "portal",
] as const satisfies readonly RuntimeStateNodeKind[];

const RUNTIME_STATE_KIND_SET: ReadonlySet<string> = new Set(
  ALL_RUNTIME_STATE_KINDS,
);
const RUNTIME_STATE_NODE_KIND_SET: ReadonlySet<string> = new Set(
  ALL_RUNTIME_STATE_NODE_KINDS,
);

export function runtimeStateKindFromString(value: string): RuntimeStateKind {
  if (RUNTIME_STATE_KIND_SET.has(value)) {
    return value as RuntimeStateKind;
  }

  throw new Error(`Unknown runtime state kind: ${value}`);
}

export function runtimeStateNodeKindFromString(
  value: string,
): RuntimeStateNodeKind {
  if (RUNTIME_STATE_NODE_KIND_SET.has(value)) {
    return value as RuntimeStateNodeKind;
  }

  throw new Error(`Unknown runtime state node kind: ${value}`);
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

export function makeRuntimeStateNode(
  partial: RuntimeStateNode,
): RuntimeStateNode {
  runtimeStateNodeKindFromString(partial.kind);
  validateNonEmptyString(partial.name, "RuntimeStateNode name");
  validateNonEmptyString(
    partial.propsSummary,
    "RuntimeStateNode propsSummary",
  );
  requireNonNegativeInteger(
    partial.childrenCount,
    "RuntimeStateNode childrenCount",
  );

  return { ...partial };
}

export function makeRuntimeStateCapture(
  partial: RuntimeStateCapture,
): RuntimeStateCapture {
  if (!RUNTIME_STATE_CAPTURE_ID_PATTERN.test(partial.id)) {
    throw new Error(
      "RuntimeStateCapture id must match ^runtime-capture:[a-zA-Z0-9._-]+$",
    );
  }

  if (partial.widgetId === null && partial.screenId === null) {
    throw new Error(
      "RuntimeStateCapture requires at least one of widgetId or screenId",
    );
  }
  if (partial.widgetId !== null && !WIDGET_ID_PATTERN.test(partial.widgetId)) {
    throw new Error(
      "RuntimeStateCapture widgetId must match ^widget:[a-zA-Z0-9._-]+$",
    );
  }
  if (partial.screenId !== null && !SCREEN_ID_PATTERN.test(partial.screenId)) {
    throw new Error(
      "RuntimeStateCapture screenId must match ^screen:[a-zA-Z0-9._-]+$",
    );
  }

  runtimeStateKindFromString(partial.kind);
  const nodes = partial.nodes.map((node) => makeRuntimeStateNode(node));

  if (
    partial.rawPayloadPath !== null &&
    typeof partial.rawPayloadPath !== "string"
  ) {
    throw new Error("RuntimeStateCapture rawPayloadPath must be a string or null");
  }

  validateTrustSignal(partial.trust);
  validateActor(
    partial.attributionActor,
    "RuntimeStateCapture attributionActor",
  );
  requireNonNegativeInteger(
    partial.capturedAtMs,
    "RuntimeStateCapture capturedAtMs",
  );

  return {
    ...partial,
    nodes,
  };
}
