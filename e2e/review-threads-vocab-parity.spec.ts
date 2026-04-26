import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  threadSideFromString,
  threadStatusFromString,
  verdictDecisionFromString,
  type ThreadSide,
  type ThreadStatus,
  type VerdictDecision,
} from "../app/lib/review-thread";

const SERVER_REVIEW_THREAD_TYPES_PATH = resolve("server/review_threads/types.ts");

const CONTRACT_THREAD_STATUS_VALUES = [
  "open",
  "resolved",
  "dismissed",
  "frozen",
] as const satisfies readonly ThreadStatus[];

const CONTRACT_THREAD_SIDE_VALUES = [
  "base",
  "head",
] as const satisfies readonly ThreadSide[];

const CONTRACT_VERDICT_DECISION_VALUES = [
  "approved",
  "changes-requested",
  "rejected",
] as const satisfies readonly VerdictDecision[];

test("server review thread vocabulary stays in sync with app/lib/review-thread.ts", async () => {
  expect(
    existsSync(SERVER_REVIEW_THREAD_TYPES_PATH),
    "server/review_threads/types.ts should exist for /api/review-threads validation",
  ).toBe(true);

  const serverTypes = await import(pathToFileURL(SERVER_REVIEW_THREAD_TYPES_PATH).href);
  const serverThreadStatuses = exportedStringList(
    serverTypes,
    "ThreadStatus",
    CONTRACT_THREAD_STATUS_VALUES,
  );
  const serverThreadSides = exportedStringList(
    serverTypes,
    "ThreadSide",
    CONTRACT_THREAD_SIDE_VALUES,
  );
  const serverVerdictDecisions = exportedStringList(
    serverTypes,
    "VerdictDecision",
    CONTRACT_VERDICT_DECISION_VALUES,
  );

  expect(serverThreadStatuses).toEqual(CONTRACT_THREAD_STATUS_VALUES);
  expect(serverThreadSides).toEqual(CONTRACT_THREAD_SIDE_VALUES);
  expect(serverVerdictDecisions).toEqual(CONTRACT_VERDICT_DECISION_VALUES);

  for (const status of serverThreadStatuses) {
    expect(threadStatusFromString(status)).toBe(status);
    expect(serverTypes.threadStatusFromString(status)).toBe(status);
  }

  for (const side of serverThreadSides) {
    expect(threadSideFromString(side)).toBe(side);
    expect(serverTypes.threadSideFromString(side)).toBe(side);
  }

  for (const decision of serverVerdictDecisions) {
    expect(verdictDecisionFromString(decision)).toBe(decision);
    expect(serverTypes.verdictDecisionFromString(decision)).toBe(decision);
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
    `server/review_threads/types.ts should export the ${label} string list`,
  ).toBeTruthy();

  return matchingExport?.[1] as string[];
}
