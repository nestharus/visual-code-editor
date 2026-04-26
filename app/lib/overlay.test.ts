import { expect, test } from "@playwright/test";

import {
  makeOperationalOverlay,
  makeOverlayLayer,
  makeOverlaySignal,
  overlayProviderIdFromString,
  overlaySignalKindFromString,
  type OperationalOverlay,
  type OverlayLayer,
  type OverlayProviderId,
  type OverlaySignal,
  type OverlaySignalKind,
} from "./overlay";
import type { TrustSignal } from "./trust";

const CONTRACT_OVERLAY_PROVIDER_IDS = [
  ["TEST_STATUS", "g:test"],
  ["PR_DELTA", "g:pr-delta"],
  ["DEPLOY_STATE", "g:deploy"],
  ["RUNTIME_PROFILE", "g:profile"],
  ["TASK_ACTIVE", "g:task-active"],
] as const satisfies readonly (readonly [string, OverlayProviderId])[];

const CONTRACT_OVERLAY_SIGNAL_KINDS = [
  ["PASS", "pass"],
  ["FAIL", "fail"],
  ["IN_PROGRESS", "in-progress"],
  ["STALE", "stale"],
  ["INFO", "info"],
] as const satisfies readonly (readonly [string, OverlaySignalKind])[];

const CONTRACT_OVERLAY_PROVIDER_ID_VALUES = CONTRACT_OVERLAY_PROVIDER_IDS.map(
  ([, providerId]) => providerId,
);
const CONTRACT_OVERLAY_SIGNAL_KIND_VALUES = CONTRACT_OVERLAY_SIGNAL_KINDS.map(
  ([, kind]) => kind,
);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type ContractOverlayProviderId = (typeof CONTRACT_OVERLAY_PROVIDER_IDS)[number][1];
type ContractOverlaySignalKind = (typeof CONTRACT_OVERLAY_SIGNAL_KINDS)[number][1];
type _OverlayProviderIdMembership = Assert<
  Equal<OverlayProviderId, ContractOverlayProviderId>
>;
type _OverlaySignalKindMembership = Assert<
  Equal<OverlaySignalKind, ContractOverlaySignalKind>
>;

const describe = test.describe;
const it = test;

function trust(
  state: TrustSignal["state"] = "grounded",
  grounding: TrustSignal["grounding"] = "runtime-trace",
): TrustSignal {
  return { state, grounding };
}

function signal(overrides: Partial<OverlaySignal> = {}): OverlaySignal {
  return makeOverlaySignal({
    providerId: "g:test",
    entityId: "behavior:auth.login",
    kind: "fail",
    label: "1 failing test",
    trust: trust(),
    emittedAtMs: 1_700_000_000_000,
    detailUrl: "https://ci.example.test/runs/123",
    ...overrides,
  });
}

function layer(overrides: Partial<OverlayLayer> = {}): OverlayLayer {
  const providerId = overrides.providerId ?? "g:test";

  return makeOverlayLayer({
    providerId,
    signals: [
      signal({ providerId, entityId: "behavior:auth.login" }),
      signal({ providerId, entityId: "behavior:checkout.submit" }),
    ],
    computedAtMs: 1_700_000_000_500,
    attributionActor: "ci",
    ...overrides,
  });
}

function overlay(overrides: Partial<OperationalOverlay> = {}): OperationalOverlay {
  return makeOperationalOverlay({
    layers: [
      layer({ providerId: "g:test" }),
      layer({
        providerId: "g:deploy",
        signals: [
          signal({
            providerId: "g:deploy",
            entityId: "system:api",
            kind: "pass",
            label: "Production healthy",
          }),
        ],
        attributionActor: "generator",
      }),
    ],
    computedAtMs: 1_700_000_001_000,
    ...overrides,
  });
}

describe("OperationalOverlay schema contract", () => {
  for (const [memberName, providerIdValue] of CONTRACT_OVERLAY_PROVIDER_IDS) {
    it(`contains contract overlay provider id ${memberName} with stable string value ${providerIdValue}`, () => {
      expect(overlayProviderIdFromString(providerIdValue)).toBe(providerIdValue);
    });
  }

  it("contains exactly the 5 contract overlay provider ids", () => {
    expect(CONTRACT_OVERLAY_PROVIDER_ID_VALUES).toHaveLength(5);
    expect(new Set(CONTRACT_OVERLAY_PROVIDER_ID_VALUES).size).toBe(5);
  });

  for (const [memberName, signalKindValue] of CONTRACT_OVERLAY_SIGNAL_KINDS) {
    it(`contains contract overlay signal kind ${memberName} with stable string value ${signalKindValue}`, () => {
      expect(overlaySignalKindFromString(signalKindValue)).toBe(signalKindValue);
    });
  }

  it("contains exactly the 5 contract overlay signal kinds", () => {
    expect(CONTRACT_OVERLAY_SIGNAL_KIND_VALUES).toHaveLength(5);
    expect(new Set(CONTRACT_OVERLAY_SIGNAL_KIND_VALUES).size).toBe(5);
  });

  it("throws instead of silently accepting unknown overlay provider id strings", () => {
    for (const invalidValue of [
      "",
      "g:tests",
      "G:test",
      "g:test ",
      "test",
      "g:runtime-profile",
    ]) {
      expect(
        () => overlayProviderIdFromString(invalidValue),
        `overlayProviderIdFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown overlay signal kind strings", () => {
    for (const invalidValue of [
      "",
      "PASS",
      "in_progress",
      "in-progress ",
      "warning",
      "error",
    ]) {
      expect(
        () => overlaySignalKindFromString(invalidValue),
        `overlaySignalKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("rejects invalid OverlaySignal values", () => {
    for (const overrides of [
      { label: "" },
      { emittedAtMs: -1 },
    ] satisfies readonly Partial<OverlaySignal>[]) {
      expect(() => signal(overrides)).toThrow();
    }
  });

  it("rejects out-of-order OverlayLayer signals by entity id", () => {
    expect(() =>
      layer({
        signals: [
          signal({ entityId: "behavior:z" }),
          signal({ entityId: "behavior:a" }),
        ],
      }),
    ).toThrow();
  });

  it("rejects duplicate provider/entity OverlayLayer signals", () => {
    expect(() =>
      layer({
        signals: [
          signal({ entityId: "behavior:auth.login", kind: "fail" }),
          signal({ entityId: "behavior:auth.login", kind: "pass" }),
        ],
      }),
    ).toThrow();
  });

  it("rejects duplicate provider layers in OperationalOverlay", () => {
    expect(() =>
      overlay({
        layers: [
          layer({ providerId: "g:test" }),
          layer({ providerId: "g:test" }),
        ],
      }),
    ).toThrow();
  });
});
