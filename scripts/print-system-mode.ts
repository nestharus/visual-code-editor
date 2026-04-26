import {
  DEFAULT_CONFIG,
  evaluateSystemMode,
  makeInput,
  type SystemModeInput,
} from "../app/lib/system-mode";

const scenarios: readonly {
  name: string;
  input: SystemModeInput;
}[] = [
  {
    name: "all-zero baseline",
    input: makeInput({
      agentsUnreachableSinceMs: null,
      agentsInflightRequests: 0,
      renderedLlmElementCount: 0,
      staleLlmElementCount: 0,
      activeProviderDependencies: [],
    }),
  },
  {
    name: "runtime below threshold with inflight request",
    input: makeInput({
      agentsUnreachableSinceMs: 29999,
      agentsInflightRequests: 1,
      renderedLlmElementCount: 0,
      staleLlmElementCount: 0,
      activeProviderDependencies: [],
    }),
  },
  {
    name: "runtime at threshold with inflight request",
    input: makeInput({
      agentsUnreachableSinceMs: 30000,
      agentsInflightRequests: 1,
      renderedLlmElementCount: 0,
      staleLlmElementCount: 0,
      activeProviderDependencies: [],
    }),
  },
  {
    name: "runtime above threshold without inflight request",
    input: makeInput({
      agentsUnreachableSinceMs: 30001,
      agentsInflightRequests: 0,
      renderedLlmElementCount: 0,
      staleLlmElementCount: 0,
      activeProviderDependencies: [],
    }),
  },
  {
    name: "stale ratio thirty percent",
    input: makeInput({
      agentsUnreachableSinceMs: null,
      agentsInflightRequests: 0,
      renderedLlmElementCount: 10,
      staleLlmElementCount: 3,
      activeProviderDependencies: [],
    }),
  },
  {
    name: "stale ratio forty percent",
    input: makeInput({
      agentsUnreachableSinceMs: null,
      agentsInflightRequests: 0,
      renderedLlmElementCount: 10,
      staleLlmElementCount: 4,
      activeProviderDependencies: [],
    }),
  },
  {
    name: "stale ratio forty one percent",
    input: makeInput({
      agentsUnreachableSinceMs: null,
      agentsInflightRequests: 0,
      renderedLlmElementCount: 100,
      staleLlmElementCount: 41,
      activeProviderDependencies: [],
    }),
  },
  {
    name: "providers all grounded",
    input: makeInput({
      agentsUnreachableSinceMs: null,
      agentsInflightRequests: 0,
      renderedLlmElementCount: 0,
      staleLlmElementCount: 0,
      activeProviderDependencies: [
        { providerId: "github", trust: "grounded" },
        { providerId: "linear", trust: "grounded" },
      ],
    }),
  },
  {
    name: "one provider stale",
    input: makeInput({
      agentsUnreachableSinceMs: null,
      agentsInflightRequests: 0,
      renderedLlmElementCount: 0,
      staleLlmElementCount: 0,
      activeProviderDependencies: [{ providerId: "github", trust: "stale" }],
    }),
  },
  {
    name: "one provider conflicting",
    input: makeInput({
      agentsUnreachableSinceMs: null,
      agentsInflightRequests: 0,
      renderedLlmElementCount: 0,
      staleLlmElementCount: 0,
      activeProviderDependencies: [{ providerId: "github", trust: "conflicting" }],
    }),
  },
  {
    name: "one provider orphaned",
    input: makeInput({
      agentsUnreachableSinceMs: null,
      agentsInflightRequests: 0,
      renderedLlmElementCount: 0,
      staleLlmElementCount: 0,
      activeProviderDependencies: [{ providerId: "github", trust: "orphaned" }],
    }),
  },
  {
    name: "all three triggers active",
    input: makeInput({
      agentsUnreachableSinceMs: 30000,
      agentsInflightRequests: 1,
      renderedLlmElementCount: 10,
      staleLlmElementCount: 4,
      activeProviderDependencies: [{ providerId: "github", trust: "stale" }],
    }),
  },
];

console.log(
  JSON.stringify(
    scenarios.map((scenario) => ({
      name: scenario.name,
      decision: evaluateSystemMode(scenario.input, DEFAULT_CONFIG),
    })),
  ),
);
