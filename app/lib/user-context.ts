import { actorFromString, type ActorKind } from "./actors";
import { SLICE_ID_PATTERN } from "./slice";
import { TASK_ID_PATTERN } from "./task";

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

export const USER_CONTEXT_ID_PATTERN = /^user-context:[a-zA-Z0-9._-]+$/;
export const CHANGE_EVENT_ID_PATTERN = /^change:[a-zA-Z0-9._-]+$/;

const OPENED_SURFACE_KINDS = [
  "diagram",
  "panel",
  "behaviour-card",
  "slice",
  "task",
  "pr-delta",
] as const satisfies readonly OpenedSurfaceKind[];

const CHANGE_EVENT_KINDS = [
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

const CHANGE_EVENT_TIERS = [
  "immediate",
  "stashed",
  "suppressed",
] as const satisfies readonly ChangeEventTier[];

const OPENED_SURFACE_KIND_SET: ReadonlySet<string> = new Set(OPENED_SURFACE_KINDS);
const CHANGE_EVENT_KIND_SET: ReadonlySet<string> = new Set(CHANGE_EVENT_KINDS);
const CHANGE_EVENT_TIER_SET: ReadonlySet<string> = new Set(CHANGE_EVENT_TIERS);

export function openedSurfaceKindFromString(value: string): OpenedSurfaceKind {
  if (OPENED_SURFACE_KIND_SET.has(value)) {
    return value as OpenedSurfaceKind;
  }

  throw new Error(`Unknown opened surface kind: ${value}`);
}

export function changeEventKindFromString(value: string): ChangeEventKind {
  if (CHANGE_EVENT_KIND_SET.has(value)) {
    return value as ChangeEventKind;
  }

  throw new Error(`Unknown change event kind: ${value}`);
}

export function changeEventTierFromString(value: string): ChangeEventTier {
  if (CHANGE_EVENT_TIER_SET.has(value)) {
    return value as ChangeEventTier;
  }

  throw new Error(`Unknown change event tier: ${value}`);
}

export function makeOpenedSurface(partial: OpenedSurface): OpenedSurface {
  openedSurfaceKindFromString(partial.kind);

  if (partial.entityId === "") {
    throw new Error("OpenedSurface entityId must be non-empty");
  }
  if (partial.openedAtMs < 0) {
    throw new Error("OpenedSurface openedAtMs must be >= 0");
  }
  if (partial.lastFocusedAtMs < partial.openedAtMs) {
    throw new Error("OpenedSurface lastFocusedAtMs must be >= openedAtMs");
  }
  if (partial.totalDwellMs < 0) {
    throw new Error("OpenedSurface totalDwellMs must be >= 0");
  }

  return { ...partial };
}

export function makeUserContext(partial: UserContext): UserContext {
  if (!USER_CONTEXT_ID_PATTERN.test(partial.id)) {
    throw new Error(
      "UserContext id must match ^user-context:[a-zA-Z0-9._-]+$",
    );
  }

  const openedSurfaces = dedupeOpenedSurfaces(
    partial.openedSurfaces.map((surface) => makeOpenedSurface(surface)),
  );
  const recentPrompts = dedupeRecentPrompts(partial.recentPrompts);
  const activeTaskIds = [...new Set(partial.activeTaskIds)];
  for (const taskId of activeTaskIds) {
    if (!TASK_ID_PATTERN.test(taskId)) {
      throw new Error(
        "UserContext activeTaskIds must match ^task:[a-zA-Z0-9._-]+$",
      );
    }
  }

  const activeSliceIds = [...new Set(partial.activeSliceIds)];
  for (const sliceId of activeSliceIds) {
    if (!SLICE_ID_PATTERN.test(sliceId)) {
      throw new Error(
        "UserContext activeSliceIds must match ^slice:[a-zA-Z0-9._-]+$",
      );
    }
  }

  if (partial.computedAtMs < 0) {
    throw new Error("UserContext computedAtMs must be >= 0");
  }

  return {
    ...partial,
    openedSurfaces,
    recentPrompts,
    activeTaskIds,
    activeSliceIds,
  };
}

export function makeChangeEvent(partial: ChangeEvent): ChangeEvent {
  if (!CHANGE_EVENT_ID_PATTERN.test(partial.id)) {
    throw new Error("ChangeEvent id must match ^change:[a-zA-Z0-9._-]+$");
  }
  changeEventKindFromString(partial.kind);
  validateActor(partial.actor, "ChangeEvent actor");

  const affectedEntityIds = [...partial.affectedEntityIds];
  if (affectedEntityIds.length === 0) {
    throw new Error("ChangeEvent affectedEntityIds must be non-empty");
  }

  const affectedKinds = [...partial.affectedKinds];
  if (affectedEntityIds.length !== affectedKinds.length) {
    throw new Error(
      "ChangeEvent affectedEntityIds and affectedKinds must have equal length",
    );
  }

  changeEventTierFromString(partial.tier);
  if (partial.blocking && partial.tier !== "immediate") {
    throw new Error("ChangeEvent blocking events must be immediate");
  }
  if (partial.timestampMs < 0) {
    throw new Error("ChangeEvent timestampMs must be >= 0");
  }
  if (partial.contextSummary === "") {
    throw new Error("ChangeEvent contextSummary must be non-empty");
  }

  return {
    ...partial,
    affectedEntityIds,
    affectedKinds,
  };
}

function validateActor(actor: ActorKind, fieldName: string): void {
  try {
    actorFromString(actor);
  } catch (error) {
    throw new Error(`${fieldName} must be an ActorKind`, { cause: error });
  }
}

function dedupeOpenedSurfaces(
  openedSurfaces: readonly OpenedSurface[],
): OpenedSurface[] {
  const byKey = new Map<string, OpenedSurface>();

  for (const surface of openedSurfaces) {
    const key = `${surface.kind}\0${surface.entityId}`;
    const existing = byKey.get(key);
    if (
      existing === undefined ||
      surface.lastFocusedAtMs >= existing.lastFocusedAtMs
    ) {
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
    if (existing === undefined || prompt.issuedAtMs >= existing.issuedAtMs) {
      byRequestId.set(prompt.requestId, { ...prompt });
    }
  }

  return [...byRequestId.values()];
}
