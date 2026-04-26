import { makeBehavior, type Behavior } from "../app/lib/behavior";

const scenarios: readonly {
  name: string;
  input: Behavior;
}[] = [
  {
    name: "candidate single body slice",
    input: {
      id: "behavior:auth.validate-token",
      label: "Validate token",
      description: "Confirms a request token before session access.",
      sourceSlices: [
        {
          filePath: "app/auth/session.ts",
          startLine: 10,
          endLine: 14,
          startCol: null,
          endCol: null,
          sliceRole: "body",
          discoveredBy: "generator",
          confirmedBy: null,
        },
      ],
      trust: { state: "candidate", grounding: null },
      parentBehaviorId: null,
      attributionActor: "generator",
    },
  },
  {
    name: "grounded multi file behavior",
    input: {
      id: "behavior:auth.login-flow",
      label: "Login flow",
      description: null,
      sourceSlices: [
        {
          filePath: "app/auth/controller.ts",
          startLine: 4,
          endLine: 4,
          startCol: 2,
          endCol: 18,
          sliceRole: "entry-point",
          discoveredBy: "agents:slice-constructor",
          confirmedBy: "you-this-session",
        },
        {
          filePath: "app/auth/session.ts",
          startLine: 20,
          endLine: 31,
          startCol: null,
          endCol: null,
          sliceRole: "body",
          discoveredBy: "agents:slice-constructor",
          confirmedBy: "you-this-session",
        },
        {
          filePath: "app/auth/audit.ts",
          startLine: 8,
          endLine: 8,
          startCol: 4,
          endCol: 22,
          sliceRole: "telemetry",
          discoveredBy: "agents:provider-mapper",
          confirmedBy: null,
        },
      ],
      trust: { state: "grounded", grounding: "test" },
      parentBehaviorId: "behavior:auth",
      attributionActor: "you-this-session",
    },
  },
  {
    name: "conflicting behavior with guard and error path",
    input: {
      id: "behavior:checkout.apply-discount",
      label: "Apply discount",
      description: "Applies eligible discounts before checkout totals are persisted.",
      sourceSlices: [
        {
          filePath: "app/checkout/discounts.ts",
          startLine: 12,
          endLine: 13,
          startCol: 1,
          endCol: 80,
          sliceRole: "guard",
          discoveredBy: "product:auto-focus",
          confirmedBy: null,
        },
        {
          filePath: "app/checkout/discounts.ts",
          startLine: 18,
          endLine: 24,
          startCol: null,
          endCol: null,
          sliceRole: "error-path",
          discoveredBy: "product:auto-focus",
          confirmedBy: "unknown-external",
        },
      ],
      trust: { state: "conflicting", grounding: null },
      parentBehaviorId: null,
      attributionActor: null,
    },
  },
  {
    name: "stale test fixture behavior",
    input: {
      id: "behavior:billing.invoice-fixture",
      label: "Invoice fixture",
      description: null,
      sourceSlices: [
        {
          filePath: "tests/billing/invoice.test.ts",
          startLine: 7,
          endLine: 15,
          startCol: null,
          endCol: null,
          sliceRole: "fixture",
          discoveredBy: "ci",
          confirmedBy: null,
        },
        {
          filePath: "tests/billing/invoice.test.ts",
          startLine: 21,
          endLine: 29,
          startCol: null,
          endCol: null,
          sliceRole: "test",
          discoveredBy: "ci",
          confirmedBy: null,
        },
      ],
      trust: { state: "stale", grounding: null },
      parentBehaviorId: "behavior:billing",
      attributionActor: "ci",
    },
  },
  {
    name: "orphaned annotation behavior",
    input: {
      id: "behavior:docs.legacy-export",
      label: "Legacy export note",
      description: "Comment-only behavior retained until export code is mapped.",
      sourceSlices: [
        {
          filePath: "app/export/legacy.ts",
          startLine: 2,
          endLine: 6,
          startCol: 1,
          endCol: 1,
          sliceRole: "annotation",
          discoveredBy: "unknown-external",
          confirmedBy: null,
        },
      ],
      trust: { state: "orphaned", grounding: null },
      parentBehaviorId: null,
      attributionActor: "unknown-external",
    },
  },
];

console.log(
  JSON.stringify(
    scenarios.map((scenario) => ({
      name: scenario.name,
      behavior: makeBehavior(scenario.input),
    })),
  ),
);
