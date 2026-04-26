import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  overlayProviderIdFromString,
  overlaySignalKindFromString,
  type OverlayProviderId,
  type OverlaySignalKind,
} from "../app/lib/overlay";

const SERVER_OVERLAY_TYPES_PATH = resolve("server/overlays/types.ts");

const CONTRACT_OVERLAY_PROVIDER_ID_VALUES = [
  "g:test",
  "g:pr-delta",
  "g:deploy",
  "g:profile",
  "g:task-active",
] as const satisfies readonly OverlayProviderId[];

const CONTRACT_OVERLAY_SIGNAL_KIND_VALUES = [
  "pass",
  "fail",
  "in-progress",
  "stale",
  "info",
] as const satisfies readonly OverlaySignalKind[];

test("server overlay vocabulary stays in sync with app/lib/overlay.ts", async () => {
  expect(
    existsSync(SERVER_OVERLAY_TYPES_PATH),
    "server/overlays/types.ts should exist for /api/overlays validation",
  ).toBe(true);

  const serverTypes = await import(pathToFileURL(SERVER_OVERLAY_TYPES_PATH).href);
  const serverProviderIds = exportedStringList(
    serverTypes,
    "OverlayProviderId",
    CONTRACT_OVERLAY_PROVIDER_ID_VALUES,
  );
  const serverSignalKinds = exportedStringList(
    serverTypes,
    "OverlaySignalKind",
    CONTRACT_OVERLAY_SIGNAL_KIND_VALUES,
  );

  expect(serverProviderIds).toEqual(CONTRACT_OVERLAY_PROVIDER_ID_VALUES);
  expect(serverSignalKinds).toEqual(CONTRACT_OVERLAY_SIGNAL_KIND_VALUES);

  for (const providerId of serverProviderIds) {
    expect(overlayProviderIdFromString(providerId)).toBe(providerId);
    expect(serverTypes.overlayProviderIdFromString(providerId)).toBe(providerId);
  }

  for (const kind of serverSignalKinds) {
    expect(overlaySignalKindFromString(kind)).toBe(kind);
    expect(serverTypes.overlaySignalKindFromString(kind)).toBe(kind);
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
    `server/overlays/types.ts should export the ${label} string list`,
  ).toBeTruthy();

  return matchingExport?.[1] as string[];
}
