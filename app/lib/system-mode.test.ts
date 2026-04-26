import { expect, test } from "@playwright/test";

import {
  DEFAULT_CONFIG,
  evaluateSystemMode,
  makeConfig,
  makeInput,
  type ProviderHealthSnapshot,
  type SystemModeDecision,
  type SystemModeInput,
  type SystemModeTrigger,
} from "./system-mode";
import type { TrustState } from "./trust";

const describe = test.describe;
const it = test;

function provider(providerId: string, trust: TrustState): ProviderHealthSnapshot {
  return { providerId, trust };
}

function input(overrides: Partial<SystemModeInput> = {}): SystemModeInput {
  return makeInput({
    agentsUnreachableSinceMs: null,
    agentsInflightRequests: 0,
    renderedLlmElementCount: 0,
    staleLlmElementCount: 0,
    activeProviderDependencies: [],
    ...overrides,
  });
}

function expectDecisionInvariant(decision: SystemModeDecision): void {
  expect(decision.reasons.length === 0).toBe(decision.mode === "normal");
  expect(decision.reasons.length > 0).toBe(decision.mode === "system-mode");
}

describe("System-mode degradation contract", () => {
  it("uses contract defaults", () => {
    expect(DEFAULT_CONFIG.agentsUnavailableMs).toBe(30000);
    expect(DEFAULT_CONFIG.staleElementRatioThreshold).toBe(0.4);
  });

  it("rejects non-positive agents unavailable thresholds", () => {
    for (const agentsUnavailableMs of [0, -1]) {
      expect(() => makeConfig({ agentsUnavailableMs })).toThrow();
    }
  });

  it("rejects stale ratio thresholds outside the contract range", () => {
    for (const staleElementRatioThreshold of [0, -0.1, 1.01]) {
      expect(() => makeConfig({ staleElementRatioThreshold })).toThrow();
    }
  });

  it("rejects invalid input count combinations", () => {
    for (const overrides of [
      { agentsInflightRequests: -1 },
      { renderedLlmElementCount: -1 },
      { staleLlmElementCount: -1 },
      { renderedLlmElementCount: 3, staleLlmElementCount: 4 },
    ] satisfies readonly Partial<SystemModeInput>[]) {
      expect(() => input(overrides)).toThrow();
    }
  });

  it("keeps the decision invariant: empty reasons iff normal", () => {
    const normal: SystemModeDecision = { mode: "normal", reasons: [] };
    const degraded: SystemModeDecision = {
      mode: "system-mode",
      reasons: ["runtime-unreachable"],
    };

    expectDecisionInvariant(normal);
    expectDecisionInvariant(degraded);
  });

  it("respects the runtime-unreachable rule matrix", () => {
    const cases: readonly (readonly [
      number | null,
      number,
      boolean,
    ])[] = [
      [29999, 1, false],
      [30000, 1, true],
      [30001, 0, false],
      [null, 10, false],
    ];

    for (const [agentsUnreachableSinceMs, agentsInflightRequests, expected] of cases) {
      const decision = evaluateSystemMode(
        input({ agentsUnreachableSinceMs, agentsInflightRequests }),
        DEFAULT_CONFIG,
      );

      expect(decision.reasons.includes("runtime-unreachable")).toBe(expected);
    }
  });

  it("respects aggregate staleness including rendered=0", () => {
    const cases: readonly (readonly [number, number, boolean])[] = [
      [10, 4, true],
      [10, 3, false],
      [0, 0, false],
      [10, 10, true],
    ];

    for (const [renderedLlmElementCount, staleLlmElementCount, expected] of cases) {
      const decision = evaluateSystemMode(
        input({ renderedLlmElementCount, staleLlmElementCount }),
        DEFAULT_CONFIG,
      );

      expect(decision.reasons.includes("aggregate-staleness")).toBe(expected);
    }
  });

  it("uses only stale or conflicting provider trust for provider-unavailable", () => {
    const cases: readonly (readonly [readonly ProviderHealthSnapshot[], boolean])[] = [
      [[provider("github", "stale")], true],
      [[provider("github", "conflicting")], true],
      [[provider("github", "grounded")], false],
      [[], false],
      [[provider("github", "orphaned"), provider("linear", "candidate")], false],
    ];

    for (const [activeProviderDependencies, expected] of cases) {
      const decision = evaluateSystemMode(
        input({ activeProviderDependencies }),
        DEFAULT_CONFIG,
      );

      expect(decision.reasons.includes("provider-unavailable")).toBe(expected);
    }
  });

  it("composes all active triggers in declaration order", () => {
    const decision = evaluateSystemMode(
      input({
        agentsUnreachableSinceMs: 30000,
        agentsInflightRequests: 1,
        renderedLlmElementCount: 10,
        staleLlmElementCount: 4,
        activeProviderDependencies: [provider("github", "stale")],
      }),
      DEFAULT_CONFIG,
    );

    expect(decision.reasons).toEqual([
      "runtime-unreachable",
      "aggregate-staleness",
      "provider-unavailable",
    ] satisfies readonly SystemModeTrigger[]);
  });

  it("resolves to system-mode when any trigger fires", () => {
    const cases: readonly SystemModeInput[] = [
      input({ agentsUnreachableSinceMs: 30000, agentsInflightRequests: 1 }),
      input({ renderedLlmElementCount: 10, staleLlmElementCount: 4 }),
      input({ activeProviderDependencies: [provider("github", "conflicting")] }),
    ];

    for (const caseInput of cases) {
      const decision = evaluateSystemMode(caseInput, DEFAULT_CONFIG);

      expect(decision.mode).toBe("system-mode");
      expect(decision.reasons.length).toBeGreaterThan(0);
    }
  });

  it("resolves to normal when no trigger fires", () => {
    const decision = evaluateSystemMode(input(), DEFAULT_CONFIG);

    expect(decision.mode).toBe("normal");
    expect(decision.reasons).toEqual([]);
  });
});
