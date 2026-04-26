import { expect, test } from "@playwright/test";

import {
  DEFAULT_CONFIG,
  evaluate,
  type ArtifactSnapshot,
  type LifecycleConfig,
} from "./lifecycle";

const describe = test.describe;
const it = test;

const NOW_MS = 1_700_000_000_000;

function snapshot(overrides: Partial<ArtifactSnapshot> = {}): ArtifactSnapshot {
  return {
    artifactId: "slice:auth-search",
    currentState: "active",
    createdAtMs: NOW_MS - 60_000,
    ttlMs: NOW_MS + 600_000,
    tombstonedAtMs: null,
    ...overrides,
  };
}

function config(overrides: Partial<LifecycleConfig> = {}): LifecycleConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}

describe("artifact lifecycle evaluator contract", () => {
  it("keeps dismissed terminal", () => {
    const decision = evaluate(
      snapshot({ currentState: "dismissed", ttlMs: NOW_MS - 1 }),
      NOW_MS,
      DEFAULT_CONFIG,
    );

    expect(decision.nextState).toBe("dismissed");
    expect(decision.changed).toBe(false);
    expect(decision.reason).toBe("dismissed-terminal");
  });

  it("preserves pinned artifacts", () => {
    const decision = evaluate(
      snapshot({ currentState: "pinned", ttlMs: null }),
      NOW_MS,
      DEFAULT_CONFIG,
    );

    expect(decision.nextState).toBe("pinned");
    expect(decision.changed).toBe(false);
    expect(decision.reason).toBe("still-pinned");
  });

  it("reports old tombstones as purgeable", () => {
    const decision = evaluate(
      snapshot({
        currentState: "tombstoned",
        tombstonedAtMs: NOW_MS - DEFAULT_CONFIG.tombstoneRetentionMs,
      }),
      NOW_MS,
      DEFAULT_CONFIG,
    );

    expect(decision.nextState).toBe("tombstoned");
    expect(decision.changed).toBe(false);
    expect(decision.reason).toBe("tombstone-purgeable");
  });

  it("keeps tombstones within retention tombstoned", () => {
    const decision = evaluate(
      snapshot({
        currentState: "tombstoned",
        tombstonedAtMs: NOW_MS - DEFAULT_CONFIG.tombstoneRetentionMs + 1,
      }),
      NOW_MS,
      DEFAULT_CONFIG,
    );

    expect(decision.nextState).toBe("tombstoned");
    expect(decision.changed).toBe(false);
  });

  it("transitions fully elapsed ttl to tombstoned", () => {
    const lifecycleConfig = config({ tombstoneGraceMs: 250 });
    const decision = evaluate(
      snapshot({ ttlMs: NOW_MS - lifecycleConfig.tombstoneGraceMs }),
      NOW_MS,
      lifecycleConfig,
    );

    expect(decision.nextState).toBe("tombstoned");
    expect(decision.changed).toBe(true);
    expect(decision.reason).toBe("entered-tombstoned");
  });

  it("transitions artifacts within warning window to expiring", () => {
    const decision = evaluate(
      snapshot({ ttlMs: NOW_MS + 60_000 }),
      NOW_MS,
      DEFAULT_CONFIG,
    );

    expect(decision.nextState).toBe("expiring");
    expect(decision.changed).toBe(true);
    expect(decision.reason).toBe("entered-expiring");
  });

  it("returns active when plenty of ttl remains", () => {
    const decision = evaluate(
      snapshot({ ttlMs: NOW_MS + DEFAULT_CONFIG.expiringWarningMs + 1 }),
      NOW_MS,
      DEFAULT_CONFIG,
    );

    expect(decision.nextState).toBe("active");
    expect(decision.changed).toBe(false);
    expect(decision.reason).toBe("still-active");
  });

  it("keeps recovered artifacts recovered while ttl remains", () => {
    const decision = evaluate(
      snapshot({
        currentState: "recovered",
        ttlMs: NOW_MS + DEFAULT_CONFIG.expiringWarningMs + 1,
      }),
      NOW_MS,
      DEFAULT_CONFIG,
    );

    expect(decision.nextState).toBe("recovered");
    expect(decision.changed).toBe(false);
    expect(decision.reason).toBe("still-recovered");
  });

  it("treats ttl equal to now as tombstoned", () => {
    const decision = evaluate(snapshot({ ttlMs: NOW_MS }), NOW_MS, DEFAULT_CONFIG);

    expect(decision.nextState).toBe("tombstoned");
    expect(decision.changed).toBe(true);
    expect(decision.reason).toBe("entered-tombstoned");
  });

  it("treats the warning boundary as expiring", () => {
    const decision = evaluate(
      snapshot({ ttlMs: NOW_MS + DEFAULT_CONFIG.expiringWarningMs }),
      NOW_MS,
      DEFAULT_CONFIG,
    );

    expect(decision.nextState).toBe("expiring");
    expect(decision.changed).toBe(true);
    expect(decision.reason).toBe("entered-expiring");
  });
});
