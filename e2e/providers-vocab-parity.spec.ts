import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  providerHealthStateFromString,
  providerKindFromString,
  type ProviderHealthState,
  type ProviderKind,
} from "../app/lib/provider";

const SERVER_PROVIDER_TYPES_PATH = resolve("server/providers/types.ts");

const CONTRACT_PROVIDER_KIND_VALUES = [
  "github",
  "gitlab",
  "jira",
  "linear",
  "generic-http",
] as const satisfies readonly ProviderKind[];

const CONTRACT_PROVIDER_HEALTH_VALUES = [
  "grounded",
  "stale",
  "conflicting",
] as const satisfies readonly ProviderHealthState[];

test("server provider vocabulary stays in sync with app/lib/provider.ts", async () => {
  expect(
    existsSync(SERVER_PROVIDER_TYPES_PATH),
    "server/providers/types.ts should exist for /api/providers validation",
  ).toBe(true);

  const serverTypes = await import(pathToFileURL(SERVER_PROVIDER_TYPES_PATH).href);
  const serverProviderKinds = exportedStringList(
    serverTypes,
    "ProviderKind",
    CONTRACT_PROVIDER_KIND_VALUES,
  );
  const serverHealthStates = exportedStringList(
    serverTypes,
    "ProviderHealthState",
    CONTRACT_PROVIDER_HEALTH_VALUES,
  );

  expect(serverProviderKinds).toEqual(CONTRACT_PROVIDER_KIND_VALUES);
  expect(serverHealthStates).toEqual(CONTRACT_PROVIDER_HEALTH_VALUES);

  for (const kind of serverProviderKinds) {
    expect(providerKindFromString(kind)).toBe(kind);
    expect(serverTypes.providerKindFromString(kind)).toBe(kind);
  }

  for (const health of serverHealthStates) {
    expect(providerHealthStateFromString(health)).toBe(health);
    expect(serverTypes.providerHealthStateFromString(health)).toBe(health);
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
    `server/providers/types.ts should export the ${label} string list`,
  ).toBeTruthy();

  return matchingExport?.[1] as string[];
}
