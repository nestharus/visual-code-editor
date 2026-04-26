import { expect, test } from "@playwright/test";

import {
  CHANGE_EVENT_ID_PATTERN,
  USER_CONTEXT_ID_PATTERN,
  changeEventKindFromString,
  changeEventTierFromString,
  makeChangeEvent,
  makeOpenedSurface,
  makeUserContext,
  openedSurfaceKindFromString,
  type ChangeEvent,
  type ChangeEventKind,
  type ChangeEventTier,
  type OpenedSurface,
  type OpenedSurfaceKind,
  type RecentPromptSummary,
  type UserContext,
} from "./user-context";

const CONTRACT_OPENED_SURFACE_KINDS = [
  ["DIAGRAM", "diagram"],
  ["PANEL", "panel"],
  ["BEHAVIOUR_CARD", "behaviour-card"],
  ["SLICE", "slice"],
  ["TASK", "task"],
  ["PR_DELTA", "pr-delta"],
] as const satisfies readonly (readonly [string, OpenedSurfaceKind])[];

const CONTRACT_CHANGE_EVENT_KINDS = [
  ["ENTITY_ADDED", "entity-added"],
  ["ENTITY_REMOVED", "entity-removed"],
  ["ENTITY_RESHAPED", "entity-reshaped"],
  ["ENTITY_RENAMED", "entity-renamed"],
  ["ENTITY_SPLIT", "entity-split"],
  ["ENTITY_MERGED", "entity-merged"],
  ["ENTITY_UNMATCHED", "entity-unmatched"],
  ["PROVIDER_SYNC", "provider-sync"],
  ["TASK_STATE_CHANGE", "task-state-change"],
  ["REVIEW_THREAD_UPDATE", "review-thread-update"],
  ["AGENTS_RUNTIME_HEALTH", "agents-runtime-health"],
  ["CI_RUN_FINISHED", "ci-run-finished"],
] as const satisfies readonly (readonly [string, ChangeEventKind])[];

const CONTRACT_CHANGE_EVENT_TIERS = [
  ["IMMEDIATE", "immediate"],
  ["STASHED", "stashed"],
  ["SUPPRESSED", "suppressed"],
] as const satisfies readonly (readonly [string, ChangeEventTier])[];

const CONTRACT_OPENED_SURFACE_KIND_VALUES = CONTRACT_OPENED_SURFACE_KINDS.map(
  ([, kind]) => kind,
);
const CONTRACT_CHANGE_EVENT_KIND_VALUES = CONTRACT_CHANGE_EVENT_KINDS.map(
  ([, kind]) => kind,
);
const CONTRACT_CHANGE_EVENT_TIER_VALUES = CONTRACT_CHANGE_EVENT_TIERS.map(
  ([, tier]) => tier,
);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
type ContractOpenedSurfaceKind = (typeof CONTRACT_OPENED_SURFACE_KINDS)[number][1];
type ContractChangeEventKind = (typeof CONTRACT_CHANGE_EVENT_KINDS)[number][1];
type ContractChangeEventTier = (typeof CONTRACT_CHANGE_EVENT_TIERS)[number][1];
type _OpenedSurfaceKindMembership = Assert<
  Equal<OpenedSurfaceKind, ContractOpenedSurfaceKind>
>;
type _ChangeEventKindMembership = Assert<
  Equal<ChangeEventKind, ContractChangeEventKind>
>;
type _ChangeEventTierMembership = Assert<
  Equal<ChangeEventTier, ContractChangeEventTier>
>;

const describe = test.describe;
const it = test;

function surface(overrides: Partial<OpenedSurface> = {}): OpenedSurface {
  return makeOpenedSurface({
    kind: "diagram",
    entityId: "system:auth",
    openedAtMs: 1_700_000_000_000,
    lastFocusedAtMs: 1_700_000_000_500,
    totalDwellMs: 500,
    ...overrides,
  });
}

function prompt(
  overrides: Partial<RecentPromptSummary> = {},
): RecentPromptSummary {
  return {
    requestId: "req-001",
    mode: "ask",
    surfaceAnchor: "node",
    selectionCount: 1,
    issuedAtMs: 1_700_000_001_000,
    ...overrides,
  };
}

