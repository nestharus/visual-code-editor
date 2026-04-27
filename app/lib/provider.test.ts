import { expect, test } from "@playwright/test";

import {
  PROVIDER_ID_PATTERN,
  makeProvider,
  makeProviderConnection,
  makeProviderEntityMapping,
  providerHealthStateFromString,
  providerKindFromString,
  type Provider,
  type ProviderConnection,
  type ProviderHealthState,
  type ProviderKind,
} from "./provider";
import { makeTrustSignal } from "./trust";

const CONTRACT_PROVIDER_KINDS = [
  ["GITHUB", "github"],
  ["GITLAB", "gitlab"],
  ["JIRA", "jira"],
  ["LINEAR", "linear"],
  ["GENERIC_HTTP", "generic-http"],
] as const satisfies readonly (readonly [string, ProviderKind])[];

const CONTRACT_PROVIDER_HEALTH_STATES = [
  ["GROUNDED", "grounded"],
  ["STALE", "stale"],
  ["CONFLICTING", "conflicting"],
] as const satisfies readonly (readonly [string, ProviderHealthState])[];

const CONTRACT_PROVIDER_KIND_VALUES = CONTRACT_PROVIDER_KINDS.map(([, kind]) => kind);
const CONTRACT_PROVIDER_HEALTH_VALUES = CONTRACT_PROVIDER_HEALTH_STATES.map(
  ([, health]) => health,
);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type ContractProviderKind = (typeof CONTRACT_PROVIDER_KINDS)[number][1];
type ContractProviderHealthState = (typeof CONTRACT_PROVIDER_HEALTH_STATES)[number][1];
type _ProviderKindMembership = Assert<Equal<ProviderKind, ContractProviderKind>>;
type _ProviderHealthStateMembership = Assert<
  Equal<ProviderHealthState, ContractProviderHealthState>
>;

const describe = test.describe;
const it = test;

function mapping(
  overrides: Partial<ReturnType<typeof makeProviderEntityMapping>> = {},
): ReturnType<typeof makeProviderEntityMapping> {
  return makeProviderEntityMapping({
    providerField: "issue.state",
    workspaceField: "behaviour.lifecycle_state",
    trust: makeTrustSignal("candidate", null),
    evidenceSource: "github issue state",
    ...overrides,
  });
}

function provider(overrides: Partial<Provider> = {}): Provider {
  return makeProvider({
    id: "provider:github-main",
    kind: "github",
    label: "GitHub main repository",
    workspaceId: "workspace:main",
    config: { full_name: "example/repo" },
    mappings: [mapping()],
    attributionActor: "you-this-session",
    createdAtMs: 1_700_000_000_000,
    ...overrides,
  });
}

function connection(overrides: Partial<ProviderConnection> = {}): ProviderConnection {
  return makeProviderConnection({
    providerId: "provider:github-main",
    health: "grounded",
    lastSuccessfulSyncMs: 1_700_000_001_000,
    lastFailureMs: null,
    lastFailureReason: null,
    pendingRequestCount: 0,
    ...overrides,
  });
}

describe("Provider schema contract", () => {
  for (const [memberName, kindValue] of CONTRACT_PROVIDER_KINDS) {
    it(`contains contract provider kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(providerKindFromString(kindValue)).toBe(kindValue);
    });
  }

  for (const [memberName, healthValue] of CONTRACT_PROVIDER_HEALTH_STATES) {
    it(`contains contract provider health ${memberName} with stable string value ${healthValue}`, () => {
      expect(providerHealthStateFromString(healthValue)).toBe(healthValue);
    });
  }

  it("contains exactly the 5 contract provider kinds", () => {
    expect(CONTRACT_PROVIDER_KIND_VALUES).toHaveLength(5);
    expect(new Set(CONTRACT_PROVIDER_KIND_VALUES).size).toBe(5);
  });

  it("contains exactly the 3 contract provider health states", () => {
    expect(CONTRACT_PROVIDER_HEALTH_VALUES).toHaveLength(3);
    expect(new Set(CONTRACT_PROVIDER_HEALTH_VALUES).size).toBe(3);
  });

  it("throws instead of silently accepting unknown provider kind strings", () => {
    for (const invalidValue of ["", "GITHUB", "generic_http", "generic-http ", "bitbucket"]) {
      expect(
        () => providerKindFromString(invalidValue),
        `providerKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown provider health strings", () => {
    for (const invalidValue of ["", "GROUNDED", "healthy", "grounded ", "orphaned"]) {
      expect(
        () => providerHealthStateFromString(invalidValue),
        `providerHealthStateFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("accepts ids matching the provider pattern", () => {
    for (const providerId of [
      "provider:github-main",
      "provider:github.repo_123",
      "provider:GHE-prod",
    ]) {
      expect(PROVIDER_ID_PATTERN.test(providerId)).toBe(true);
      expect(provider({ id: providerId }).id).toBe(providerId);
    }
  });

  it("rejects ids outside the provider pattern", () => {
    for (const providerId of [
      "",
      "github-main",
      "provider:",
      "Provider:github",
      "provider:has spaces",
      "provider:github/repo",
    ]) {
      expect(PROVIDER_ID_PATTERN.test(providerId)).toBe(false);
      expect(() => provider({ id: providerId })).toThrow();
    }
  });

  it("rejects empty provider labels and workspace ids", () => {
    for (const overrides of [
      { label: "" },
      { label: "   " },
      { workspaceId: "" },
      { workspaceId: "   " },
    ] satisfies readonly Partial<Provider>[]) {
      expect(() => provider(overrides)).toThrow();
    }
  });

  it("rejects config keys that are not non-empty strings", () => {
    for (const config of [
      { "": "example/repo" },
      { "   ": "example/repo" },
    ] satisfies readonly Provider["config"][]) {
      expect(() => provider({ config })).toThrow();
    }
  });

  it("rejects empty provider and workspace fields on mappings", () => {
    for (const overrides of [
      { providerField: "" },
      { providerField: "   " },
      { workspaceField: "" },
      { workspaceField: "   " },
    ] satisfies readonly Partial<ReturnType<typeof makeProviderEntityMapping>>[]) {
      expect(() => mapping(overrides)).toThrow();
    }
  });

  it("inherits the trust signal iff grounding invariant for mappings", () => {
    expect(
      mapping({
        trust: makeTrustSignal("grounded", "provider-verified"),
      }).trust,
    ).toEqual({
      state: "grounded",
      grounding: "provider-verified",
    });

    expect(() =>
      mapping({
        trust: makeTrustSignal("grounded", null),
      }),
    ).toThrow();
  });

  it("rejects negative pending request counts on connections", () => {
    expect(() => connection({ pendingRequestCount: -1 })).toThrow();
  });
});
