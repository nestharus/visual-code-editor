import { makePRDeltaSet, type PRDeltaSet } from "../app/lib/pr-delta";

const scenarios: readonly {
  name: string;
  input: PRDeltaSet;
}[] = [
  {
    name: "added behavior in pull request",
    input: {
      id: "prdelta:repo.42",
      baseRevision: "abc123",
      headRevision: "def456",
      baseBranch: "main",
      headBranch: "feature/auth",
      prNumber: 42,
      taskId: null,
      deltas: [
        {
          deltaKind: "added",
          entityKind: "behavior",
          baseId: null,
          headId: "behavior:auth.validate-token",
          relatedIds: [],
          trust: { state: "grounded", grounding: "lsp-type" },
          attributionActor: "generator",
        },
      ],
      computedAtMs: 1_700_000_000_000,
      attributionActor: "generator",
    },
  },
  {
    name: "removed store in pull request",
    input: {
      id: "prdelta:repo.43",
      baseRevision: "abc123",
      headRevision: "fed456",
      baseBranch: "main",
      headBranch: "cleanup/cache-store",
      prNumber: 43,
      taskId: null,
      deltas: [
        {
          deltaKind: "removed",
          entityKind: "store",
          baseId: "store:legacy-cache",
          headId: null,
          relatedIds: [],
          trust: { state: "grounded", grounding: "lsp-type" },
          attributionActor: "generator",
        },
      ],
      computedAtMs: 1_700_000_100_000,
      attributionActor: "generator",
    },
  },
  {
    name: "renamed task in task delta",
    input: {
      id: "prdelta:task.rename-auth",
      baseRevision: "abc123",
      headRevision: "aaa111",
      baseBranch: "main",
      headBranch: "task/rename-auth",
      prNumber: null,
      taskId: "task:rename-auth",
      deltas: [
        {
          deltaKind: "renamed",
          entityKind: "task",
          baseId: "task:auth-old",
          headId: "task:auth-new",
          relatedIds: [],
          trust: { state: "grounded", grounding: "lsp-type" },
          attributionActor: "generator",
        },
      ],
      computedAtMs: 1_700_000_200_000,
      attributionActor: "generator",
    },
  },
  {
    name: "reshaped edge in pull request",
    input: {
      id: "prdelta:repo.44",
      baseRevision: "abc123",
      headRevision: "bbb222",
      baseBranch: "main",
      headBranch: "feature/edge-flow",
      prNumber: 44,
      taskId: null,
      deltas: [
        {
          deltaKind: "reshaped",
          entityKind: "edge",
          baseId: "edge:auth-to-store",
          headId: "edge:auth-to-store",
          relatedIds: [],
          trust: { state: "candidate", grounding: null },
          attributionActor: "generator",
        },
      ],
      computedAtMs: 1_700_000_300_000,
      attributionActor: "generator",
    },
  },
  {
    name: "split behavior lineage in pull request",
    input: {
      id: "prdelta:repo.45",
      baseRevision: "abc123",
      headRevision: "ccc333",
      baseBranch: "main",
      headBranch: "feature/split-auth",
      prNumber: 45,
      taskId: null,
      deltas: [
        {
          deltaKind: "split",
          entityKind: "behavior",
          baseId: "behavior:auth.login",
          headId: "behavior:auth.validate-token",
          relatedIds: ["behavior:auth.issue-session"],
          trust: { state: "grounded", grounding: "lsp-type" },
          attributionActor: "generator",
        },
      ],
      computedAtMs: 1_700_000_400_000,
      attributionActor: "generator",
    },
  },
  {
    name: "merged container lineage in pull request",
    input: {
      id: "prdelta:repo.46",
      baseRevision: "abc123",
      headRevision: "ddd444",
      baseBranch: "main",
      headBranch: "feature/merge-panels",
      prNumber: 46,
      taskId: null,
      deltas: [
        {
          deltaKind: "merged",
          entityKind: "container",
          baseId: "container:panel-primary",
          headId: "container:panel-unified",
          relatedIds: ["container:panel-secondary"],
          trust: { state: "grounded", grounding: "lsp-type" },
          attributionActor: "generator",
        },
      ],
      computedAtMs: 1_700_000_500_000,
      attributionActor: "generator",
    },
  },
  {
    name: "unchanged and unmatched mixed delta",
    input: {
      id: "prdelta:repo.47",
      baseRevision: "abc123",
      headRevision: "eee555",
      baseBranch: "main",
      headBranch: "feature/mixed",
      prNumber: 47,
      taskId: null,
      deltas: [
        {
          deltaKind: "unchanged",
          entityKind: "artifact",
          baseId: "artifact:readme",
          headId: "artifact:readme",
          relatedIds: [],
          trust: { state: "grounded", grounding: "lsp-type" },
          attributionActor: "generator",
        },
        {
          deltaKind: "unmatched",
          entityKind: "test",
          baseId: "test:legacy-export",
          headId: null,
          relatedIds: [],
          trust: { state: "candidate", grounding: null },
          attributionActor: "generator",
        },
      ],
      computedAtMs: 1_700_000_600_000,
      attributionActor: "generator",
    },
  },
  {
    name: "empty no-op pull request delta",
    input: {
      id: "prdelta:repo.48",
      baseRevision: "abc123",
      headRevision: "fff666",
      baseBranch: "main",
      headBranch: "docs/no-op",
      prNumber: 48,
      taskId: null,
      deltas: [],
      computedAtMs: 1_700_000_700_000,
      attributionActor: "generator",
    },
  },
];

console.log(
  JSON.stringify(
    scenarios.map((scenario) => ({
      name: scenario.name,
      prDelta: makePRDeltaSet(scenario.input),
    })),
  ),
);
