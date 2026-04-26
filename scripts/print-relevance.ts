import { classify, DEFAULT_CONFIG, type ClassifierConfig } from "../app/lib/relevance";
import {
  makeChangeEvent,
  makeUserContext,
  type ChangeEvent,
  type UserContext,
} from "../app/lib/user-context";

interface Scenario {
  name: string;
  nowMs: number;
  config: Partial<ClassifierConfig>;
  userContext: UserContext;
  changeEvent: ChangeEvent;
}

const emptyContext = (computedAtMs: number): UserContext => ({
  id: "user-context:relevance",
  openedSurfaces: [],
  recentPrompts: [],
  activeTaskIds: [],
  activeSliceIds: [],
  autoMotionDisabled: false,
  computedAtMs,
});

const scenarios: readonly Scenario[] = [
  {
    name: "always immediate rename",
    nowMs: 1_700_000_000_000,
    config: {},
    userContext: emptyContext(1_700_000_000_000),
    changeEvent: {
      id: "change:rename",
      kind: "entity-renamed",
      actor: "you-this-session",
      affectedEntityIds: ["system:auth"],
      affectedKinds: ["system"],
      tier: "stashed",
      blocking: false,
      timestampMs: 0,
      contextSummary: "Auth renamed.",
      detailUrl: null,
    },
  },
  {
    name: "always stashed provider sync",
    nowMs: 1_700_000_000_000,
    config: { immediateThreshold: 0.0, stashedThreshold: 0.0 },
    userContext: {
      ...emptyContext(1_700_000_000_000),
      openedSurfaces: [
        {
          kind: "diagram",
          entityId: "system:auth",
          openedAtMs: 1_699_999_990_000,
          lastFocusedAtMs: 1_699_999_999_000,
          totalDwellMs: 9_000,
        },
      ],
    },
    changeEvent: {
      id: "change:provider-sync",
      kind: "provider-sync",
      actor: "provider:github:sync",
      affectedEntityIds: ["system:auth"],
      affectedKinds: ["system"],
      tier: "stashed",
      blocking: false,
      timestampMs: 1_700_000_000_000,
      contextSummary: "Provider sync finished.",
      detailUrl: null,
    },
  },
  {
    name: "blocking task update",
    nowMs: 1_700_000_000_000,
    config: { immediateThreshold: 1.0, stashedThreshold: 1.0 },
    userContext: emptyContext(1_700_000_000_000),
    changeEvent: {
      id: "change:blocking",
      kind: "task-state-change",
      actor: "ci",
      affectedEntityIds: ["task:t1"],
      affectedKinds: ["task"],
      tier: "immediate",
      blocking: true,
      timestampMs: 0,
      contextSummary: "Task is blocked.",
      detailUrl: null,
    },
  },
  {
    name: "recent scored event",
    nowMs: 1_700_000_000_000,
    config: {},
    userContext: emptyContext(1_700_000_000_000),
    changeEvent: {
      id: "change:recent",
      kind: "entity-added",
      actor: "agents:direct",
      affectedEntityIds: ["system:auth"],
      affectedKinds: ["system"],
      tier: "stashed",
      blocking: false,
      timestampMs: 1_700_000_000_000,
      contextSummary: "Auth added.",
      detailUrl: null,
    },
  },
  {
    name: "old scored event",
    nowMs: 1_700_000_000_000,
    config: {},
    userContext: emptyContext(1_700_000_000_000),
    changeEvent: {
      id: "change:old",
      kind: "entity-added",
      actor: "agents:direct",
      affectedEntityIds: ["system:auth"],
      affectedKinds: ["system"],
      tier: "stashed",
      blocking: false,
      timestampMs: 0,
      contextSummary: "Auth added earlier.",
      detailUrl: null,
    },
  },
  {
    name: "on surface match",
    nowMs: 1_700_000_000_000,
    config: {},
    userContext: {
      ...emptyContext(1_700_000_000_000),
      openedSurfaces: [
        {
          kind: "diagram",
          entityId: "system:auth",
          openedAtMs: 1_699_999_990_000,
          lastFocusedAtMs: 1_699_999_999_000,
          totalDwellMs: 9_000,
        },
      ],
    },
    changeEvent: {
      id: "change:on-surface",
      kind: "entity-added",
      actor: "agents:direct",
      affectedEntityIds: ["system:auth"],
      affectedKinds: ["system"],
      tier: "stashed",
      blocking: false,
      timestampMs: 1_700_000_000_000,
      contextSummary: "Auth changed on open surface.",
      detailUrl: null,
    },
  },
  {
    name: "you this session",
    nowMs: 1_700_000_000_000,
    config: {},
    userContext: emptyContext(1_700_000_000_000),
    changeEvent: {
      id: "change:this-session",
      kind: "entity-added",
      actor: "you-this-session",
      affectedEntityIds: ["system:auth"],
      affectedKinds: ["system"],
      tier: "stashed",
      blocking: false,
      timestampMs: 1_700_000_000_000,
      contextSummary: "Own local change.",
      detailUrl: null,
    },
  },
  {
    name: "you other session",
    nowMs: 1_700_000_000_000,
    config: {},
    userContext: emptyContext(1_700_000_000_000),
    changeEvent: {
      id: "change:other-session",
      kind: "entity-added",
      actor: "you-other-session",
      affectedEntityIds: ["system:auth"],
      affectedKinds: ["system"],
      tier: "stashed",
      blocking: false,
      timestampMs: 1_700_000_000_000,
      contextSummary: "Own other session change.",
      detailUrl: null,
    },
  },
  {
    name: "threshold stashed",
    nowMs: 1_000,
    config: {
      recencyWindowMs: 100,
      recencyWeight: 1.0,
      onSurfaceWeight: 0.0,
      providerWeight: 0.0,
      actorWeight: 0.0,
      contextMatchWeight: 0.0,
      immediateThreshold: 0.55,
      stashedThreshold: 0.20,
      providerTierWeight: {},
    },
    userContext: emptyContext(1_000),
    changeEvent: {
      id: "change:threshold-stashed",
      kind: "entity-added",
      actor: "generator",
      affectedEntityIds: ["system:auth"],
      affectedKinds: ["system"],
      tier: "stashed",
      blocking: false,
      timestampMs: 954,
      contextSummary: "Threshold stashed.",
      detailUrl: null,
    },
  },
  {
    name: "threshold immediate",
    nowMs: 1_000,
    config: {
      recencyWindowMs: 100,
      recencyWeight: 1.0,
      onSurfaceWeight: 0.0,
      providerWeight: 0.0,
      actorWeight: 0.0,
      contextMatchWeight: 0.0,
      immediateThreshold: 0.55,
      stashedThreshold: 0.20,
      providerTierWeight: {},
    },
    userContext: emptyContext(1_000),
    changeEvent: {
      id: "change:threshold-immediate",
      kind: "entity-added",
      actor: "generator",
      affectedEntityIds: ["system:auth"],
      affectedKinds: ["system"],
      tier: "stashed",
      blocking: false,
      timestampMs: 955,
      contextSummary: "Threshold immediate.",
      detailUrl: null,
    },
  },
  {
    name: "suppressed below stashed threshold",
    nowMs: 1_700_000_000_000,
    config: {},
    userContext: emptyContext(1_700_000_000_000),
    changeEvent: {
      id: "change:suppressed",
      kind: "entity-added",
      actor: "generator",
      affectedEntityIds: ["system:auth"],
      affectedKinds: ["system"],
      tier: "stashed",
      blocking: false,
      timestampMs: 0,
      contextSummary: "Old generated change.",
      detailUrl: null,
    },
  },
];

console.log(
  JSON.stringify(
    scenarios.map((scenario) => {
      const decision = classify(
        makeChangeEvent(scenario.changeEvent),
        makeUserContext(scenario.userContext),
        { ...DEFAULT_CONFIG, ...scenario.config },
        scenario.nowMs,
      );

      return {
        name: scenario.name,
        decision: {
          tier: decision.tier,
          totalScore: decision.totalScore,
          reason: decision.reason,
          rulesFired: decision.rulesFired,
        },
      };
    }),
  ),
);
