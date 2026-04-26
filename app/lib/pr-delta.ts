import { actorFromString, type ActorKind } from "./actors";
import {
  groundingSourceFromString,
  trustStateFromString,
  type TrustSignal,
} from "./trust";

export type DeltaKind =
  | "added"
  | "removed"
  | "renamed"
  | "reshaped"
  | "unchanged"
  | "split"
  | "merged"
  | "unmatched";

export type EntityKind =
  | "behavior"
  | "edge"
  | "container"
  | "store"
  | "artifact"
  | "widget"
  | "test"
  | "task";

export interface EntityDelta {
  deltaKind: DeltaKind;
  entityKind: EntityKind;
  baseId: string | null;
  headId: string | null;
  relatedIds: readonly string[];
  trust: TrustSignal;
  attributionActor: ActorKind;
}

export interface PRDeltaSet {
  id: string;
  baseRevision: string;
  headRevision: string;
  baseBranch: string;
  headBranch: string;
  prNumber: number | null;
  taskId: string | null;
  deltas: readonly EntityDelta[];
  computedAtMs: number;
  attributionActor: ActorKind;
}

export const PR_DELTA_ID_PATTERN = /^prdelta:[a-zA-Z0-9._:-]+$/;

const DELTA_KINDS = [
  "added",
  "removed",
  "renamed",
  "reshaped",
  "unchanged",
  "split",
  "merged",
  "unmatched",
] as const satisfies readonly DeltaKind[];

const ENTITY_KINDS = [
  "behavior",
  "edge",
  "container",
  "store",
  "artifact",
  "widget",
  "test",
  "task",
] as const satisfies readonly EntityKind[];

const DELTA_KIND_SET: ReadonlySet<string> = new Set(DELTA_KINDS);
const ENTITY_KIND_SET: ReadonlySet<string> = new Set(ENTITY_KINDS);

export function deltaKindFromString(value: string): DeltaKind {
  if (DELTA_KIND_SET.has(value)) {
    return value as DeltaKind;
  }

  throw new Error(`Unknown delta kind: ${value}`);
}

export function entityKindFromString(value: string): EntityKind {
  if (ENTITY_KIND_SET.has(value)) {
    return value as EntityKind;
  }

  throw new Error(`Unknown entity kind: ${value}`);
}

function validateActor(actor: ActorKind, fieldName: string): void {
  try {
    actorFromString(actor);
  } catch (error) {
    throw new Error(`${fieldName} must be an ActorKind`, { cause: error });
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

function validateBothIdsSet(delta: EntityDelta, label: string): void {
  if (delta.baseId === null || delta.headId === null) {
    throw new Error(`${label} EntityDelta baseId and headId must be set`);
  }
}

function validateNoRelatedIds(relatedIds: readonly string[], label: string): void {
  if (relatedIds.length > 0) {
    throw new Error(`${label} EntityDelta relatedIds must be empty`);
  }
}

export function makeEntityDelta(partial: EntityDelta): EntityDelta {
  deltaKindFromString(partial.deltaKind);
  entityKindFromString(partial.entityKind);

  const relatedIds = [...partial.relatedIds];
  for (const relatedId of relatedIds) {
    if (relatedId === "") {
      throw new Error("EntityDelta relatedIds must be non-empty strings");
    }
  }

  validateTrustSignal(partial.trust);
  validateActor(partial.attributionActor, "EntityDelta attributionActor");

  switch (partial.deltaKind) {
    case "added":
      validateNoRelatedIds(relatedIds, "ADDED");
      if (partial.baseId !== null) {
        throw new Error("ADDED EntityDelta baseId must be null");
      }
      if (partial.headId === null) {
        throw new Error("ADDED EntityDelta headId must be set");
      }
      break;
    case "removed":
      validateNoRelatedIds(relatedIds, "REMOVED");
      if (partial.baseId === null) {
        throw new Error("REMOVED EntityDelta baseId must be set");
      }
      if (partial.headId !== null) {
        throw new Error("REMOVED EntityDelta headId must be null");
      }
      break;
    case "renamed":
      validateNoRelatedIds(relatedIds, "RENAMED");
      validateBothIdsSet(partial, "RENAMED");
      if (partial.baseId === partial.headId) {
        throw new Error("RENAMED EntityDelta ids must differ");
      }
      break;
    case "reshaped":
      validateNoRelatedIds(relatedIds, "RESHAPED");
      validateBothIdsSet(partial, "RESHAPED");
      if (partial.baseId !== partial.headId) {
        throw new Error("RESHAPED EntityDelta ids must match");
      }
      break;
    case "unchanged":
      validateNoRelatedIds(relatedIds, "UNCHANGED");
      validateBothIdsSet(partial, "UNCHANGED");
      if (partial.baseId !== partial.headId) {
        throw new Error("UNCHANGED EntityDelta ids must match");
      }
      break;
    case "split":
      validateBothIdsSet(partial, "SPLIT");
      if (relatedIds.length === 0) {
        throw new Error("SPLIT EntityDelta relatedIds must be non-empty");
      }
      break;
    case "merged":
      validateBothIdsSet(partial, "MERGED");
      if (relatedIds.length === 0) {
        throw new Error("MERGED EntityDelta relatedIds must be non-empty");
      }
      break;
    case "unmatched":
      validateNoRelatedIds(relatedIds, "UNMATCHED");
      if (partial.baseId === null && partial.headId === null) {
        throw new Error("UNMATCHED EntityDelta must set baseId or headId");
      }
      break;
  }

  return {
    ...partial,
    relatedIds,
  };
}

export function makePRDeltaSet(partial: PRDeltaSet): PRDeltaSet {
  if (!PR_DELTA_ID_PATTERN.test(partial.id)) {
    throw new Error("PRDeltaSet id must match ^prdelta:[a-zA-Z0-9._:-]+$");
  }

  if (partial.baseRevision === "") {
    throw new Error("PRDeltaSet baseRevision must be non-empty");
  }
  if (partial.headRevision === "") {
    throw new Error("PRDeltaSet headRevision must be non-empty");
  }
  if (partial.baseRevision === partial.headRevision) {
    throw new Error("PRDeltaSet baseRevision and headRevision must differ");
  }

  if (partial.baseBranch === "") {
    throw new Error("PRDeltaSet baseBranch must be non-empty");
  }
  if (partial.headBranch === "") {
    throw new Error("PRDeltaSet headBranch must be non-empty");
  }

  const hasPrNumber = partial.prNumber !== null;
  const hasTaskId = partial.taskId !== null;
  if (hasPrNumber === hasTaskId) {
    throw new Error("PRDeltaSet must set exactly one of prNumber/taskId");
  }

  const deltas = partial.deltas.map((delta) => makeEntityDelta(delta));

  if (partial.computedAtMs < 0) {
    throw new Error("PRDeltaSet computedAtMs must be >= 0");
  }

  validateActor(partial.attributionActor, "PRDeltaSet attributionActor");

  return {
    ...partial,
    deltas,
  };
}
