import { actorFromString, type ActorKind } from "./actors";
import type { TrustSignal } from "./trust";

export type NeighbourhoodKind =
  | "direct-neighbours"
  | "transitive-by-edge-kind"
  | "shared-behaviour"
  | "shared-container"
  | "exact";

export type SliceLifecycleState =
  | "active"
  | "pinned"
  | "expiring"
  | "tombstoned"
  | "recovered"
  | "dismissed";

export interface NeighbourhoodRule {
  kind: NeighbourhoodKind;
  edgeKinds: readonly string[];
  maxHops: number;
}

export interface Slice {
  id: string;
  query: string;
  matchedEntityIds: readonly string[];
  neighbourhoodEntityIds: readonly string[];
  rule: NeighbourhoodRule;
  lifecycleState: SliceLifecycleState;
  ttlMs: number | null;
  createdBy: ActorKind;
  createdAtMs: number;
  pinnedAtMs: number | null;
  trust: TrustSignal;
}

export const SLICE_ID_PATTERN = /^slice:[a-zA-Z0-9._-]+$/;

const NEIGHBOURHOOD_KINDS = [
  "direct-neighbours",
  "transitive-by-edge-kind",
  "shared-behaviour",
  "shared-container",
  "exact",
] as const satisfies readonly NeighbourhoodKind[];

const SLICE_LIFECYCLE_STATES = [
  "active",
  "pinned",
  "expiring",
  "tombstoned",
  "recovered",
  "dismissed",
] as const satisfies readonly SliceLifecycleState[];

const NEIGHBOURHOOD_KIND_SET: ReadonlySet<string> = new Set(NEIGHBOURHOOD_KINDS);
const SLICE_LIFECYCLE_STATE_SET: ReadonlySet<string> = new Set(
  SLICE_LIFECYCLE_STATES,
);

export function neighbourhoodKindFromString(value: string): NeighbourhoodKind {
  if (NEIGHBOURHOOD_KIND_SET.has(value)) {
    return value as NeighbourhoodKind;
  }

  throw new Error(`Unknown neighbourhood kind: ${value}`);
}

export function sliceLifecycleStateFromString(
  value: string,
): SliceLifecycleState {
  if (SLICE_LIFECYCLE_STATE_SET.has(value)) {
    return value as SliceLifecycleState;
  }

  throw new Error(`Unknown slice lifecycle state: ${value}`);
}

function validateActor(actor: ActorKind, fieldName: string): void {
  try {
    actorFromString(actor);
  } catch (error) {
    throw new Error(`${fieldName} must be an ActorKind`, { cause: error });
  }
}

function validateTrustSignal(trust: TrustSignal): void {
  const hasGrounding = trust.grounding !== null;
  const isGrounded = trust.state === "grounded";

  if (isGrounded !== hasGrounding) {
    throw new Error("TrustSignal grounding must be set iff state is grounded");
  }
}

export function makeNeighbourhoodRule(
  partial: NeighbourhoodRule,
): NeighbourhoodRule {
  neighbourhoodKindFromString(partial.kind);

  const edgeKinds = [...partial.edgeKinds];
  for (const edgeKind of edgeKinds) {
    if (edgeKind === "") {
      throw new Error("NeighbourhoodRule edgeKinds must contain non-empty strings");
    }
  }

  if (partial.kind === "transitive-by-edge-kind") {
    if (edgeKinds.length === 0) {
      throw new Error(
        "NeighbourhoodRule edgeKinds must be non-empty for transitive rules",
      );
    }
    if (partial.maxHops < 1) {
      throw new Error(
        "NeighbourhoodRule maxHops must be >= 1 for transitive rules",
      );
    }

    return { ...partial, edgeKinds };
  }

  if (edgeKinds.length !== 0) {
    throw new Error(
      "NeighbourhoodRule edgeKinds must be empty for non-transitive rules",
    );
  }
  if (partial.maxHops !== 0) {
    throw new Error(
      "NeighbourhoodRule maxHops must be 0 for non-transitive rules",
    );
  }

  return { ...partial, edgeKinds };
}

export function makeSlice(partial: Slice): Slice {
  if (!SLICE_ID_PATTERN.test(partial.id)) {
    throw new Error("Slice id must match ^slice:[a-zA-Z0-9._-]+$");
  }

  if (partial.query === "") {
    throw new Error("Slice query must be non-empty");
  }

  const matchedEntityIds = [...partial.matchedEntityIds];
  if (matchedEntityIds.length === 0) {
    throw new Error("Slice matchedEntityIds must be non-empty");
  }

  const neighbourhoodEntityIds = [...partial.neighbourhoodEntityIds];
  if (new Set(neighbourhoodEntityIds).size !== neighbourhoodEntityIds.length) {
    throw new Error("Slice neighbourhoodEntityIds must be unique");
  }

  const matchedEntityIdSet = new Set(matchedEntityIds);
  if (neighbourhoodEntityIds.some((entityId) => matchedEntityIdSet.has(entityId))) {
    throw new Error(
      "Slice neighbourhoodEntityIds must not overlap matchedEntityIds",
    );
  }

  const rule = makeNeighbourhoodRule(partial.rule);
  sliceLifecycleStateFromString(partial.lifecycleState);

  if (partial.lifecycleState === "pinned") {
    if (partial.ttlMs !== null || partial.pinnedAtMs === null) {
      throw new Error(
        "Slice pinned lifecycle requires ttlMs null and pinnedAtMs set",
      );
    }
  } else if (partial.ttlMs === null) {
    throw new Error("Slice non-pinned lifecycle states require ttlMs");
  }

  validateActor(partial.createdBy, "Slice createdBy");

  if (partial.createdAtMs < 0) {
    throw new Error("Slice createdAtMs must be >= 0");
  }
  if (partial.pinnedAtMs !== null && partial.pinnedAtMs < partial.createdAtMs) {
    throw new Error("Slice pinnedAtMs must be >= createdAtMs");
  }

  validateTrustSignal(partial.trust);

  return {
    ...partial,
    matchedEntityIds,
    neighbourhoodEntityIds,
    rule,
  };
}
