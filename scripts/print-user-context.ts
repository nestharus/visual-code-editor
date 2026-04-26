import {
  makeChangeEvent,
  makeUserContext,
  type ChangeEvent,
  type UserContext,
} from "../app/lib/user-context";

const scenarios: readonly {
  name: string;
  userContext: UserContext;
  changeEvent: ChangeEvent;
}[] = [
  {
    name: "active diagram context with stashed change",
    userContext: {
      id: "user-context:session-1",
      openedSurfaces: [
        {
          kind: "diagram",
          entityId: "system:auth",
          openedAtMs: 1_700_000_000_000,
          lastFocusedAtMs: 1_700_000_000_500,
          totalDwellMs: 500,
        },
        {
          kind: "panel",
          entityId: "module:auth.session",
          openedAtMs: 1_700_000_001_000,
          lastFocusedAtMs: 1_700_000_001_300,
          totalDwellMs: 300,
        },
      ],
      recentPrompts: [
        {
          requestId: "req-001",
          mode: "ask",
          surfaceAnchor: "node",
          selectionCount: 1,
          issuedAtMs: 1_700_000_002_000,
        },
      ],
      activeTaskIds: ["task:t1"],
      activeSliceIds: ["slice:s1"],
      autoMotionDisabled: false,
      computedAtMs: 1_700_000_003_000,
    },
    changeEvent: {
      id: "change:c1",
      kind: "entity-added",
      actor: "agents:direct",
      affectedEntityIds: ["system:auth"],
      affectedKinds: ["system"],
      tier: "stashed",
      blocking: false,
      timestampMs: 1_700_000_004_000,
      contextSummary: "Auth system was added.",
      detailUrl: null,
    },
  },
  {
    name: "deduped context with blocking immediate change",
    userContext: {
      id: "user-context:session-2",
      openedSurfaces: [
        {
          kind: "task",
          entityId: "task:t1",
          openedAtMs: 1_700_000_100_000,
          lastFocusedAtMs: 1_700_000_100_200,
          totalDwellMs: 200,
        },
        {
          kind: "task",
          entityId: "task:t1",
          openedAtMs: 1_700_000_100_000,
          lastFocusedAtMs: 1_700_000_101_000,
          totalDwellMs: 1_000,
        },
        {
          kind: "slice",
          entityId: "slice:s2",
          openedAtMs: 1_700_000_102_000,
          lastFocusedAtMs: 1_700_000_102_400,
          totalDwellMs: 400,
        },
      ],
      recentPrompts: [
        {
          requestId: "req-002",
          mode: "edit",
          surfaceAnchor: "task",
          selectionCount: 2,
          issuedAtMs: 1_700_000_103_000,
        },
        {
          requestId: "req-002",
          mode: "edit",
          surfaceAnchor: "task",
          selectionCount: 3,
          issuedAtMs: 1_700_000_104_000,
        },
      ],
      activeTaskIds: ["task:t1", "task:t1", "task:t2"],
      activeSliceIds: ["slice:s1", "slice:s1", "slice:s2"],
      autoMotionDisabled: true,
      computedAtMs: 1_700_000_105_000,
    },
    changeEvent: {
      id: "change:blocking-ci",
      kind: "ci-run-finished",
      actor: "ci",
      affectedEntityIds: ["task:t2", "slice:s2"],
      affectedKinds: ["task", "slice"],
      tier: "immediate",
      blocking: true,
      timestampMs: 1_700_000_106_000,
      contextSummary: "CI failed for active work.",
      detailUrl: "/tasks/t2/ci",
    },
  },
];

console.log(
  JSON.stringify(
    scenarios.map((scenario) => ({
      name: scenario.name,
      userContext: makeUserContext(scenario.userContext),
      changeEvent: makeChangeEvent(scenario.changeEvent),
    })),
  ),
);
