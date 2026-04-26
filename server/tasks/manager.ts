import { randomUUID } from "node:crypto";
import type { DispatchTaskRequest, Task, TaskState, TransitionTaskRequest } from "./types";
import { makeTask } from "./types";
import {
  addWorktree,
  currentBranch,
  GitCommandError,
  headRevision,
  removeWorktree,
  revParse,
} from "./worktree";

export type TaskErrorKind =
  | "validation"
  | "git"
  | "worktree"
  | "internal"
  | "not-found"
  | "invalid-transition";

export class TaskManagerError extends Error {
  readonly errorKind: TaskErrorKind;

  constructor(errorKind: TaskErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TaskManagerError";
    this.errorKind = errorKind;
  }
}

export type TaskManager = {
  dispatch(request: DispatchTaskRequest): Task;
  list(): readonly Task[];
  get(id: string): Task | null;
  transition(id: string, request: TransitionTaskRequest): Promise<Task>;
};

const TRANSITIONS: Readonly<Record<TaskState, ReadonlySet<TaskState>>> = Object.freeze({
  pending: new Set(["running", "abandoned", "failed"]),
  running: new Set(["paused", "ready-for-pr", "failed", "abandoned"]),
  paused: new Set(["running", "abandoned"]),
  "ready-for-pr": new Set(["in-pr", "abandoned"]),
  "in-pr": new Set(["merged", "abandoned"]),
  merged: new Set(),
  abandoned: new Set(),
  failed: new Set(["abandoned"]),
});

export function createTaskManager(workspaceRoot: string): TaskManager {
  const tasks = new Map<string, Task>();

  return {
    dispatch(request: DispatchTaskRequest): Task {
      const createdAtMs = Date.now();
      const id = buildTaskId();
      const baseBranch = request.baseBranch ?? resolveCurrentBranch(workspaceRoot);
      const branch = buildBranchName(request.label, createdAtMs);

      try {
        revParse(workspaceRoot, baseBranch);
      } catch (error) {
        throw new TaskManagerError(
          "validation",
          `base_branch does not exist: ${baseBranch}`,
          { cause: error },
        );
      }

      let worktree;
      try {
        worktree = addWorktree({
          workspaceRoot,
          taskId: id,
          branch,
          base: baseBranch,
        });
      } catch (error) {
        throw new TaskManagerError(
          "worktree",
          errorMessage(error, "failed to create task worktree"),
          { cause: error },
        );
      }

      const task = makeTask({
        id,
        label: request.label,
        description: null,
        state: "pending",
        worktree: {
          path: worktree.path,
          branch,
          baseBranch,
          baseRevision: worktree.baseRevision,
          headRevision: null,
          createdAtMs,
        },
        originActor: "you-this-session",
        agentActor: "agents:direct",
        relatedBehaviorIds: request.relatedBehaviorIds,
        prompt: request.prompt,
        requestId: request.requestId,
        stateHistory: [
          {
            fromState: null,
            toState: "pending",
            actor: "you-this-session",
            reason: "task dispatched",
            timestampMs: createdAtMs,
          },
        ],
        prUrl: null,
        createdAtMs,
      });

      tasks.set(id, task);
      return task;
    },

    list(): readonly Task[] {
      return Array.from(tasks.values());
    },

    get(id: string): Task | null {
      return tasks.get(id) ?? null;
    },

    async transition(id: string, request: TransitionTaskRequest): Promise<Task> {
      const task = tasks.get(id);
      if (!task) {
        throw new TaskManagerError("not-found", "not found");
      }

      const allowed = TRANSITIONS[task.state];
      if (!allowed.has(request.toState)) {
        throw new TaskManagerError(
          "invalid-transition",
          `invalid transition from ${task.state} to ${request.toState}`,
        );
      }

      if (request.toState === "abandoned") {
        try {
          await removeWorktree(
            workspaceRoot,
            task.worktree.path,
            task.worktree.branch,
            task.worktree.baseRevision,
          );
        } catch (error) {
          throw new TaskManagerError(
            "worktree",
            errorMessage(error, "failed to remove task worktree"),
            { cause: error },
          );
        }
      }

      const updated = makeTask({
        ...task,
        state: request.toState,
        worktree: {
          ...task.worktree,
          headRevision: resolveHeadRevision(workspaceRoot, task.worktree.branch, request.toState),
        },
        stateHistory: [
          ...task.stateHistory,
          {
            fromState: task.state,
            toState: request.toState,
            actor: request.actor,
            reason: request.reason,
            timestampMs: Date.now(),
          },
        ],
      });

      tasks.set(id, updated);
      return updated;
    },
  };
}

function buildTaskId(): string {
  return `task:auto-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function buildBranchName(label: string, timestampMs: number): string {
  return `task/${slugify(label)}-${timestampMs}`;
}

function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return slug || "task";
}

function resolveCurrentBranch(workspaceRoot: string): string {
  try {
    return currentBranch(workspaceRoot);
  } catch (error) {
    throw new TaskManagerError("git", "failed to resolve current branch", { cause: error });
  }
}

function resolveHeadRevision(
  workspaceRoot: string,
  branch: string,
  state: TaskState,
): string | null {
  if (state === "abandoned") return null;

  try {
    return headRevision(workspaceRoot, branch);
  } catch {
    return null;
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof GitCommandError && error.stderr) return error.stderr;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