function context(overrides: Partial<UserContext> = {}): UserContext {
  return makeUserContext({
    id: "user-context:session-1",
    openedSurfaces: [surface()],
    recentPrompts: [prompt()],
    activeTaskIds: ["task:t1"],
    activeSliceIds: ["slice:s1"],
    autoMotionDisabled: false,
    computedAtMs: 1_700_000_002_000,
    ...overrides,
  });
}

function changeEvent(overrides: Partial<ChangeEvent> = {}): ChangeEvent {
  return makeChangeEvent({
    id: "change:c1",
    kind: "entity-added",
    actor: "agents:direct",
    affectedEntityIds: ["system:auth"],
    affectedKinds: ["system"],
    tier: "stashed",
    blocking: false,
    timestampMs: 1_700_000_003_000,
    contextSummary: "Auth system was added.",
    detailUrl: null,
    ...overrides,
  });
}

describe("UserContext and ChangeEvent schema contract", () => {
  for (const [memberName, kindValue] of CONTRACT_OPENED_SURFACE_KINDS) {
    it(`contains contract opened surface kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(openedSurfaceKindFromString(kindValue)).toBe(kindValue);
    });
  }

  it("contains exactly the 6 contract opened surface kinds", () => {
    expect(CONTRACT_OPENED_SURFACE_KIND_VALUES).toHaveLength(6);
    expect(new Set(CONTRACT_OPENED_SURFACE_KIND_VALUES).size).toBe(6);
  });

  for (const [memberName, kindValue] of CONTRACT_CHANGE_EVENT_KINDS) {
    it(`contains contract change event kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(changeEventKindFromString(kindValue)).toBe(kindValue);
    });
  }

  it("contains exactly the 12 contract change event kinds", () => {
    expect(CONTRACT_CHANGE_EVENT_KIND_VALUES).toHaveLength(12);
    expect(new Set(CONTRACT_CHANGE_EVENT_KIND_VALUES).size).toBe(12);
  });

  for (const [memberName, tierValue] of CONTRACT_CHANGE_EVENT_TIERS) {
    it(`contains contract change event tier ${memberName} with stable string value ${tierValue}`, () => {
      expect(changeEventTierFromString(tierValue)).toBe(tierValue);
    });
  }

  it("contains exactly the 3 contract change event tiers", () => {
    expect(CONTRACT_CHANGE_EVENT_TIER_VALUES).toHaveLength(3);
    expect(new Set(CONTRACT_CHANGE_EVENT_TIER_VALUES).size).toBe(3);
  });

  it("throws instead of silently accepting unknown enum strings", () => {
    for (const invalidValue of ["", "DIAGRAM", "behaviour_card", "diagram "]) {
      expect(() => openedSurfaceKindFromString(invalidValue)).toThrow();
    }
    for (const invalidValue of [
      "",
      "ENTITY_ADDED",
      "entity_added",
      "entity-added ",
    ]) {
      expect(() => changeEventKindFromString(invalidValue)).toThrow();
    }
    for (const invalidValue of ["", "IMMEDIATE", "immediate "]) {
      expect(() => changeEventTierFromString(invalidValue)).toThrow();
    }
  });

  it("rejects invalid OpenedSurface values", () => {
    for (const overrides of [
      { entityId: "" },
      { openedAtMs: -1 },
      { openedAtMs: 20, lastFocusedAtMs: 19 },
      { totalDwellMs: -1 },
    ] satisfies readonly Partial<OpenedSurface>[]) {
      expect(() => surface(overrides)).toThrow();
    }
  });

  for (const contextId of [
    "user-context:session",
    "user-context:User_1.2-abc",
  ]) {
    it(`accepts contract user context id ${contextId}`, () => {
      expect(USER_CONTEXT_ID_PATTERN.test(contextId)).toBe(true);
      expect(context({ id: contextId }).id).toBe(contextId);
    });
  }

  for (const contextId of [
    "",
    "session",
    "user-context:",
    "user-context:has spaces",
    "user-context:has/slash",
  ]) {
    it(`rejects contract-invalid user context id ${contextId}`, () => {
      expect(USER_CONTEXT_ID_PATTERN.test(contextId)).toBe(false);
      expect(() => context({ id: contextId })).toThrow();
    });
  }

  it("rejects negative UserContext computedAtMs", () => {
    expect(() => context({ computedAtMs: -1 })).toThrow();
  });

  it("dedupes opened surfaces by kind and entity id, keeping the most recent", () => {
    const older = surface({
      lastFocusedAtMs: 1_700_000_000_100,
      totalDwellMs: 100,
    });
    const other = surface({
      kind: "panel",
      entityId: "system:auth",
      lastFocusedAtMs: 1_700_000_000_200,
      totalDwellMs: 200,
    });
    const newer = surface({
      lastFocusedAtMs: 1_700_000_000_900,
      totalDwellMs: 900,
    });

    const userContext = context({ openedSurfaces: [older, other, newer] });
    const byKey = new Map(
      userContext.openedSurfaces.map((openedSurface) => [
        `${openedSurface.kind}\0${openedSurface.entityId}`,
        openedSurface,
      ]),
    );

    expect(userContext.openedSurfaces).toHaveLength(2);
    expect(byKey.get("diagram\0system:auth")).toEqual(newer);
  });

  it("dedupes recent prompts by request id", () => {
    const userContext = context({
      recentPrompts: [
        prompt({ requestId: "req-001", issuedAtMs: 1_700_000_001_000 }),
        prompt({ requestId: "req-002", issuedAtMs: 1_700_000_001_500 }),
        prompt({ requestId: "req-001", issuedAtMs: 1_700_000_002_000 }),
      ],
    });
    const requestIds = userContext.recentPrompts.map(({ requestId }) => requestId);

    expect(new Set(requestIds).size).toBe(2);
    expect(requestIds).toHaveLength(2);
  });

  it("dedupes active task and slice ids", () => {
    const userContext = context({
      activeTaskIds: ["task:t1", "task:t1", "task:t2"],
      activeSliceIds: ["slice:s1", "slice:s1", "slice:s2"],
    });

    expect(new Set(userContext.activeTaskIds)).toEqual(new Set(["task:t1", "task:t2"]));
    expect(userContext.activeTaskIds).toHaveLength(2);
    expect(new Set(userContext.activeSliceIds)).toEqual(
      new Set(["slice:s1", "slice:s2"]),
    );
    expect(userContext.activeSliceIds).toHaveLength(2);
  });

  it("rejects invalid active task and slice ids", () => {
    for (const overrides of [
      { activeTaskIds: ["t1"] },
      { activeTaskIds: ["task:"] },
      { activeTaskIds: ["task:has spaces"] },
      { activeSliceIds: ["s1"] },
      { activeSliceIds: ["slice:"] },
      { activeSliceIds: ["slice:has spaces"] },
    ] satisfies readonly Partial<UserContext>[]) {
      expect(() => context(overrides)).toThrow();
    }
  });

  it("rejects invalid ChangeEvent values", () => {
    for (const overrides of [
      { affectedEntityIds: [] },
      { affectedEntityIds: ["system:auth"], affectedKinds: [] },
      {
        affectedEntityIds: ["system:auth", "module:auth"],
        affectedKinds: ["system"],
      },
      { contextSummary: "" },
      { timestampMs: -1 },
      { blocking: true, tier: "stashed" },
    ] satisfies readonly Partial<ChangeEvent>[]) {
      expect(() => changeEvent(overrides)).toThrow();
    }
  });

  it("accepts blocking immediate ChangeEvents", () => {
    const event = changeEvent({ blocking: true, tier: "immediate" });

    expect(event.blocking).toBe(true);
    expect(event.tier).toBe("immediate");
  });

  for (const changeEventId of ["change:c1", "change:User_1.2-abc"]) {
    it(`accepts contract change event id ${changeEventId}`, () => {
      expect(CHANGE_EVENT_ID_PATTERN.test(changeEventId)).toBe(true);
      expect(changeEvent({ id: changeEventId }).id).toBe(changeEventId);
    });
  }

  for (const changeEventId of [
    "",
    "c1",
    "change:",
    "change:has spaces",
    "change:has/slash",
  ]) {
    it(`rejects contract-invalid change event id ${changeEventId}`, () => {
      expect(CHANGE_EVENT_ID_PATTERN.test(changeEventId)).toBe(false);
      expect(() => changeEvent({ id: changeEventId })).toThrow();
    });
  }
});
