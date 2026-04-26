import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { taskStateFromString, type TaskState } from "../app/lib/task";

const SERVER_TASK_TYPES_PATH = resolve("server/tasks/types.ts");

const CONTRACT_TASK_STATES = [
  "pending",
  "running",
  "paused",
  "ready-for-pr",
  "in-pr",
  "merged",
  "abandoned",
  "failed",
] as const satisfies readonly TaskState[];

test("server task vocabulary stays in sync with app/lib/task.ts", async () => {
  expect(
    existsSync(SERVER_TASK_TYPES_PATH),
    "server/tasks/types.ts should exist for /api/tasks validation",
  ).toBe(true);

  const serverTaskTypes = await import(pathToFileURL(SERVER_TASK_TYPES_PATH).href);
  const serverTaskStates = exportedStringList(
    serverTaskTypes,
    "TaskState",
    CONTRACT_TASK_STATES,
  );

  expect(serverTaskStates).toEqual(CONTRACT_TASK_STATES);
  for (const state of serverTaskStates) {
    expect(taskStateFromString(state)).toBe(state);
  }
});

function exportedStringList(
  moduleExports: Record<string, unknown>,
  label: string,
  expectedValues: readonly string[],
) {
  const matchingExport = Object.entries(moduleExports).find(([, value]) => {
    return (
      Array.isArray(value) &&
      value.length === expectedValues.length &&
      value.every((item) => typeof item === "string") &&
      expectedValues.every((expectedValue) => value.includes(expectedValue))
    );
  });

  expect(
    matchingExport,
    `server/tasks/types.ts should export the ${label} string list`,
  ).toBeDefined();

  return matchingExport?.[1] as string[];
}
