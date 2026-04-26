import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ALL_ACTORS, actorFromString, type ActorKind } from "../app/lib/actors";
import {
  neighbourhoodKindFromString,
  sliceLifecycleStateFromString,
  type NeighbourhoodKind,
  type SliceLifecycleState,
} from "../app/lib/slice";

const SERVER_SLICE_TYPES_PATH = resolve("server/slices/types.ts");

const CONTRACT_NEIGHBOURHOOD_KIND_VALUES = [
  "direct-neighbours",
  "transitive-by-edge-kind",
  "shared-behaviour",
  "shared-container",
  "exact",
] as const satisfies readonly NeighbourhoodKind[];

const CONTRACT_LIFECYCLE_STATE_VALUES = [
  "active",
  "pinned",
  "expiring",
  "tombstoned",
  "recovered",
  "dismissed",
] as const satisfies readonly SliceLifecycleState[];

const CONTRACT_ACTOR_VALUES = ALL_ACTORS satisfies readonly ActorKind[];

test("server slice vocabulary stays in sync with app/lib/slice.ts and app/lib/actors.ts", async () => {
  expect(
    existsSync(SERVER_SLICE_TYPES_PATH),
    "server/slices/types.ts should exist for /api/slices validation",
  ).toBe(true);

  const serverTypes = await import(pathToFileURL(SERVER_SLICE_TYPES_PATH).href);
  const serverNeighbourhoodKinds = exportedStringList(
    serverTypes,
    "NeighbourhoodKind",
    CONTRACT_NEIGHBOURHOOD_KIND_VALUES,
  );
  const serverLifecycleStates = exportedStringList(
    serverTypes,
    "SliceLifecycleState",
    CONTRACT_LIFECYCLE_STATE_VALUES,
  );
  const serverActors = exportedStringList(serverTypes, "ActorKind", CONTRACT_ACTOR_VALUES);

  expect(serverNeighbourhoodKinds).toEqual(CONTRACT_NEIGHBOURHOOD_KIND_VALUES);
  expect(serverLifecycleStates).toEqual(CONTRACT_LIFECYCLE_STATE_VALUES);
  expect(serverActors).toEqual(CONTRACT_ACTOR_VALUES);

  for (const kind of serverNeighbourhoodKinds) {
    expect(neighbourhoodKindFromString(kind)).toBe(kind);
    expect(serverTypes.neighbourhoodKindFromString(kind)).toBe(kind);
  }

  for (const state of serverLifecycleStates) {
    expect(sliceLifecycleStateFromString(state)).toBe(state);
    expect(serverTypes.sliceLifecycleStateFromString(state)).toBe(state);
  }

  for (const actor of serverActors) {
    expect(actorFromString(actor)).toBe(actor);
    expect(serverTypes.actorFromString(actor)).toBe(actor);
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
    `server/slices/types.ts should export the ${label} string list`,
  ).toBeTruthy();

  return matchingExport?.[1] as string[];
}
