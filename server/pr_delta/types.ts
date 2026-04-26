/**
 * Server-side mirror of app/lib/pr-delta.ts.
 *
 * Keep the exported literal arrays aligned with the app substrate;
 * e2e/pr-delta-vocab-parity.spec.ts pins the PR delta vocabulary.
 */

export type ActorKind =
  | "you-this-session"
  | "you-other-session"
  | "another-user"
  | "agents:edit"
  | "agents:direct"
  | "agents:slice-constructor"
  | "agents:relevance-classifier"
  | "agents:provider-mapper"
  | "generator"
  | "ci"
  | "git-op"
  | "provider:github:sync"
  | "provider:github:pr-merge"
  | "product:auto-focus"
  | "product:digest-surface"
  | "product:thread-open"
  | "product:lineage-confirm"
  | "unknown-external";

export type TrustState =
  | "grounded"
  | "candidate"
  | "conflicting"
  | "stale"
  | "orphaned";

export type GroundingSource =
  | "test"
  | "lsp-type"
  | "runtime-trace"
  | "annotation"
  | "user-confirmed"
  | "provider-verified";

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

export interface TrustSignal {
  state: TrustState;
  grounding: GroundingSource | null;
}

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

export type ComputePRDeltaRequest =
  | {
      variant: "revisions";
      baseRevision: string;
      headRevision: string;
      baseBranch: string;
      headBranch: string;
      prNumber: number | null;
    }
  | {
      variant: "task";
      taskId: string;
    };

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; error_kind: "validation" };

export const PR_DELTA_ID_PATTERN = /^prdelta:[a-zA-Z0-9._:-]+$/;
export const TASK_ID_PATTERN = /^task:[a-zA-Z0-9._-]+$/;

export const DELTA_KINDS = [
  "added",
  "removed",
  "renamed",
  "reshaped",
  "unchanged",
  "split",
  "merged",
  "unmatched",
] as const satisfies readonly DeltaKind[];

export const ENTITY_KINDS = [
  "behavior",
  "edge",
  "container",
  "store",
  "artifact",
  "widget",
  "test",
  "task",
] as const satisfies readonly EntityKind[];

const ALL_ACTORS = [
  "you-this-session",
  "you-other-session",
  "another-user",
  "agents:edit",
  "agents:direct",
  "agents:slice-constructor",
  "agents:relevance-classifier",
  "agents:provider-mapper",
  "generator",
  "ci",
  "git-op",
  "provider:github:sync",
  "provider:github:pr-merge",
  "product:auto-focus",
  "product:digest-surface",
  "product:thread-open",
  "product:lineage-confirm",
  "unknown-external",
] as const satisfies readonly ActorKind[];

const TRUST_STATES = [
  "grounded",
  "candidate",
  "conflicting",
  "stale",
  "orphaned",
] as const satisfies readonly TrustState[];

const GROUNDING_SOURCES = [
  "test",
  "lsp-type",
  "runtime-trace",
  "annotation",
  "user-confirmed",
  "provider-verified",
] as const satisfies readonly GroundingSource[];

const DELTA_KIND_SET: ReadonlySet<string> = new Set(DELTA_KINDS);
const ENTITY_KIND_SET: ReadonlySet<string> = new Set(ENTITY_KINDS);
const ACTOR_SET: ReadonlySet<string> = new Set(ALL_ACTORS);
const TRUST_STATE_SET: ReadonlySet<string> = new Set(TRUST_STATES);
const GROUNDING_SOURCE_SET: ReadonlySet<string> = new Set(GROUNDING_SOURCES);

export function deltaKindFromString(value: string): DeltaKind {
  if (DELTA_KIND_SET.has(value)) return value as DeltaKind;
  throw new Error(`Unknown delta kind: ${value}`);
}

export function entityKindFromString(value: string): EntityKind {
  if (ENTITY_KIND_SET.has(value)) return value as EntityKind;
  throw new Error(`Unknown entity kind: ${value}`);
}

function actorFromString(value: string): ActorKind {
  if (ACTOR_SET.has(value)) return value as ActorKind;
  throw new Error(`Unknown actor kind: ${value}`);
}

function trustStateFromString(value: string): TrustState {
  if (TRUST_STATE_SET.has(value)) return value as TrustState;
  throw new Error(`Unknown trust state: ${value}`);
}

function groundingSourceFromString(value: string): GroundingSource {
  if (GROUNDING_SOURCE_SET.has(value)) return value as GroundingSource;
  throw new Error(`Unknown grounding source: ${value}`);
}

