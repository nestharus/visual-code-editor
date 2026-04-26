import { makeEdgeTransfer, type EdgeTransfer } from "../app/lib/edge-transfer";

const scenarios: readonly {
  name: string;
  input: EdgeTransfer;
}[] = [
  {
    name: "grounded call with produced artifact",
    input: {
      edgeId: "edge.call.grounded",
      mechanismKind: "call",
      summary: "Controller calls renderer.",
      trust: { state: "grounded", grounding: "test" },
      artifacts: [{ name: "render-request", role: "produced" }],
      behaviourCandidates: [],
      attributionActor: "generator",
      legacyMechanism: null,
    },
  },
  {
    name: "candidate import with no artifacts",
    input: {
      edgeId: "edge.import.candidate",
      mechanismKind: "import",
      summary: "File imports helper.",
      trust: { state: "candidate", grounding: null },
      artifacts: [],
      behaviourCandidates: [],
      attributionActor: null,
      legacyMechanism: null,
    },
  },
  {
    name: "unknown legacy mechanism bridge",
    input: {
      edgeId: "edge.legacy.unknown",
      mechanismKind: "unknown",
      summary: "Legacy edge retained during migration.",
      trust: { state: "orphaned", grounding: null },
      artifacts: [],
      behaviourCandidates: [],
      attributionActor: "unknown-external",
      legacyMechanism: "fixture-bespoke-edge",
    },
  },
  {
    name: "store read preserves artifact order",
    input: {
      edgeId: "edge.store.read",
      mechanismKind: "store-read",
      summary: "Module reads session and settings.",
      trust: { state: "candidate", grounding: null },
      artifacts: [
        { name: "session-cache", role: "shared" },
        { name: "settings-record", role: "consumed" },
      ],
      behaviourCandidates: [],
      attributionActor: "agents:provider-mapper",
      legacyMechanism: null,
    },
  },
  {
    name: "publish sorts behaviour candidates",
    input: {
      edgeId: "edge.publish.candidates",
      mechanismKind: "publish",
      summary: "Publisher emits lifecycle event.",
      trust: { state: "candidate", grounding: null },
      artifacts: [{ name: "lifecycle-event", role: "carried" }],
      behaviourCandidates: [
        {
          behaviourId: "behaviour.stale",
          trust: { state: "stale", grounding: null },
          evidenceSource: "z-source",
        },
        {
          behaviourId: "behaviour.grounded-b",
          trust: { state: "grounded", grounding: "annotation" },
          evidenceSource: "b-source",
        },
        {
          behaviourId: "behaviour.candidate",
          trust: { state: "candidate", grounding: null },
          evidenceSource: "a-source",
        },
        {
          behaviourId: "behaviour.grounded-a",
          trust: { state: "grounded", grounding: "test" },
          evidenceSource: "a-source",
        },
      ],
      attributionActor: "product:auto-focus",
      legacyMechanism: null,
    },
  },
  {
    name: "feedback loop stale summary",
    input: {
      edgeId: "edge.feedback.stale",
      mechanismKind: "feedback-loop",
      summary: "Retry step loops back to validation.",
      trust: { state: "stale", grounding: null },
      artifacts: [],
      behaviourCandidates: [],
      attributionActor: "you-this-session",
      legacyMechanism: null,
    },
  },
  {
    name: "agent invoke with grounded candidate",
    input: {
      edgeId: "edge.agent.invoke",
      mechanismKind: "agent-invoke",
      summary: "Runtime invokes implementation agent.",
      trust: { state: "grounded", grounding: "provider-verified" },
      artifacts: [{ name: "agent-task", role: "carried" }],
      behaviourCandidates: [
        {
          behaviourId: "behaviour.agent-dispatch",
          trust: { state: "grounded", grounding: "provider-verified" },
          evidenceSource: "user-tagged",
        },
      ],
      attributionActor: "agents:direct",
      legacyMechanism: null,
    },
  },
  {
    name: "cluster link without attribution",
    input: {
      edgeId: "edge.cluster.link",
      mechanismKind: "cluster-link",
      summary: "Cluster relates to downstream system.",
      trust: { state: "conflicting", grounding: null },
      artifacts: [],
      behaviourCandidates: [],
      attributionActor: null,
      legacyMechanism: null,
    },
  },
];

console.log(
  JSON.stringify(
    scenarios.map((scenario) => ({
      name: scenario.name,
      transfer: makeEdgeTransfer(scenario.input),
    })),
  ),
);
