import {
  DEFAULT_CONFIG,
  evaluate,
  type ArtifactSnapshot,
  type LifecycleConfig,
} from "../app/lib/lifecycle";

interface Scenario {
  name: string;
  nowMs: number;
  config: Partial<LifecycleConfig>;
  snapshot: ArtifactSnapshot;
}

const NOW_MS = 1_700_000_000_000;

const scenarios: readonly Scenario[] = [
  {
    name: "dismissed terminal",
    nowMs: NOW_MS,
    config: {},
    snapshot: {
      artifactId: "slice:dismissed",
      currentState: "dismissed",
      createdAtMs: NOW_MS - 60_000,
      ttlMs: NOW_MS - 1,
      tombstonedAtMs: null,
    },
  },
  {
    name: "pinned preserved",
    nowMs: NOW_MS,
    config: {},
    snapshot: {
      artifactId: "slice:pinned",
      currentState: "pinned",
      createdAtMs: NOW_MS - 60_000,
      ttlMs: null,
      tombstonedAtMs: null,
    },
  },
  {
    name: "old tombstone purgeable",
    nowMs: NOW_MS,
    config: {},
    snapshot: {
      artifactId: "slice:old-tombstone",
      currentState: "tombstoned",
      createdAtMs: NOW_MS - 86_500_000,
      ttlMs: NOW_MS - 86_400_000,
      tombstonedAtMs: NOW_MS - 86_400_000,
    },
  },
  {
    name: "recent tombstone retained",
    nowMs: NOW_MS,
    config: {},
    snapshot: {
      artifactId: "slice:recent-tombstone",
      currentState: "tombstoned",
      createdAtMs: NOW_MS - 60_000,
      ttlMs: NOW_MS - 30_000,
      tombstonedAtMs: NOW_MS - 30_000,
    },
  },
  {
    name: "ttl elapsed",
    nowMs: NOW_MS,
    config: {},
    snapshot: {
      artifactId: "slice:elapsed",
      currentState: "active",
      createdAtMs: NOW_MS - 60_000,
      ttlMs: NOW_MS - 1,
      tombstonedAtMs: null,
    },
  },
  {
    name: "ttl elapsed after grace",
    nowMs: NOW_MS,
    config: { tombstoneGraceMs: 250 },
    snapshot: {
      artifactId: "slice:elapsed-grace",
      currentState: "active",
      createdAtMs: NOW_MS - 60_000,
      ttlMs: NOW_MS - 250,
      tombstonedAtMs: null,
    },
  },
  {
    name: "warning window",
    nowMs: NOW_MS,
    config: {},
    snapshot: {
      artifactId: "slice:warning-window",
      currentState: "active",
      createdAtMs: NOW_MS - 60_000,
      ttlMs: NOW_MS + 60_000,
      tombstonedAtMs: null,
    },
  },
  {
    name: "plenty remaining",
    nowMs: NOW_MS,
    config: {},
    snapshot: {
      artifactId: "slice:plenty-remaining",
      currentState: "active",
      createdAtMs: NOW_MS - 60_000,
      ttlMs: NOW_MS + 300_001,
      tombstonedAtMs: null,
    },
  },
  {
    name: "recovered remaining",
    nowMs: NOW_MS,
    config: {},
    snapshot: {
      artifactId: "slice:recovered",
      currentState: "recovered",
      createdAtMs: NOW_MS - 60_000,
      ttlMs: NOW_MS + 300_001,
      tombstonedAtMs: null,
    },
  },
  {
    name: "ttl boundary",
    nowMs: NOW_MS,
    config: {},
    snapshot: {
      artifactId: "slice:ttl-boundary",
      currentState: "active",
      createdAtMs: NOW_MS - 60_000,
      ttlMs: NOW_MS,
      tombstonedAtMs: null,
    },
  },
  {
    name: "warning boundary",
    nowMs: NOW_MS,
    config: {},
    snapshot: {
      artifactId: "slice:warning-boundary",
      currentState: "active",
      createdAtMs: NOW_MS - 60_000,
      ttlMs: NOW_MS + 300_000,
      tombstonedAtMs: null,
    },
  },
];

console.log(
  JSON.stringify(
    scenarios.map((scenario) => {
      const decision = evaluate(
        scenario.snapshot,
        scenario.nowMs,
        { ...DEFAULT_CONFIG, ...scenario.config },
      );

      return {
        name: scenario.name,
        decision: {
          nextState: decision.nextState,
          changed: decision.changed,
          reason: decision.reason,
        },
      };
    }),
  ),
);