export function validateComputePRDeltaRequest(
  payload: unknown,
): ValidationResult<ComputePRDeltaRequest> {
  if (!payload || typeof payload !== "object") {
    return validationError("body must be an object");
  }

  const candidate = payload as Record<string, unknown>;
  const hasTask = candidate.task_id !== undefined;
  const hasBase = candidate.base_revision !== undefined;
  const hasHead = candidate.head_revision !== undefined;
  const hasRevisionPair = hasBase && hasHead;

  if (hasTask && (hasBase || hasHead)) {
    return validationError("provide task_id or base_revision/head_revision, not both");
  }
  if (!hasTask && !hasRevisionPair) {
    return validationError("provide either task_id or base_revision/head_revision");
  }
  if (!hasTask && hasBase !== hasHead) {
    return validationError("base_revision and head_revision must be supplied together");
  }

  if (hasTask) {
    if (typeof candidate.task_id !== "string" || !TASK_ID_PATTERN.test(candidate.task_id)) {
      return validationError("task_id must match ^task:[a-zA-Z0-9._-]+$");
    }
    return { ok: true, value: { variant: "task", taskId: candidate.task_id } };
  }

  if (
    typeof candidate.base_revision !== "string" ||
    candidate.base_revision.trim().length === 0
  ) {
    return validationError("base_revision must be a non-empty string");
  }
  if (
    typeof candidate.head_revision !== "string" ||
    candidate.head_revision.trim().length === 0
  ) {
    return validationError("head_revision must be a non-empty string");
  }
  if (candidate.base_revision === candidate.head_revision) {
    return validationError("base_revision and head_revision must differ");
  }
  if (candidate.base_branch !== undefined && typeof candidate.base_branch !== "string") {
    return validationError("base_branch must be a string when supplied");
  }
  if (candidate.head_branch !== undefined && typeof candidate.head_branch !== "string") {
    return validationError("head_branch must be a string when supplied");
  }
  if (candidate.pr_number !== undefined) {
    if (
      typeof candidate.pr_number !== "number" ||
      !Number.isInteger(candidate.pr_number) ||
      candidate.pr_number < 0
    ) {
      return validationError("pr_number must be a non-negative integer when supplied");
    }
  }

  const baseBranch = candidate.base_branch?.toString().trim() || "(base)";
  const headBranch = candidate.head_branch?.toString().trim() || "(head)";
  if (baseBranch === "" || headBranch === "") {
    return validationError("base_branch and head_branch must be non-empty when supplied");
  }

  return {
    ok: true,
    value: {
      variant: "revisions",
      baseRevision: candidate.base_revision.trim(),
      headRevision: candidate.head_revision.trim(),
      baseBranch,
      headBranch,
      prNumber: candidate.pr_number ?? 0,
    },
  };
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
  actorFromString(partial.attributionActor);

  switch (partial.deltaKind) {
    case "added":
      validateNoRelatedIds(relatedIds, "ADDED");
      if (partial.baseId !== null) throw new Error("ADDED EntityDelta baseId must be null");
      if (partial.headId === null) throw new Error("ADDED EntityDelta headId must be set");
      break;
    case "removed":
      validateNoRelatedIds(relatedIds, "REMOVED");
      if (partial.baseId === null) throw new Error("REMOVED EntityDelta baseId must be set");
      if (partial.headId !== null) throw new Error("REMOVED EntityDelta headId must be null");
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

  return { ...partial, relatedIds };
}

export function makePRDeltaSet(partial: PRDeltaSet): PRDeltaSet {
  if (!PR_DELTA_ID_PATTERN.test(partial.id)) {
    throw new Error("PRDeltaSet id must match ^prdelta:[a-zA-Z0-9._:-]+$");
  }
  if (partial.baseRevision === "") throw new Error("PRDeltaSet baseRevision must be non-empty");
  if (partial.headRevision === "") throw new Error("PRDeltaSet headRevision must be non-empty");
  if (partial.baseRevision === partial.headRevision) {
    throw new Error("PRDeltaSet baseRevision and headRevision must differ");
  }
  if (partial.baseBranch === "") throw new Error("PRDeltaSet baseBranch must be non-empty");
  if (partial.headBranch === "") throw new Error("PRDeltaSet headBranch must be non-empty");

  const hasPrNumber = partial.prNumber !== null;
  const hasTaskId = partial.taskId !== null;
  if (hasPrNumber === hasTaskId) {
    throw new Error("PRDeltaSet must set exactly one of prNumber/taskId");
  }

  const deltas = partial.deltas.map((delta) => makeEntityDelta(delta));
  if (partial.computedAtMs < 0) {
    throw new Error("PRDeltaSet computedAtMs must be >= 0");
  }
  actorFromString(partial.attributionActor);

  return { ...partial, deltas };
}

function validateTrustSignal(trust: TrustSignal): void {
  trustStateFromString(trust.state);
  if (trust.grounding !== null) groundingSourceFromString(trust.grounding);

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

function validationError(error: string): ValidationResult<never> {
  return { ok: false, error, error_kind: "validation" };
}
