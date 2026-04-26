/**
 * System-mode degradation engine for viewport-level degraded UX.
 */

import type { TrustState } from "./trust";

export const ALL_SYSTEM_MODES = ["normal", "system-mode"] as const;

export type SystemMode = (typeof ALL_SYSTEM_MODES)[number];

export const ALL_SYSTEM_MODE_TRIGGERS = [
  "runtime-unreachable",
  "aggregate-staleness",
  "provider-unavailable",
] as const;

export type SystemModeTrigger = (typeof ALL_SYSTEM_MODE_TRIGGERS)[number];

export interface SystemModeConfig {
  agentsUnavailableMs: number;
  staleElementRatioThreshold: number;
}

export interface ProviderHealthSnapshot {
  providerId: string;
  trust: TrustState;
}

export interface SystemModeInput {
  agentsUnreachableSinceMs: number | null;
  agentsInflightRequests: number;
  renderedLlmElementCount: number;
  staleLlmElementCount: number;
  activeProviderDependencies: readonly ProviderHealthSnapshot[];
}

export interface SystemModeDecision {
  mode: SystemMode;
  reasons: readonly SystemModeTrigger[];
}

export const DEFAULT_CONFIG: SystemModeConfig = {
  agentsUnavailableMs: 30000,
  staleElementRatioThreshold: 0.4,
};

const SYSTEM_MODE_SET: ReadonlySet<string> = new Set(ALL_SYSTEM_MODES);
const SYSTEM_MODE_TRIGGER_SET: ReadonlySet<string> = new Set(
  ALL_SYSTEM_MODE_TRIGGERS,
);
const UNAVAILABLE_PROVIDER_TRUST: ReadonlySet<TrustState> = new Set([
  "stale",
  "conflicting",
]);

export function systemModeFromString(value: string): SystemMode {
  if (SYSTEM_MODE_SET.has(value)) {
    return value as SystemMode;
  }

  throw new Error(`Unknown system mode: ${value}`);
}

export function systemModeTriggerFromString(value: string): SystemModeTrigger {
  if (SYSTEM_MODE_TRIGGER_SET.has(value)) {
    return value as SystemModeTrigger;
  }

  throw new Error(`Unknown system-mode trigger: ${value}`);
}

function requireInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer`);
  }
}

export function makeConfig(partial: Partial<SystemModeConfig> = {}): SystemModeConfig {
  const config = {
    ...DEFAULT_CONFIG,
    ...partial,
  };

  requireInteger(config.agentsUnavailableMs, "agentsUnavailableMs");
  if (config.agentsUnavailableMs <= 0) {
    throw new Error("agentsUnavailableMs must be > 0");
  }

  if (!Number.isFinite(config.staleElementRatioThreshold)) {
    throw new Error("staleElementRatioThreshold must be finite");
  }
  if (
    config.staleElementRatioThreshold <= 0 ||
    config.staleElementRatioThreshold > 1
  ) {
    throw new Error("staleElementRatioThreshold must be in (0.0, 1.0]");
  }

  return config;
}

export function makeInput(input: SystemModeInput): SystemModeInput {
  if (input.agentsUnreachableSinceMs !== null) {
    requireInteger(input.agentsUnreachableSinceMs, "agentsUnreachableSinceMs");
    if (input.agentsUnreachableSinceMs < 0) {
      throw new Error("agentsUnreachableSinceMs must be >= 0");
    }
  }

  requireInteger(input.agentsInflightRequests, "agentsInflightRequests");
  requireInteger(input.renderedLlmElementCount, "renderedLlmElementCount");
  requireInteger(input.staleLlmElementCount, "staleLlmElementCount");

  if (input.agentsInflightRequests < 0) {
    throw new Error("agentsInflightRequests must be >= 0");
  }
  if (input.renderedLlmElementCount < 0) {
    throw new Error("renderedLlmElementCount must be >= 0");
  }
  if (input.staleLlmElementCount < 0) {
    throw new Error("staleLlmElementCount must be >= 0");
  }
  if (input.staleLlmElementCount > input.renderedLlmElementCount) {
    throw new Error("staleLlmElementCount must be <= renderedLlmElementCount");
  }

  for (const dependency of input.activeProviderDependencies) {
    if (typeof dependency.providerId !== "string") {
      throw new Error("providerId must be a string");
    }
  }

  return {
    ...input,
    activeProviderDependencies: [...input.activeProviderDependencies],
  };
}

export function evaluateSystemMode(
  rawInput: SystemModeInput,
  rawConfig: SystemModeConfig,
): SystemModeDecision {
  const input = makeInput(rawInput);
  const config = makeConfig(rawConfig);
  const reasons: SystemModeTrigger[] = [];

  if (
    input.agentsUnreachableSinceMs !== null &&
    input.agentsUnreachableSinceMs >= config.agentsUnavailableMs &&
    input.agentsInflightRequests >= 1
  ) {
    reasons.push("runtime-unreachable");
  }

  if (input.renderedLlmElementCount > 0) {
    const staleRatio = input.staleLlmElementCount / input.renderedLlmElementCount;
    if (staleRatio >= config.staleElementRatioThreshold) {
      reasons.push("aggregate-staleness");
    }
  }

  if (
    input.activeProviderDependencies.some((dependency) =>
      UNAVAILABLE_PROVIDER_TRUST.has(dependency.trust),
    )
  ) {
    reasons.push("provider-unavailable");
  }

  return {
    mode: reasons.length > 0 ? "system-mode" : "normal",
    reasons,
  };
}
