import {
  makeReviewThread,
  makeReviewVerdict,
  type ReviewThread,
  type ReviewVerdict,
} from "../app/lib/review-thread";

const scenarios: readonly {
  name: string;
  thread: ReviewThread;
  verdict: ReviewVerdict | null;
}[] = [
  {
    name: "open head behavior review thread",
    thread: {
      id: "review:auth-thread.1",
      deltaSetId: "prdelta:repo.42",
      anchorKind: "behavior",
      anchorId: "behavior:auth.validate-token",
      anchorSide: "head",
      status: "open",
      comments: [
        {
          id: "comment:auth-thread.1",
          threadId: "review:auth-thread.1",
          actor: "you-this-session",
          text: "Please verify the token expiry path.",
          createdAtMs: 1_700_000_000_000,
        },
      ],
      createdAtMs: 1_700_000_000_000,
      resolvedAtMs: null,
      resolvedBy: null,
    },
    verdict: null,
  },
  {
    name: "resolved base store review thread with verdict",
    thread: {
      id: "review:cache-thread.2",
      deltaSetId: "prdelta:repo.43",
      anchorKind: "store",
      anchorId: "store:legacy-cache",
      anchorSide: "base",
      status: "resolved",
      comments: [
        {
          id: "comment:cache-thread.1",
          threadId: "review:cache-thread.2",
          actor: "another-user",
          text: "Legacy cache removal needs confirmation.",
          createdAtMs: 1_700_000_100_000,
        },
        {
          id: "comment:cache-thread.2",
          threadId: "review:cache-thread.2",
          actor: "you-this-session",
          text: "Confirmed by the migration test.",
          createdAtMs: 1_700_000_101_000,
        },
      ],
      createdAtMs: 1_700_000_100_000,
      resolvedAtMs: 1_700_000_102_000,
      resolvedBy: "you-this-session",
    },
    verdict: {
      deltaSetId: "prdelta:repo.43",
      decision: "approved",
      decidedBy: "you-this-session",
      decidedAtMs: 1_700_000_103_000,
      rationale: "The removal is covered and the thread is resolved.",
    },
  },
  {
    name: "frozen task review thread with requested changes verdict",
    thread: {
      id: "review:task-thread.3",
      deltaSetId: "prdelta:task.rename-auth",
      anchorKind: "task",
      anchorId: "task:auth-old",
      anchorSide: "base",
      status: "frozen",
      comments: [
        {
          id: "comment:task-thread.1",
          threadId: "review:task-thread.3",
          actor: "agents:direct",
          text: "Anchor changed while the task was renamed.",
          createdAtMs: 1_700_000_200_000,
        },
      ],
      createdAtMs: 1_700_000_200_000,
      resolvedAtMs: null,
      resolvedBy: null,
    },
    verdict: {
      deltaSetId: "prdelta:task.rename-auth",
      decision: "changes-requested",
      decidedBy: "another-user",
      decidedAtMs: 1_700_000_201_000,
      rationale: "The frozen anchor must be re-anchored before approval.",
    },
  },
];

console.log(
  JSON.stringify(
    scenarios.map((scenario) => ({
      name: scenario.name,
      thread: makeReviewThread(scenario.thread),
      verdict: scenario.verdict === null ? null : makeReviewVerdict(scenario.verdict),
    })),
  ),
);
