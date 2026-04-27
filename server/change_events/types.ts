/**
 * Server-side mirror of app/lib/user-context.ts.
 *
 * Keep these literals aligned with the H.1 substrate. The server validates
 * route payloads here before dispatching to the shared classifier/evaluator.
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

export type OpenedSurfaceKind =
  | "diagram"
  | "panel"
  | "behaviour-card"
  | "slice"
  | "task"
  | "pr-delta";

export type ChangeEventKind =
  | "entity-added"
  | "entity-removed"
  | "entity-reshaped"
  | "entity-renamed"
  | "entity-split"
  | "entity-merged"
  | "entity-unmatched"
  | "provider-sync"
  | "task-state-change"
  | "review-thread-update"
  | "agents-runtime-health"
  | "ci-run-finished";

export type ChangeEventTier = "immediate" | "stashed" | "suppressed";
export type ChangeEventDisposition = "disposed_to_immediate" | "dismissed";

export interface OpenedSurface {
  kind: OpenedSurfaceKind;
  entityId: string;
  openedAtMs: number;
  lastFocusedAtMs: number;
  totalDwellMs: number;
}

export interface RecentPromptSummary {
  requestId: string;
  mode: string;
  surfaceAnchor: string;
  selectionCount: number;
  issuedAtMs: number;
}

export interface UserContext {
  id: string;
  openedSurfaces: readonly OpenedSurface[];
  recentPrompts: readonly RecentPromptSummary[];
  activeTaskIds: readonly string[];
  activeSliceIds: readonly string[];
  autoMotionDisabled: boolean;
  computedAtMs: number;
}

export interface ChangeEvent {
  id: string;
  kind: ChangeEventKind;
  actor: ActorKind;
  affectedEntityIds: readonly string[];
  affectedKinds: readonly string[];
  tier: ChangeEventTier;
  blocking: boolean;
  timestampMs: number;
  contextSummary: string;
  detailUrl: string | null;
}

export interface StoredChangeEvent extends ChangeEvent {
  userContextId: string;
  disposition?: ChangeEventDisposition;
  disposedAtMs?: number;
}

export type ChangeEventInput = Omit<ChangeEvent, "tier"> & {
  tier?: ChangeEventTier;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; error_kind: "validation" };

export const USER_CONTEXT_ID_PATTERN = /^user-context:[a-zA-Z0-9._-]+$/;
export const CHANGE_EVENT_ID_PATTERN = /^change:[a-zA-Z0-9._-]+$/;
export const TASK_ID_PATTERN = /^task:[a-zA-Z0-9._-]+$/;
export const SLICE_ID_PATTERN = /^slice:[a-zA-Z0-9._-]+$/;

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

export const OPENED_SURFACE_KINDS = [
  "diagram",
  "panel",
  "behaviour-card",
  "slice",
  "task",
  "pr-delta",
] as const satisfies readonly OpenedSurfaceKind[];

export const CHANGE_EVENT_KINDS = [
  "entity-added",
  "entity-removed",
  "entity-reshaped",
  "entity-renamed",
  "entity-split",
  "entity-merged",
  "entity-unmatched",
  "provider-sync",
  "task-state-change",
  "review-thread-update",
  "agents-runtime-health",
  "ci-run-finished",
] as const satisfies readonly ChangeEventKind[];

export const CHANGE_EVENT_TIERS = [
  "immediate",
  "stashed",
  "suppressed",
] as const satisfies readonly ChangeEventTier[];

export const CHANGE_EVENT_DISPOSITIONS = [
  "disposed_to_immediate",
  "dismissed",
] as const satisfies readonly ChangeEventDisposition[];

const ACTOR_SET: ReadonlySet<string> = new Set(ALL_ACTORS);
const OPENED_SURFACE_KIND_SET: ReadonlySet<string> = new Set(OPENED_SURFACE_KINDS);
const CHANGE_EVENT_KIND_SET: ReadonlySet<string> = new Set(CHANGE_EVENT_KINDS);
const CHANGE_EVENT_TIER_SET: ReadonlySet<string> = new Set(CHANGE_EVENT_TIERS);
const CHANGE_EVENT_DISPOSITION_SET: ReadonlySet<string> = new Set(
  CHANGE_EVENT_DISPOSITIONS,
);

export function actorFromString(value: string): ActorKind {
  if (ACTOR_SET.has(value)) return value as ActorKind;
  throw new Error(`Unknown actor kind: ${value}`);
}

export function openedSurfaceKindFromString(value: string): OpenedSurfaceKind {
  if (OPENED_SURFACE_KIND_SET.has(value)) return value as OpenedSurfaceKind;
  throw new Error(`Unknown opened surface kind: ${value}`);
}

export function changeEventKindFromString(value: string): ChangeEventKind {
  if (CHANGE_EVENT_KIND_SET.has(value)) return value as ChangeEventKind;
  throw new Error(`Unknown change event kind: ${value}`);
}

export function changeEventTierFromString(value: string): ChangeEventTier {
  if (CHANGE_EVENT_TIER_SET.has(value)) return value as ChangeEventTier;
  throw new Error(`Unknown change event tier: ${value}`);
}

export function changeEventDispositionFromString(
  value: string,
): ChangeEventDisposition {
  if (CHANGE_EVENT_DISPOSITION_SET.has(value)) {
    return value as ChangeEventDisposition;
  }
  throw new Error(`Unknown change event disposition: ${value}`);
}

export function validateUserContextId(value: unknown): ValidationResult<string> {
  if (typeof value !== "string" || !USER_CONTEXT_ID_PATTERN.test(value)) {
    return validationError(
      "user_context_id must match ^user-context:[a-zA-Z0-9._-]+$",
    );
  }
  return { ok: true, value };
}

export function validateChangeEventInput(
  payload: unknown,
): ValidationResult<ChangeEventInput> {
  if (!payload || typeof payload !== "object") {
    return validationError("event must be an object");
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !CHANGE_EVENT_ID_PATTERN.test(candidate.id)) {
    return validationError("event.id must match ^change:[a-zA-Z0-9._-]+$");
  }

  if (typeof candidate.kind !== "string") {
    return validationError("event.kind must be a ChangeEventKind");
  }

  let kind: ChangeEventKind;
  try {
    kind = changeEventKindFromString(candidate.kind);
  } catch {
    return validationError("event.kind must be a ChangeEventKind");
  }

  if (typeof candidate.actor !== "string") {
    return validationError("event.actor must be an ActorKind");
  }

  let actor: ActorKind;
  try {
    actor = actorFromString(candidate.actor);
  } catch {
    return validationError("event.actor must be an ActorKind");
  }

  const affectedEntityIds = stringArray(candidate.affectedEntityIds);
  if (!affectedEntityIds || affectedEntityIds.length === 0) {
    return validationError("event.affectedEntityIds must be a non-empty string array");
  }

  const affectedKinds = stringArray(candidate.affectedKinds);
  if (!affectedKinds || affectedKinds.length !== affectedEntityIds.length) {
    return validationError(
      "event.affectedKinds must be a string array matching affectedEntityIds",
    );
  }

  if (typeof candidate.blocking !== "boolean") {
    return validationError("event.blocking must be a boolean");
  }

  if (!isNonNegativeFiniteNumber(candidate.timestampMs)) {
    return validationError("event.timestampMs must be a non-negative number");
  }

  if (
    typeof candidate.contextSummary !== "string" ||
    candidate.contextSummary.trim().length === 0
  ) {
    return validationError("event.contextSummary must be a non-empty string");
  }

  if (candidate.detailUrl !== null && typeof candidate.detailUrl !== "string") {
    return validationError("event.detailUrl must be a string or null");
  }

  if (candidate.tier !== undefined && typeof candidate.tier !== "string") {
    return validationError("event.tier must be a ChangeEventTier when supplied");
  }

  let tier: ChangeEventTier | undefined;
  if (typeof candidate.tier === "string") {
    try {
      tier = changeEventTierFromString(candidate.tier);
    } catch {
      return validationError("event.tier must be a ChangeEventTier when supplied");
    }
  }

  return {
    ok: true,
    value: {
      id: candidate.id,
      kind,
      actor,
      affectedEntityIds,
      affectedKinds,
      blocking: candidate.blocking,
      timestampMs: Math.floor(candidate.timestampMs),
      contextSummary: candidate.contextSummary.trim(),
      detailUrl: candidate.detailUrl,
      ...(tier ? { tier } : {}),
    },
  };
}

export function validateUserContextPatch(
  id: string,
  payload: unknown,
  existing?: UserContext,
): ValidationResult<UserContext> {
  if (!USER_CONTEXT_ID_PATTERN.test(id)) {
    return validationError("id must match ^user-context:[a-zA-Z0-9._-]+$");
  }
  if (!payload || typeof payload !== "object") {
    return validationError("body must be an object");
  }

  const candidate = payload as Record<string, unknown>;
  if (candidate.id !== undefined && candidate.id !== id) {
    return validationError("body.id must match route id when supplied");
  }

  const base = existing ?? emptyUserContext(id);
  const merged = { ...base, ...candidate, id };

  const openedSurfaces = validateOpenedSurfaces(merged.openedSurfaces);
  if (!openedSurfaces.ok) return openedSurfaces;

  const recentPrompts = validateRecentPrompts(merged.recentPrompts);
  if (!recentPrompts.ok) return recentPrompts;

  const activeTaskIds = stringArray(merged.activeTaskIds);
  if (!activeTaskIds || activeTaskIds.some((taskId) => !TASK_ID_PATTERN.test(taskId))) {
    return validationError("activeTaskIds must be task ids");
  }

  const activeSliceIds = stringArray(merged.activeSliceIds);
  if (
    !activeSliceIds ||
    activeSliceIds.some((sliceId) => !SLICE_ID_PATTERN.test(sliceId))
  ) {
    return validationError("activeSliceIds must be slice ids");
  }

  if (typeof merged.autoMotionDisabled !== "boolean") {
    return validationError("autoMotionDisabled must be a boolean");
  }

  if (!isNonNegativeFiniteNumber(merged.computedAtMs)) {
    return validationError("computedAtMs must be a non-negative number");
  }

  return {
    ok: true,
    value: {
      id,
      openedSurfaces: dedupeOpenedSurfaces(openedSurfaces.value),
      recentPrompts: dedupeRecentPrompts(recentPrompts.value),
      activeTaskIds: [...new Set(activeTaskIds)],
      activeSliceIds: [...new Set(activeSliceIds)],
      autoMotionDisabled: merged.autoMotionDisabled,
      computedAtMs: Math.floor(merged.computedAtMs),
    },
  };
}

export function validateDisposeRequest(payload: unknown): ValidationResult<{
  disposition: ChangeEventDisposition;
  userContextId: string;
  requestId: string;
}> {
  if (!payload || typeof payload !== "object") {
    return validationError("body must be an object");
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.disposition !== "string") {
    return validationError("disposition must be a ChangeEventDisposition");
  }

  let disposition: ChangeEventDisposition;
  try {
    disposition = changeEventDispositionFromString(candidate.disposition);
  } catch {
    return validationError("disposition must be a ChangeEventDisposition");
  }

  const userContextId = validateUserContextId(candidate.user_context_id);
  if (!userContextId.ok) return userContextId;

  const requestId =
    typeof candidate.request_id === "string" && candidate.request_id.length > 0
      ? candidate.request_id
      : "-";

  return {
    ok: true,
    value: { disposition, userContextId: userContextId.value, requestId },
  };
}

export function emptyUserContext(id: string, nowMs = Date.now()): UserContext {
  return {
    id,
    openedSurfaces: [],
    recentPrompts: [],
    activeTaskIds: [],
    activeSliceIds: [],
    autoMotionDisabled: false,
    computedAtMs: nowMs,
  };
}

function validateOpenedSurfaces(payload: unknown): ValidationResult<OpenedSurface[]> {
  if (!Array.isArray(payload)) {
    return validationError("openedSurfaces must be an array");
  }

  const openedSurfaces: OpenedSurface[] = [];
  for (const [index, value] of payload.entries()) {
    if (!value || typeof value !== "object") {
      return validationError(`openedSurfaces[${index}] must be an object`);
    }

    const surface = value as Record<string, unknown>;
    if (typeof surface.kind !== "string") {
      return validationError(`openedSurfaces[${index}].kind must be valid`);
    }

    let kind: OpenedSurfaceKind;
    try {
      kind = openedSurfaceKindFromString(surface.kind);
    } catch {
      return validationError(`openedSurfaces[${index}].kind must be valid`);
    }

    if (typeof surface.entityId !== "string" || surface.entityId.length === 0) {
      return validationError(`openedSurfaces[${index}].entityId must be non-empty`);
    }

    for (const field of ["openedAtMs", "lastFocusedAtMs", "totalDwellMs"] as const) {
      if (!isNonNegativeFiniteNumber(surface[field])) {
        return validationError(`openedSurfaces[${index}].${field} must be non-negative`);
      }
    }

    if (surface.lastFocusedAtMs < surface.openedAtMs) {
      return validationError(
        `openedSurfaces[${index}].lastFocusedAtMs must be >= openedAtMs`,
      );
    }

    openedSurfaces.push({
      kind,
      entityId: surface.entityId,
      openedAtMs: Math.floor(surface.openedAtMs),
      lastFocusedAtMs: Math.floor(surface.lastFocusedAtMs),
      totalDwellMs: Math.floor(surface.totalDwellMs),
    });
  }

  return { ok: true, value: openedSurfaces };
}

function validateRecentPrompts(payload: unknown): ValidationResult<RecentPromptSummary[]> {
  if (!Array.isArray(payload)) {
    return validationError("recentPrompts must be an array");
  }

  const prompts: RecentPromptSummary[] = [];
  for (const [index, value] of payload.entries()) {
    if (!value || typeof value !== "object") {
      return validationError(`recentPrompts[${index}] must be an object`);
    }

    const prompt = value as Record<string, unknown>;
    if (typeof prompt.requestId !== "string" || prompt.requestId.length === 0) {
      return validationError(`recentPrompts[${index}].requestId must be non-empty`);
    }
    if (typeof prompt.mode !== "string" || prompt.mode.length === 0) {
      return validationError(`recentPrompts[${index}].mode must be non-empty`);
    }
    if (
      typeof prompt.surfaceAnchor !== "string" ||
      prompt.surfaceAnchor.length === 0
    ) {
      return validationError(`recentPrompts[${index}].surfaceAnchor must be non-empty`);
    }
    if (!Number.isInteger(prompt.selectionCount) || prompt.selectionCount < 0) {
      return validationError(
        `recentPrompts[${index}].selectionCount must be a non-negative integer`,
      );
    }
    if (!isNonNegativeFiniteNumber(prompt.issuedAtMs)) {
      return validationError(`recentPrompts[${index}].issuedAtMs must be non-negative`);
    }

    prompts.push({
      requestId: prompt.requestId,
      mode: prompt.mode,
      surfaceAnchor: prompt.surfaceAnchor,
      selectionCount: prompt.selectionCount,
      issuedAtMs: Math.floor(prompt.issuedAtMs),
    });
  }

  return { ok: true, value: prompts };
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.some((item) => typeof item !== "string" || item.length === 0)) {
    return null;
  }
  return [...value];
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function dedupeOpenedSurfaces(openedSurfaces: readonly OpenedSurface[]): OpenedSurface[] {
  const byKey = new Map<string, OpenedSurface>();
  for (const surface of openedSurfaces) {
    const key = `${surface.kind}\0${surface.entityId}`;
    const existing = byKey.get(key);
    if (!existing || surface.lastFocusedAtMs >= existing.lastFocusedAtMs) {
      byKey.set(key, surface);
    }
  }
  return [...byKey.values()];
}

function dedupeRecentPrompts(
  recentPrompts: readonly RecentPromptSummary[],
): RecentPromptSummary[] {
  const byRequestId = new Map<string, RecentPromptSummary>();
  for (const prompt of recentPrompts) {
    const existing = byRequestId.get(prompt.requestId);
    if (!existing || prompt.issuedAtMs >= existing.issuedAtMs) {
      byRequestId.set(prompt.requestId, prompt);
    }
  }
  return [...byRequestId.values()].sort((left, right) => right.issuedAtMs - left.issuedAtMs);
}

function validationError(error: string): ValidationResult<never> {
  return { ok: false, error, error_kind: "validation" };
}
