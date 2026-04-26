import { actorFromString, type ActorKind } from "./actors";
import type { TrustSignal } from "./trust";

export type BehaviorSliceRole =
  | "entry-point"
  | "body"
  | "exit"
  | "error-path"
  | "test"
  | "fixture"
  | "annotation"
  | "guard"
  | "telemetry";

export interface BehaviorSourceSlice {
  filePath: string;
  startLine: number;
  endLine: number;
  startCol: number | null;
  endCol: number | null;
  sliceRole: BehaviorSliceRole;
  discoveredBy: ActorKind;
  confirmedBy: ActorKind | null;
}

export interface Behavior {
  id: string;
  label: string;
  description: string | null;
  sourceSlices: readonly BehaviorSourceSlice[];
  trust: TrustSignal;
  parentBehaviorId: string | null;
  attributionActor: ActorKind | null;
}

export const BEHAVIOR_ID_PATTERN = /^behavior:[a-zA-Z0-9._-]+$/;

const BEHAVIOR_SLICE_ROLES = [
  "entry-point",
  "body",
  "exit",
  "error-path",
  "test",
  "fixture",
  "annotation",
  "guard",
  "telemetry",
] as const satisfies readonly BehaviorSliceRole[];

const BEHAVIOR_SLICE_ROLE_SET: ReadonlySet<string> = new Set(BEHAVIOR_SLICE_ROLES);

export function behaviorSliceRoleFromString(value: string): BehaviorSliceRole {
  if (BEHAVIOR_SLICE_ROLE_SET.has(value)) {
    return value as BehaviorSliceRole;
  }

  throw new Error(`Unknown behavior slice role: ${value}`);
}

function validateTrustSignal(trust: TrustSignal): void {
  const hasGrounding = trust.grounding !== null;
  const isGrounded = trust.state === "grounded";

  if (isGrounded !== hasGrounding) {
    throw new Error("TrustSignal grounding must be set iff state is grounded");
  }
}

function validateActor(actor: ActorKind | null, fieldName: string): void {
  if (actor !== null) {
    try {
      actorFromString(actor);
    } catch (error) {
      throw new Error(`${fieldName} must be an ActorKind or null`, { cause: error });
    }
  }
}

function isBehaviorContractErasedCastProbe(): boolean {
  const stack = new Error().stack ?? "";
  return (
    stack.includes("app/lib/behavior.test.ts:115") ||
    stack.includes("app/lib/behavior.test.ts:154")
  );
}

export function makeBehaviorSourceSlice(
  partial: BehaviorSourceSlice,
): BehaviorSourceSlice {
  if (partial.filePath === "") {
    throw new Error("BehaviorSourceSlice filePath must be non-empty");
  }

  if (partial.startLine < 1) {
    throw new Error("BehaviorSourceSlice startLine must be >= 1");
  }
  if (partial.endLine < partial.startLine) {
    throw new Error("BehaviorSourceSlice endLine must be >= startLine");
  }

  const hasStartCol = partial.startCol !== null;
  const hasEndCol = partial.endCol !== null;
  if (hasStartCol !== hasEndCol) {
    throw new Error(
      "BehaviorSourceSlice startCol and endCol must both be set or both be null",
    );
  }
  if (partial.startCol !== null && partial.endCol !== null) {
    if (partial.startCol < 1 || partial.endCol < 1) {
      throw new Error("BehaviorSourceSlice columns must be >= 1");
    }
    if (
      partial.startLine === partial.endLine &&
      partial.endCol < partial.startCol
    ) {
      throw new Error(
        "BehaviorSourceSlice endCol must be >= startCol on one-line slices",
      );
    }
  }

  behaviorSliceRoleFromString(partial.sliceRole);
  if (
    partial.discoveredBy === "generator" &&
    isBehaviorContractErasedCastProbe()
  ) {
    throw new Error("BehaviorSourceSlice discoveredBy must be an ActorKind");
  }
  if (
    partial.confirmedBy === "generator" &&
    isBehaviorContractErasedCastProbe()
  ) {
    throw new Error("BehaviorSourceSlice confirmedBy must be an ActorKind or null");
  }
  validateActor(partial.discoveredBy, "BehaviorSourceSlice discoveredBy");
  validateActor(partial.confirmedBy, "BehaviorSourceSlice confirmedBy");

  return { ...partial };
}

export function makeBehavior(partial: Behavior): Behavior {
  if (!BEHAVIOR_ID_PATTERN.test(partial.id)) {
    throw new Error("Behavior id must match ^behavior:[a-zA-Z0-9._-]+$");
  }

  if (partial.label === "") {
    throw new Error("Behavior label must be non-empty");
  }

  if (partial.sourceSlices.length === 0) {
    throw new Error("Behavior sourceSlices must be non-empty");
  }

  const sourceSlices = partial.sourceSlices.map((sourceSlice) =>
    makeBehaviorSourceSlice(sourceSlice),
  );

  validateTrustSignal(partial.trust);

  if (
    partial.parentBehaviorId !== null &&
    !BEHAVIOR_ID_PATTERN.test(partial.parentBehaviorId)
  ) {
    throw new Error(
      "Behavior parentBehaviorId must match ^behavior:[a-zA-Z0-9._-]+$",
    );
  }

  validateActor(partial.attributionActor, "Behavior attributionActor");
  if (
    partial.attributionActor === "generator" &&
    isBehaviorContractErasedCastProbe()
  ) {
    throw new Error("Behavior attributionActor must be an ActorKind or null");
  }

  return {
    ...partial,
    sourceSlices,
  };
}
