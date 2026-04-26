import {
  makeBehaviorDraft,
  makeConflictState,
  makeWritebackPlan,
  type BehaviorDraft,
  type ConflictState,
  type WritebackPlan,
} from "../app/lib/writeback";

const scenarios: readonly {
  name: string;
  input: {
    draft: BehaviorDraft;
    plan: Omit<WritebackPlan, "draft"> | null;
    conflict: ConflictState | null;
  };
}[] = [
  {
    name: "user edit draft",
    input: {
      draft: {
        id: "draft:behavior:auth.validate-token:1700000000000",
        behaviorId: "behavior:auth.validate-token",
        proposedSlices: [
          {
            filePath: "app/auth/session.ts",
            startLine: 10,
            endLine: 14,
            newText: "return validateToken(request);\n",
            intentRole: "body",
          },
        ],
        origin: {
          actor: "you-this-session",
          intent: "user-edit",
          timestampMs: 1_700_000_000_000,
          requestId: null,
        },
        parentRevision: "abc123",
        createdAtMs: 1_700_000_000_000,
      },
      plan: null,
      conflict: null,
    },
  },
  {
    name: "agent edit multi slice plan",
    input: {
      draft: {
        id: "draft:behavior:checkout.apply-discount:1700000000100",
        behaviorId: "behavior:checkout.apply-discount",
        proposedSlices: [
          {
            filePath: "app/checkout/discounts.ts",
            startLine: 12,
            endLine: 13,
            newText: "if (!discount.isEligible) return total;\n",
            intentRole: "guard",
          },
          {
            filePath: "app/checkout/discounts.ts",
            startLine: 18,
            endLine: 24,
            newText: "throw new DiscountError(reason);\n",
            intentRole: "error-path",
          },
        ],
        origin: {
          actor: "agents:edit",
          intent: "agent-edit",
          timestampMs: 1_700_000_000_100,
          requestId: "req_123",
        },
        parentRevision: "base-rev-1",
        createdAtMs: 1_700_000_000_100,
      },
      plan: {
        effectiveDiff:
          "--- a/app/checkout/discounts.ts\n" +
          "+++ b/app/checkout/discounts.ts\n" +
          "@@ -12,13 +12,7 @@\n" +
          "+if (!discount.isEligible) return total;\n" +
          "+throw new DiscountError(reason);\n",
        appliesAgainstRevision: "base-rev-1",
        validatedAtMs: 1_700_000_000_150,
      },
      conflict: null,
    },
  },
  {
    name: "promote to test plan",
    input: {
      draft: {
        id: "draft:behavior:billing.invoice-fixture:1700000000200",
        behaviorId: "behavior:billing.invoice-fixture",
        proposedSlices: [
          {
            filePath: "tests/billing/invoice.test.ts",
            startLine: 21,
            endLine: 29,
            newText: "expect(invoice.total).toBe(4200);\n",
            intentRole: "test",
          },
        ],
        origin: {
          actor: "ci",
          intent: "promote-to-test",
          timestampMs: 1_700_000_000_200,
          requestId: null,
        },
        parentRevision: "test-rev-1",
        createdAtMs: 1_700_000_000_200,
      },
      plan: {
        effectiveDiff:
          "--- a/tests/billing/invoice.test.ts\n" +
          "+++ b/tests/billing/invoice.test.ts\n" +
          "@@ -21,9 +21,1 @@\n" +
          "+expect(invoice.total).toBe(4200);\n",
        appliesAgainstRevision: "test-rev-1",
        validatedAtMs: 1_700_000_000_200,
      },
      conflict: null,
    },
  },
  {
    name: "lines changed conflict",
    input: {
      draft: {
        id: "draft:behavior:auth.login-flow:1700000000300",
        behaviorId: "behavior:auth.login-flow",
        proposedSlices: [
          {
            filePath: "app/auth/controller.ts",
            startLine: 4,
            endLine: 4,
            newText: "return login(request);\n",
            intentRole: "entry-point",
          },
        ],
        origin: {
          actor: "you-other-session",
          intent: "user-edit",
          timestampMs: 1_700_000_000_300,
          requestId: null,
        },
        parentRevision: "login-rev-1",
        createdAtMs: 1_700_000_000_300,
      },
      plan: null,
      conflict: {
        draftId: "draft:behavior:auth.login-flow:1700000000300",
        conflictingFiles: [
          {
            filePath: "app/auth/controller.ts",
            conflictKind: "lines-changed",
            sourceUnchanged: false,
          },
        ],
        observedRevision: "login-rev-2",
        expectedRevision: "login-rev-1",
      },
    },
  },
  {
    name: "whitespace only reconcile conflict",
    input: {
      draft: {
        id: "draft:behavior:docs.legacy-export:1700000000400",
        behaviorId: "behavior:docs.legacy-export",
        proposedSlices: [
          {
            filePath: "app/export/legacy.ts",
            startLine: 2,
            endLine: 6,
            newText: "/* legacy export retained */\n",
            intentRole: "annotation",
          },
        ],
        origin: {
          actor: "product:lineage-confirm",
          intent: "reconcile",
          timestampMs: 1_700_000_000_400,
          requestId: null,
        },
        parentRevision: "docs-rev-1",
        createdAtMs: 1_700_000_000_400,
      },
      plan: null,
      conflict: {
        draftId: "draft:behavior:docs.legacy-export:1700000000400",
        conflictingFiles: [
          {
            filePath: "app/export/legacy.ts",
            conflictKind: "whitespace-only",
            sourceUnchanged: true,
          },
        ],
        observedRevision: "docs-rev-2",
        expectedRevision: "docs-rev-1",
      },
    },
  },
  {
    name: "file deleted revert conflict",
    input: {
      draft: {
        id: "draft:behavior:cleanup.removed-flow:1700000000500",
        behaviorId: "behavior:cleanup.removed-flow",
        proposedSlices: [
          {
            filePath: "app/cleanup/removed.ts",
            startLine: 1,
            endLine: 8,
            newText: "",
            intentRole: "body",
          },
        ],
        origin: {
          actor: "git-op",
          intent: "revert",
          timestampMs: 1_700_000_000_500,
          requestId: null,
        },
        parentRevision: "cleanup-rev-1",
        createdAtMs: 1_700_000_000_500,
      },
      plan: null,
      conflict: {
        draftId: "draft:behavior:cleanup.removed-flow:1700000000500",
        conflictingFiles: [
          {
            filePath: "app/cleanup/removed.ts",
            conflictKind: "file-deleted",
            sourceUnchanged: false,
          },
          {
            filePath: "app/cleanup/archive.ts",
            conflictKind: "file-moved",
            sourceUnchanged: true,
          },
        ],
        observedRevision: "cleanup-rev-2",
        expectedRevision: "cleanup-rev-1",
      },
    },
  },
];

console.log(
  JSON.stringify(
    scenarios.map((scenario) => {
      const draft = makeBehaviorDraft(scenario.input.draft);
      const plan =
        scenario.input.plan === null
          ? null
          : makeWritebackPlan({ draft, ...scenario.input.plan });
      const conflict =
        scenario.input.conflict === null
          ? null
          : makeConflictState(scenario.input.conflict);

      return {
        name: scenario.name,
        draft,
        plan,
        conflict,
      };
    }),
  ),
);
