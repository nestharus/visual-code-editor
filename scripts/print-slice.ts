import { makeSlice, type Slice } from "../app/lib/slice";

const scenarios: readonly {
  name: string;
  input: Slice;
}[] = [
  {
    name: "active exact slice",
    input: {
      id: "slice:auth-search",
      query: "auth",
      matchedEntityIds: ["system:auth"],
      neighbourhoodEntityIds: [],
      rule: {
        kind: "exact",
        edgeKinds: [],
        maxHops: 0,
      },
      lifecycleState: "active",
      ttlMs: 1_700_000_900_000,
      createdBy: "you-this-session",
      createdAtMs: 1_700_000_000_000,
      pinnedAtMs: null,
      trust: { state: "grounded", grounding: "lsp-type" },
    },
  },
  {
    name: "pinned transitive import slice",
    input: {
      id: "slice:imports.auth",
      query: "imports:auth",
      matchedEntityIds: ["file:auth.entry"],
      neighbourhoodEntityIds: ["file:auth.session", "file:auth.store"],
      rule: {
        kind: "transitive-by-edge-kind",
        edgeKinds: ["file-import"],
        maxHops: 3,
      },
      lifecycleState: "pinned",
      ttlMs: null,
      createdBy: "agents:slice-constructor",
      createdAtMs: 1_700_000_100_000,
      pinnedAtMs: 1_700_000_120_000,
      trust: { state: "grounded", grounding: "lsp-type" },
    },
  },
  {
    name: "tombstoned direct neighbour slice",
    input: {
      id: "slice:billing.retry",
      query: "retry",
      matchedEntityIds: ["behavior:billing.retry"],
      neighbourhoodEntityIds: ["module:billing.worker", "store:billing-attempts"],
      rule: {
        kind: "direct-neighbours",
        edgeKinds: [],
        maxHops: 0,
      },
      lifecycleState: "tombstoned",
      ttlMs: 1_700_000_800_000,
      createdBy: "you-this-session",
      createdAtMs: 1_700_000_200_000,
      pinnedAtMs: null,
      trust: { state: "grounded", grounding: "lsp-type" },
    },
  },
];

console.log(
  JSON.stringify(
    scenarios.map((scenario) => ({
      name: scenario.name,
      slice: makeSlice(scenario.input),
    })),
  ),
);
