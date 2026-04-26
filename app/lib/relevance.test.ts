import { expect, test } from "@playwright/test";

import type { ActorKind } from "./actors";
import {
  type ChangeEvent,
  type ChangeEventKind,
  type ChangeEventTier,
  type OpenedSurface,
  type UserContext,
  makeChangeEvent,
  makeOpenedSurface,
  makeUserContext,
} from "./user-context";
import {
  DEFAULT_CONFIG,
  classify,
  type ClassifierConfig,
} from "./relevance";

const describe = test.describe;
const it = test;

const NOW_MS = 1_700_000_000_000;

const ALWAYS_IMMEDIATE_KINDS = [
  "entity-renamed",
  "entity-split",
  "entity-merged",
  "entity-unmatched",
  "review-thread-update",
  "agents-runtime-health",
] as const satisfies readonly ChangeEventKind[];

const ALWAYS_STASHED_KINDS = [
  "provider-sync",
  "ci-run-finished",
] as const satisfies readonly ChangeEventKind[];

function context(overrides: Partial<UserContext> = {}): UserContext {
  return makeUserContext({
    id: "user-context:relevance",
    openedSurfaces: [],
    recentPrompts: [],
    activeTaskIds: [],
    activeSliceIds: [],
    autoMotionDisabled: false,
    computedAtMs: NOW_MS,
    ...overrides,
  });
}

function surface(entityId: string): OpenedSurface {
  return makeOpenedSurface({
    kind: "diagram",
    entityId,
    openedAtMs: NOW_MS - 10_000,
    lastFocusedAtMs: NOW_MS - 1_000,
    totalDwellMs: 9_000,
  });
}

function changeEvent(overrides: Partial<ChangeEvent> = {}): ChangeEvent {
  return makeChangeEvent({
    id: "change:relevance",
    kind: "entity-added",
    actor: "agents:direct",
    affectedEntityIds: ["system:auth"],
    affectedKinds: ["system"],
    tier: "stashed",
    blocking: false,
    timestampMs: NOW_MS,
    contextSummary: "Auth system changed.",
    detailUrl: null,
    ...overrides,
  });
}

function config(overrides: Partial<ClassifierConfig> = {}): ClassifierConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}

function scoreOnlyConfig(): ClassifierConfig {
  return config({
    recencyWindowMs: 100,
    recencyWeight: 1.0,
    onSurfaceWeight: 0.0,
    providerWeight: 0.0,
    actorWeight: 0.0,
    contextMatchWeight: 0.0,
    immediateThreshold: 0.55,
    stashedThreshold: 0.20,
    providerTierWeight: {},
  });
}

describe("relevance classifier contract", () => {
  for (const kind of ALWAYS_IMMEDIATE_KINDS) {
    it(`returns immediate with always-immediate reason for ${kind}`, () => {
      const decision = classify(
        changeEvent({
          kind,
          actor: "you-this-session",
          timestampMs: 0,
        }),
        context(),
        config({ immediateThreshold: 1.0, stashedThreshold: 1.0 }),
        NOW_MS,
      );

      expect(decision.tier).toBe("immediate");
      expect(decision.reason).toBe("always-immediate");
    });
  }

  for (const kind of ALWAYS_STASHED_KINDS) {
    it(`returns stashed with always-stashed reason for ${kind}`, () => {
      const decision = classify(
        changeEvent({
          kind,
          actor: "you-other-session",
          timestampMs: NOW_MS,
        }),
        context({ openedSurfaces: [surface("system:auth")] }),
        config({ immediateThreshold: 0.0, stashedThreshold: 0.0 }),
        NOW_MS,
      );

      expect(decision.tier).toBe("stashed");
      expect(decision.reason).toBe("always-stashed");
    });
  }

  it("returns immediate with blocking reason for blocking non-always-stashed events", () => {
    const decision = classify(
      changeEvent({
        kind: "task-state-change",
        blocking: true,
        tier: "immediate",
        timestampMs: 0,
      }),
      context(),
      config({ immediateThreshold: 1.0, stashedThreshold: 1.0 }),
      NOW_MS,
    );

    expect(decision.tier).toBe("immediate");
    expect(decision.reason).toBe("blocking");
  });

  it("scores recent events higher than old events", () => {
    const recent = classify(changeEvent({ timestampMs: NOW_MS }), context(), DEFAULT_CONFIG, NOW_MS);
    const old = classify(changeEvent({ timestampMs: 0 }), context(), DEFAULT_CONFIG, NOW_MS);

    expect(recent.reason).toBe("scored");
    expect(old.reason).toBe("scored");
    expect(recent.totalScore).toBeGreaterThan(old.totalScore);
  });

  it("boosts score when the affected entity is on an opened surface", () => {
    const away = classify(changeEvent(), context(), DEFAULT_CONFIG, NOW_MS);
    const onSurface = classify(
      changeEvent(),
      context({ openedSurfaces: [surface("system:auth")] }),
      DEFAULT_CONFIG,
      NOW_MS,
    );

    expect(onSurface.totalScore).toBeGreaterThan(away.totalScore);
  });

  it("scores you-this-session lower than you-other-session for identical context", () => {
    const thisSession = classify(
      changeEvent({ actor: "you-this-session" as ActorKind }),
      context(),
      DEFAULT_CONFIG,
      NOW_MS,
    );
    const otherSession = classify(
      changeEvent({ actor: "you-other-session" as ActorKind }),
      context(),
      DEFAULT_CONFIG,
      NOW_MS,
    );

    expect(thisSession.totalScore).toBeLessThan(otherSession.totalScore);
  });

  it("transitions to immediate at the immediate threshold", () => {
    const classifierConfig = scoreOnlyConfig();

    const stashed = classify(
      changeEvent({ timestampMs: 954 }),
      context(),
      classifierConfig,
      1_000,
    );
    const immediate = classify(
      changeEvent({ timestampMs: 955 }),
      context(),
      classifierConfig,
      1_000,
    );

    expect(stashed.totalScore).toBeCloseTo(0.54, 12);
    expect(stashed.tier).toBe("stashed" satisfies ChangeEventTier);
    expect(immediate.totalScore).toBeCloseTo(0.55, 12);
    expect(immediate.tier).toBe("immediate" satisfies ChangeEventTier);
  });

  it("suppresses scored events below the stashed threshold", () => {
    const decision = classify(
      changeEvent({ actor: "generator", timestampMs: 0 }),
      context(),
      DEFAULT_CONFIG,
      NOW_MS,
    );

    expect(decision.totalScore).toBeLessThan(DEFAULT_CONFIG.stashedThreshold);
    expect(decision.tier).toBe("suppressed");
  });

  it("is deterministic for identical inputs", () => {
    const event = changeEvent({
      affectedEntityIds: ["task:t1"],
      affectedKinds: ["task"],
      actor: "another-user",
    });
    const userContext = context({
      activeTaskIds: ["task:t1"],
      openedSurfaces: [surface("task:t1")],
    });

    const first = classify(event, userContext, DEFAULT_CONFIG, NOW_MS);
    const second = classify(event, userContext, DEFAULT_CONFIG, NOW_MS);

    expect(second).toEqual(first);
  });
});
