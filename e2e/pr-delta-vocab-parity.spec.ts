import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  deltaKindFromString,
  entityKindFromString,
  type DeltaKind,
  type EntityKind,
} from "../app/lib/pr-delta";

const SERVER_TYPES_PATH = resolve("server/pr_delta/types.ts");

const CONTRACT_DELTA_KIND_VALUES = [
  "added",
  "removed",
  "renamed",
  "reshaped",
  "unchanged",
  "split",
  "merged",
  "unmatched",
] as const satisfies readonly DeltaKind[];

const CONTRACT_ENTITY_KIND_VALUES = [
  "behavior",
  "edge",
  "container",
  "store",
  "artifact",
  "widget",
  "test",
  "task",
] as const satisfies readonly EntityKind[];

test("server PR delta vocabulary stays in sync with app/lib/pr-delta.ts", async () => {
  expect(
    existsSync(SERVER_TYPES_PATH),
    "server/pr_delta/types.ts should exist for /api/pr-deltas/compute validation",
  ).toBe(true);

  const serverTypes = await import(pathToFileURL(SERVER_TYPES_PATH).href);
  const serverDeltaKinds = exportedStringList(
    serverTypes,
    "DeltaKind",
    CONTRACT_DELTA_KIND_VALUES,
  );
  const serverEntityKinds = exportedStringList(
    serverTypes,
    "EntityKind",
    CONTRACT_ENTITY_KIND_VALUES,
  );

  expect(serverDeltaKinds).toEqual(CONTRACT_DELTA_KIND_VALUES);
  expect(serverEntityKinds).toEqual(CONTRACT_ENTITY_KIND_VALUES);

  for (const kind of serverDeltaKinds) {
    expect(deltaKindFromString(kind)).toBe(kind);
    expect(serverTypes.deltaKindFromString(kind)).toBe(kind);
  }

  for (const kind of serverEntityKinds) {
    expect(entityKindFromString(kind)).toBe(kind);
    expect(serverTypes.entityKindFromString(kind)).toBe(kind);
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
    `server/pr_delta/types.ts should export the ${label} string list`,
  ).toBeTruthy();

  return matchingExport?.[1] as string[];
}
