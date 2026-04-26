import { actorFromString, type ActorKind } from "./actors";
import { BEHAVIOR_ID_PATTERN } from "./behavior";

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

export const TASK_ID_PATTERN = /^task:[a-zA-Z0-9._-]+$/;

const TASK_STATES = [
  "pending",
  "running",
  "paused",
  "ready-for-pr",
  "in-pr",
  "merged",
  "abandoned",
  "failed",
] as const satisfies readonly TaskState[];

const TASK_STATE_SET: ReadonlySet<string> = new Set(TASK_STATES);

export function taskStateFromString(value: string): TaskState {
  if (TASK_STATE_SET.has(value)) {
    return value as TaskState;
  }

  throw new Error(`Unknown task state: ${value}`);
}

function validateActor(actor: ActorKind, fieldName: string): void {
  try {
    actorFromString(actor);
  } catch (error) {
    throw new Error(`${fieldName} must be an ActorKind`, { cause: error });
  }
}

function makeTaskWorktree(partial: TaskWorktree): TaskWorktree {
  if (partial.path === "") {
    throw new Error("TaskWorktree path must be non-empty");
  }
  if (partial.branch === "") {
    throw new Error("TaskWorktree branch must be non-empty");
  }
  if (partial.baseBranch === "") {
    throw new Error("TaskWorktree baseBranch must be non-empty");
  }
  if (partial.baseRevision === "") {
    throw new Error("TaskWorktree baseRevision must be non-empty");
  }
  if (partial.headRevision !== null && partial.headRevision === "") {
    throw new Error("TaskWorktree headRevision must be non-empty or null");
  }
  if (partial.createdAtMs < 0) {
    throw new Error("TaskWorktree createdAtMs must be >= 0");
  }

  return { ...partial };
}

function makeTaskStateChange(partial: TaskStateChange): TaskStateChange {
  if (partial.fromState !== null) {
    taskStateFromString(partial.fromState);
  }
  taskStateFromString(partial.toState);
  if (partial.fromState === partial.toState) {
    throw new Error("TaskStateChange cannot record a same-state change");
  }

  validateActor(partial.actor, "TaskStateChange actor");
  if (partial.reason === "") {
    throw new Error("TaskStateChange reason must be non-empty");
  }
  if (partial.timestampMs < 0) {
    throw new Error("TaskStateChange timestampMs must be >= 0");
  }

  return { ...partial };
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
  validateActor(partial.originActor, "Task originActor");
  validateActor(partial.agentActor, "Task agentActor");

  const relatedBehaviorIds = [...partial.relatedBehaviorIds];
  if (new Set(relatedBehaviorIds).size !== relatedBehaviorIds.length) {
    throw new Error("Task relatedBehaviorIds must be unique");
  }
  for (const behaviorId of relatedBehaviorIds) {
    if (!BEHAVIOR_ID_PATTERN.test(behaviorId)) {
      throw new Error(
        "Task relatedBehaviorIds must match ^behavior:[a-zA-Z0-9._-]+$",
      );
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
  const stateHistory = partial.stateHistory.map((stateChange) =>
    makeTaskStateChange(stateChange),
  );
  if (stateHistory[stateHistory.length - 1].toState !== partial.state) {
    throw new Error("Task state must match the last stateHistory toState");
  }
  if (stateHistory[0].fromState !== null) {
    throw new Error("Task initial stateHistory entry must have no fromState");
  }

  if (
    partial.prUrl !== null &&
    partial.state !== "in-pr" &&
    partial.state !== "merged"
  ) {
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
