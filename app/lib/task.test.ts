import { expect, test } from "@playwright/test";

import type { ActorKind } from "./actors";
import {
  TASK_ID_PATTERN,
  makeTask,
  taskStateFromString,
  type Task,
  type TaskState,
} from "./task";

const CONTRACT_TASK_STATES = [
  ["PENDING", "pending"],
  ["RUNNING", "running"],
  ["PAUSED", "paused"],
  ["READY_FOR_PR", "ready-for-pr"],
  ["IN_PR", "in-pr"],
  ["MERGED", "merged"],
  ["ABANDONED", "abandoned"],
  ["FAILED", "failed"],
] as const satisfies readonly (readonly [string, TaskState])[];

const CONTRACT_TASK_STATE_VALUES = CONTRACT_TASK_STATES.map(([, state]) => state);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type ContractTaskState = (typeof CONTRACT_TASK_STATES)[number][1];
type _TaskStateMembership = Assert<Equal<TaskState, ContractTaskState>>;

const describe = test.describe;
const it = test;

function task(overrides: Partial<Task> = {}): Task {
  const state = overrides.state ?? "pending";

  return makeTask({
    id: "task:t1",
    label: "Update login behavior",
    description: "Revise the login flow implementation.",
    state,
    worktree: {
      path: "/workspace/worktrees/task-t1",
      branch: "task/t1",
      baseBranch: "main",
      baseRevision: "abc123",
      headRevision: null,
      createdAtMs: 1_700_000_000_000,
    },
    originActor: "you-this-session",
    agentActor: "agents:direct",
    relatedBehaviorIds: ["behavior:auth.login"],
    prompt: "Update the login behavior.",
    requestId: "req-123",
    stateHistory: [
      {
        fromState: null,
        toState: state,
        actor: "agents:direct",
        reason: "Task dispatched.",
        timestampMs: 1_700_000_000_000,
      },
    ],
    prUrl: null,
    createdAtMs: 1_700_000_000_000,
    ...overrides,
  });
}

describe("Task schema contract", () => {
  for (const [memberName, stateValue] of CONTRACT_TASK_STATES) {
    it(`contains contract task state ${memberName} with stable string value ${stateValue}`, () => {
      expect(taskStateFromString(stateValue)).toBe(stateValue);
    });
  }

  it("contains exactly the 8 contract task states", () => {
    expect(CONTRACT_TASK_STATE_VALUES).toHaveLength(8);
    expect(new Set(CONTRACT_TASK_STATE_VALUES).size).toBe(8);
  });

  it("throws instead of silently accepting unknown task state strings", () => {
    for (const invalidValue of [
      "",
      "ready_for_pr",
      "READY_FOR_PR",
      "ready-for-pr ",
      "complete",
      "in_pr",
    ]) {
      expect(
        () => taskStateFromString(invalidValue),
        `taskStateFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("rejects invalid TaskWorktree values", () => {
    for (const worktree of [
      { path: "" },
      { branch: "" },
      { baseBranch: "" },
      { baseRevision: "" },
      { createdAtMs: -1 },
    ] satisfies readonly Partial<Task["worktree"]>[]) {
      expect(() =>
        task({
          worktree: {
            path: "/workspace/worktrees/task-t1",
            branch: "task/t1",
            baseBranch: "main",
            baseRevision: "abc123",
            headRevision: null,
            createdAtMs: 1_700_000_000_000,
            ...worktree,
          },
        }),
      ).toThrow();
    }
  });

  it("rejects invalid TaskStateChange values", () => {
    for (const stateHistory of [
      [
        {
          fromState: null,
          toState: "pending",
          actor: "agents:direct",
          reason: "Task dispatched.",
          timestampMs: 1_700_000_000_000,
        },
        {
          fromState: "running",
          toState: "running",
          actor: "agents:direct",
          reason: "Task was re-dispatched.",
          timestampMs: 1_700_000_000_001,
        },
      ],
      [
        {
          fromState: null,
          toState: "pending",
          actor: "agents:direct",
          reason: "",
          timestampMs: 1_700_000_000_000,
        },
      ],
      [
        {
          fromState: null,
          toState: null,
          actor: "agents:direct",
          reason: "Task dispatched.",
          timestampMs: 1_700_000_000_000,
        },
      ],
    ] as const) {
      expect(() =>
        task({
          state: stateHistory[stateHistory.length - 1].toState as TaskState,
          stateHistory: stateHistory as unknown as Task["stateHistory"],
        }),
      ).toThrow();
    }
  });

  it("rejects invalid Task values", () => {
    for (const overrides of [
      { id: "" },
      { id: "t1" },
      { id: "task:" },
      { id: "task:has spaces" },
      { label: "" },
      { prompt: "" },
      { requestId: "" },
      { stateHistory: [] },
      {
        state: "running",
        stateHistory: [
          {
            fromState: null,
            toState: "pending",
            actor: "agents:direct",
            reason: "Task dispatched.",
            timestampMs: 1_700_000_000_000,
          },
        ],
      },
      {
        stateHistory: [
          {
            fromState: "running",
            toState: "pending",
            actor: "agents:direct",
            reason: "Task dispatched.",
            timestampMs: 1_700_000_000_000,
          },
        ],
      },
      { state: "ready-for-pr", prUrl: "https://example.com/pr/1" },
      { relatedBehaviorIds: ["behavior:auth.login", "behavior:auth.login"] },
      { relatedBehaviorIds: ["auth.login"] },
      { relatedBehaviorIds: ["behavior:"] },
      { createdAtMs: -1 },
    ] satisfies readonly Partial<Task>[]) {
      expect(() => task(overrides)).toThrow();
    }
  });

  it("accepts pr urls for pr states", () => {
    for (const state of ["in-pr", "merged"] as const satisfies readonly TaskState[]) {
      expect(
        task({
          state,
          stateHistory: [
            {
              fromState: null,
              toState: state,
              actor: "agents:direct",
              reason: "Task reached pr state.",
              timestampMs: 1_700_000_000_000,
            },
          ],
          prUrl: "https://github.com/example/repo/pull/1",
        }).prUrl,
      ).toBe("https://github.com/example/repo/pull/1");
    }
  });

  for (const taskId of ["task:t1", "task:my-task.123_alpha"]) {
    it(`accepts contract task id ${taskId}`, () => {
      expect(TASK_ID_PATTERN.test(taskId)).toBe(true);
      expect(task({ id: taskId }).id).toBe(taskId);
    });
  }

  for (const taskId of ["t1", "task:", "task:has spaces"]) {
    it(`rejects contract-invalid task id ${taskId}`, () => {
      expect(TASK_ID_PATTERN.test(taskId)).toBe(false);
      expect(() => task({ id: taskId })).toThrow();
    });
  }

  it("rejects non-registry actors on state changes", () => {
    expect(() =>
      task({
        stateHistory: [
          {
            fromState: null,
            toState: "pending",
            actor: "not-a-real-actor" as ActorKind,
            reason: "Task dispatched.",
            timestampMs: 1_700_000_000_000,
          },
        ],
      }),
    ).toThrow();
  });
});
