/**
 * Server-side mirror of app/lib/task.ts.
 *
 * Keep the exported literal arrays aligned with the app substrate;
 * e2e/tasks-vocab-parity.spec.ts pins the task state vocabulary.
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

export type TaskState =
  | "pending"
  | "running"
  | "paused"
  | "ready-for-pr"
  | "in-pr"
  | "merged"
  | "abandoned"
  | "failed";

export interface TaskWorktree {
  path: string;
  branch: string;
  baseBranch: string;
  baseRevision: string;
  headRevision: string | null;
  createdAtMs: number;
}

export interface TaskStateChange {
  fromState: TaskState | null;
  toState: TaskState;
  actor: ActorKind;
  reason: string;
  timestampMs: number;
}

export interface Task {
  id: string;
  label: string;
  description: string | null;
  state: TaskState;
  worktree: TaskWorktree;
  originActor: ActorKind;
  agentActor: ActorKind;
  relatedBehaviorIds: readonly string[];
  prompt: string;
  requestId: string;
  stateHistory: readonly TaskStateChange[];
  prUrl: string | null;
  createdAtMs: number;
}

export type DispatchTaskRequest = {
  label: string;
  prompt: string;
  baseBranch: string | null;
  relatedBehaviorIds: readonly string[];
  requestId: string;
};

export type TransitionTaskRequest = {
  toState: TaskState;
  reason: string;
  actor: ActorKind;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; error_kind: "validation" };

export const TASK_ID_PATTERN = /^task:[a-zA-Z0-9._-]+$/;
export const BEHAVIOR_ID_PATTERN = /^behavior:[a-zA-Z0-9._-]+$/;

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

export const TASK_STATES = [
  "pending",
  "running",
  "paused",
  "ready-for-pr",
  "in-pr",
  "merged",
  "abandoned",
  "failed",
] as const satisfies readonly TaskState[];

const ACTOR_SET: ReadonlySet<string> = new Set(ALL_ACTORS);
const TASK_STATE_SET: ReadonlySet<string> = new Set(TASK_STATES);

export function actorFromString(value: string): ActorKind {
  if (ACTOR_SET.has(value)) return value as ActorKind;
  throw new Error(`Unknown actor kind: ${value}`);
}

export function taskStateFromString(value: string): TaskState {
  if (TASK_STATE_SET.has(value)) return value as TaskState;
  throw new Error(`Unknown task state: ${value}`);
}

export function validateDispatchTaskRequest(payload: unknown): ValidationResult<DispatchTaskRequest> {
  if (!payload || typeof payload !== "object") {
    return validationError("body must be an object");
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.label !== "string" || candidate.label.trim().length === 0) {
    return validationError("label must be a non-empty string");
  }
  if (typeof candidate.prompt !== "string" || candidate.prompt.trim().length === 0) {
    return validationError("prompt must be a non-empty string");
  }
  if (typeof candidate.request_id !== "string" || candidate.request_id.trim().length === 0) {
    return validationError("request_id must be a non-empty string");
  }
  if (candidate.base_branch !== undefined && typeof candidate.base_branch !== "string") {
    return validationError("base_branch must be a string when supplied");
  }
  if (typeof candidate.base_branch === "string" && candidate.base_branch.trim().length === 0) {
    return validationError("base_branch must be non-empty when supplied");
  }

  const relatedBehaviorIds = candidate.related_behavior_ids ?? [];
  if (!Array.isArray(relatedBehaviorIds)) {
    return validationError("related_behavior_ids must be an array when supplied");
  }

  const normalizedBehaviorIds: string[] = [];
  for (const [index, behaviorId] of relatedBehaviorIds.entries()) {
    if (typeof behaviorId !== "string" || !BEHAVIOR_ID_PATTERN.test(behaviorId)) {
      return validationError(
        `related_behavior_ids[${index}] must match ^behavior:[a-zA-Z0-9._-]+$`,
      );
    }
    normalizedBehaviorIds.push(behaviorId);
  }

  if (new Set(normalizedBehaviorIds).size !== normalizedBehaviorIds.length) {
    return validationError("related_behavior_ids must be unique");
  }

  return {
    ok: true,
    value: {
      label: candidate.label.trim(),
      prompt: candidate.prompt,
      baseBranch: candidate.base_branch?.trim() ?? null,
      relatedBehaviorIds: normalizedBehaviorIds,
      requestId: candidate.request_id,
    },
  };
}

export function validateTransitionTaskRequest(payload: unknown): ValidationResult<TransitionTaskRequest> {
  if (!payload || typeof payload !== "object") {
    return validationError("body must be an object");
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.to_state !== "string") {
    return validationError("to_state must be a TaskState");
  }

  let toState: TaskState;
  try {
    toState = taskStateFromString(candidate.to_state);
  } catch {
    return validationError("to_state must be a TaskState");
  }

  if (typeof candidate.reason !== "string" || candidate.reason.trim().length === 0) {
    return validationError("reason must be a non-empty string");
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
      toState,
      reason: candidate.reason,
      actor,
    },
  };
}

export function makeTask(partial: Task): Task {
  if (!TASK_ID_PATTERN.test(partial.id)) {
    throw new Error("Task id must match ^task:[a-zA-Z0-9._-]+$");
  }
  if (partial.label === "") {
    throw new Error("Task label must be non-empty");
  }

  taskStateFromString(partial.state);
  const worktree = makeTaskWorktree(partial.worktree);
  actorFromString(partial.originActor);
  actorFromString(partial.agentActor);

  const relatedBehaviorIds = [...partial.relatedBehaviorIds];
  if (new Set(relatedBehaviorIds).size !== relatedBehaviorIds.length) {
    throw new Error("Task relatedBehaviorIds must be unique");
  }
  for (const behaviorId of relatedBehaviorIds) {
    if (!BEHAVIOR_ID_PATTERN.test(behaviorId)) {
      throw new Error("Task relatedBehaviorIds must match ^behavior:[a-zA-Z0-9._-]+$");
    }
  }

  if (partial.prompt === "") {
    throw new Error("Task prompt must be non-empty");
  }
  if (partial.requestId === "") {
    throw new Error("Task requestId must be non-empty");
  }

  if (partial.stateHistory.length === 0) {
    throw new Error("Task stateHistory must be non-empty");
  }
  const stateHistory = partial.stateHistory.map((change) => makeTaskStateChange(change));
  if (stateHistory[stateHistory.length - 1].toState !== partial.state) {
    throw new Error("Task state must match the last stateHistory toState");
  }
  if (stateHistory[0].fromState !== null) {
    throw new Error("Task initial stateHistory entry must have no fromState");
  }

  if (partial.prUrl !== null && partial.state !== "in-pr" && partial.state !== "merged") {
    throw new Error("Task prUrl is only allowed for in-pr or merged tasks");
  }
  if (partial.createdAtMs < 0) {
    throw new Error("Task createdAtMs must be >= 0");
  }

  return {
    ...partial,
    worktree,
    relatedBehaviorIds,
    stateHistory,
  };
}

function makeTaskWorktree(partial: TaskWorktree): TaskWorktree {
  if (partial.path === "") throw new Error("TaskWorktree path must be non-empty");
  if (partial.branch === "") throw new Error("TaskWorktree branch must be non-empty");
  if (partial.baseBranch === "") throw new Error("TaskWorktree baseBranch must be non-empty");
  if (partial.baseRevision === "") throw new Error("TaskWorktree baseRevision must be non-empty");
  if (partial.headRevision !== null && partial.headRevision === "") {
    throw new Error("TaskWorktree headRevision must be non-empty or null");
  }
  if (partial.createdAtMs < 0) throw new Error("TaskWorktree createdAtMs must be >= 0");
  return { ...partial };
}

function makeTaskStateChange(partial: TaskStateChange): TaskStateChange {
  if (partial.fromState !== null) taskStateFromString(partial.fromState);
  taskStateFromString(partial.toState);
  if (partial.fromState === partial.toState) {
    throw new Error("TaskStateChange cannot record a same-state change");
  }
  actorFromString(partial.actor);
  if (partial.reason === "") throw new Error("TaskStateChange reason must be non-empty");
  if (partial.timestampMs < 0) throw new Error("TaskStateChange timestampMs must be >= 0");
  return { ...partial };
}

function validationError(error: string): ValidationResult<never> {
  return { ok: false, error, error_kind: "validation" };
}
