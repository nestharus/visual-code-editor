/**
 * Server-side mirror of app/lib/slice.ts.
 *
 * Keep the exported literal arrays aligned with the app substrate;
 * e2e/slices-vocab-parity.spec.ts pins the slice vocabulary.
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

export interface TrustSignal {
  state: "grounded" | "candidate" | "conflicting" | "stale" | "orphaned";
  grounding:
    | "test"
    | "lsp-type"
    | "runtime-trace"
    | "annotation"
    | "user-confirmed"
    | "provider-verified"
    | null;
}

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

export type ConstructSliceRequest = {
  query: string;
  rule: NeighbourhoodRule;
  defaultTtlMs: number;
  actor: ActorKind;
};

export type TransitionSliceRequest = {
  toState: SliceLifecycleState;
  actor: ActorKind;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; error_kind: "validation" };

export const SLICE_ID_PATTERN = /^slice:[a-zA-Z0-9._-]+$/;
export const DEFAULT_SLICE_TTL_MS = 30 * 60 * 1000;

export const ALL_ACTORS = [
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

export const NEIGHBOURHOOD_KINDS = [
  "direct-neighbours",
  "transitive-by-edge-kind",
  "shared-behaviour",
  "shared-container",
  "exact",
] as const satisfies readonly NeighbourhoodKind[];

export const SLICE_LIFECYCLE_STATES = [
  "active",
  "pinned",
  "expiring",
  "tombstoned",
  "recovered",
  "dismissed",
] as const satisfies readonly SliceLifecycleState[];

const ACTOR_SET: ReadonlySet<string> = new Set(ALL_ACTORS);
const NEIGHBOURHOOD_KIND_SET: ReadonlySet<string> = new Set(NEIGHBOURHOOD_KINDS);
const SLICE_LIFECYCLE_STATE_SET: ReadonlySet<string> = new Set(
  SLICE_LIFECYCLE_STATES,
);

export function actorFromString(value: string): ActorKind {
  if (ACTOR_SET.has(value)) return value as ActorKind;
  throw new Error(`Unknown actor kind: ${value}`);
}

export function neighbourhoodKindFromString(value: string): NeighbourhoodKind {
  if (NEIGHBOURHOOD_KIND_SET.has(value)) return value as NeighbourhoodKind;
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

export function validateConstructSliceRequest(
  payload: unknown,
): ValidationResult<ConstructSliceRequest> {
  if (!payload || typeof payload !== "object") {
    return validationError("body must be an object");
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.query !== "string" || candidate.query.trim().length === 0) {
    return validationError("query must be a non-empty string");
  }

  const ruleValidation = validateNeighbourhoodRule(candidate.rule);
  if (!ruleValidation.ok) return ruleValidation;

  const defaultTtlCandidate = candidate.default_ttl_ms ?? DEFAULT_SLICE_TTL_MS;
  if (
    typeof defaultTtlCandidate !== "number" ||
    !Number.isFinite(defaultTtlCandidate) ||
    defaultTtlCandidate <= 0
  ) {
    return validationError("default_ttl_ms must be a positive number when supplied");
  }

  const actorValue = candidate.actor ?? "you-this-session";
  if (typeof actorValue !== "string") {
    return validationError("actor must be an ActorKind when supplied");
  }

  let actor: ActorKind;
  try {
    actor = actorFromString(actorValue);
  } catch {
    return validationError("actor must be an ActorKind when supplied");
  }

  return {
    ok: true,
    value: {
      query: candidate.query.trim(),
      rule: ruleValidation.value,
      defaultTtlMs: Math.floor(defaultTtlCandidate),
      actor,
    },
  };
}

export function validateTransitionSliceRequest(
  payload: unknown,
): ValidationResult<TransitionSliceRequest> {
  if (!payload || typeof payload !== "object") {
    return validationError("body must be an object");
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.to_state !== "string") {
    return validationError("to_state must be a SliceLifecycleState");
  }

  let toState: SliceLifecycleState;
  try {
    toState = sliceLifecycleStateFromString(candidate.to_state);
  } catch {
    return validationError("to_state must be a SliceLifecycleState");
  }

  const actorValue = candidate.actor ?? "you-this-session";
  if (typeof actorValue !== "string") {
    return validationError("actor must be an ActorKind when supplied");
  }

  let actor: ActorKind;
  try {
    actor = actorFromString(actorValue);
  } catch {
    return validationError("actor must be an ActorKind when supplied");
  }

  return { ok: true, value: { toState, actor } };
}

export function makeNeighbourhoodRule(partial: NeighbourhoodRule): NeighbourhoodRule {
  neighbourhoodKindFromString(partial.kind);

  if (!Array.isArray(partial.edgeKinds)) {
    throw new Error("NeighbourhoodRule edgeKinds must be an array");
  }
  const edgeKinds = [...partial.edgeKinds];
  for (const edgeKind of edgeKinds) {
    if (typeof edgeKind !== "string" || edgeKind.trim().length === 0) {
      throw new Error("NeighbourhoodRule edgeKinds must contain non-empty strings");
    }
  }

  if (!Number.isInteger(partial.maxHops)) {
    throw new Error("NeighbourhoodRule maxHops must be an integer");
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
    return { kind: partial.kind, edgeKinds, maxHops: partial.maxHops };
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

  return { kind: partial.kind, edgeKinds, maxHops: partial.maxHops };
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
    throw new Error("Slice neighbourhoodEntityIds must not overlap matchedEntityIds");
  }

  const rule = makeNeighbourhoodRule(partial.rule);
  sliceLifecycleStateFromString(partial.lifecycleState);

  if (partial.lifecycleState === "pinned") {
    if (partial.ttlMs !== null || partial.pinnedAtMs === null) {
      throw new Error("Slice pinned lifecycle requires ttlMs null and pinnedAtMs set");
    }
  } else if (partial.ttlMs === null) {
    throw new Error("Slice non-pinned lifecycle states require ttlMs");
  }

  actorFromString(partial.createdBy);

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

function validateNeighbourhoodRule(
  payload: unknown,
): ValidationResult<NeighbourhoodRule> {
  if (!payload || typeof payload !== "object") {
    return validationError("rule must be an object");
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.kind !== "string") {
    return validationError("rule.kind must be a NeighbourhoodKind");
  }
  if (!Array.isArray(candidate.edgeKinds)) {
    return validationError("rule.edgeKinds must be an array");
  }
  if (!Number.isInteger(candidate.maxHops)) {
    return validationError("rule.maxHops must be an integer");
  }

  try {
    return {
      ok: true,
      value: makeNeighbourhoodRule({
        kind: neighbourhoodKindFromString(candidate.kind),
        edgeKinds: candidate.edgeKinds,
        maxHops: candidate.maxHops,
      }),
    };
  } catch (error) {
    return validationError(
      error instanceof Error ? error.message : "rule must be a valid NeighbourhoodRule",
    );
  }
}

function validateTrustSignal(trust: TrustSignal): void {
  const hasGrounding = trust.grounding !== null;
  const isGrounded = trust.state === "grounded";

  if (isGrounded !== hasGrounding) {
    throw new Error("TrustSignal grounding must be set iff state is grounded");
  }
}

function validationError(error: string): ValidationResult<never> {
  return { ok: false, error, error_kind: "validation" };
}
