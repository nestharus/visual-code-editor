import { expect, test } from "@playwright/test";

import {
  edgeArtifactRoleFromString,
  edgeMechanismKindFromString,
  makeEdgeTransfer,
  type EdgeArtifact,
  type EdgeArtifactRole,
  type EdgeBehaviorCandidate,
  type EdgeMechanismKind,
  type EdgeTransfer,
} from "./edge-transfer";
import type { TrustSignal, TrustState } from "./trust";

const CONTRACT_EDGE_MECHANISM_KINDS = [
  ["ARTIFACT_FLOW", "artifact-flow"],
  ["FEEDBACK_LOOP", "feedback-loop"],
  ["CALL", "call"],
  ["IMPORT", "import"],
  ["STORE_READ", "store-read"],
  ["STORE_WRITE", "store-write"],
  ["PUBLISH", "publish"],
  ["SUBSCRIBE", "subscribe"],
  ["AGENT_INVOKE", "agent-invoke"],
  ["CLUSTER_LINK", "cluster-link"],
  ["UNKNOWN", "unknown"],
] as const satisfies readonly (readonly [string, EdgeMechanismKind])[];

const CONTRACT_EDGE_ARTIFACT_ROLES = [
  ["CARRIED", "carried"],
  ["PRODUCED", "produced"],
  ["CONSUMED", "consumed"],
  ["SHARED", "shared"],
] as const satisfies readonly (readonly [string, EdgeArtifactRole])[];

const CONTRACT_MECHANISM_VALUES = CONTRACT_EDGE_MECHANISM_KINDS.map(([, kind]) => kind);
const CONTRACT_ROLE_VALUES = CONTRACT_EDGE_ARTIFACT_ROLES.map(([, role]) => role);

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type ContractMechanismKind = (typeof CONTRACT_EDGE_MECHANISM_KINDS)[number][1];
type ContractArtifactRole = (typeof CONTRACT_EDGE_ARTIFACT_ROLES)[number][1];
type _MechanismKindMembership = Assert<Equal<EdgeMechanismKind, ContractMechanismKind>>;
type _ArtifactRoleMembership = Assert<Equal<EdgeArtifactRole, ContractArtifactRole>>;

const TRUST_ORDER: readonly TrustState[] = [
  "grounded",
  "candidate",
  "conflicting",
  "stale",
  "orphaned",
];

const describe = test.describe;
const it = test;

function trust(
  state: TrustState = "candidate",
  grounding: TrustSignal["grounding"] = null,
): TrustSignal {
  return { state, grounding };
}

function artifact(name = "workspace.plan", role: EdgeArtifactRole = "carried"): EdgeArtifact {
  return { name, role };
}

function candidate(
  behaviourId = "behaviour.shared-handoff",
  signal: TrustSignal = trust(),
  evidenceSource = "naming-overlap",
): EdgeBehaviorCandidate {
  return { behaviourId, trust: signal, evidenceSource };
}

function transfer(overrides: Partial<EdgeTransfer> = {}): EdgeTransfer {
  return makeEdgeTransfer({
    edgeId: "edge.source.target",
    mechanismKind: "call",
    summary: "Source calls target.",
    trust: trust(),
    artifacts: [artifact()],
    behaviourCandidates: [candidate()],
    attributionActor: "generator",
    legacyMechanism: null,
    ...overrides,
  });
}

describe("EdgeTransfer contract", () => {
  for (const [memberName, kindValue] of CONTRACT_EDGE_MECHANISM_KINDS) {
    it(`contains contract mechanism kind ${memberName} with stable string value ${kindValue}`, () => {
      expect(edgeMechanismKindFromString(kindValue)).toBe(kindValue);
    });
  }

  for (const [memberName, roleValue] of CONTRACT_EDGE_ARTIFACT_ROLES) {
    it(`contains contract artifact role ${memberName} with stable string value ${roleValue}`, () => {
      expect(edgeArtifactRoleFromString(roleValue)).toBe(roleValue);
    });
  }

  it("contains exactly the 11 contract mechanism kinds", () => {
    expect(CONTRACT_MECHANISM_VALUES).toHaveLength(11);
    expect(new Set(CONTRACT_MECHANISM_VALUES).size).toBe(11);
  });

  it("contains exactly the 4 contract artifact roles", () => {
    expect(CONTRACT_ROLE_VALUES).toHaveLength(4);
    expect(new Set(CONTRACT_ROLE_VALUES).size).toBe(4);
  });

  it("throws instead of silently accepting unknown mechanism strings", () => {
    for (const invalidValue of ["", "artifact_flow", "file-import", "CALL", "store-read "]) {
      expect(
        () => edgeMechanismKindFromString(invalidValue),
        `edgeMechanismKindFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("throws instead of silently accepting unknown artifact role strings", () => {
    for (const invalidValue of ["", "payload", "produced ", "CARRIED", "shared-artifact"]) {
      expect(
        () => edgeArtifactRoleFromString(invalidValue),
        `edgeArtifactRoleFromString strictness invariant violated for ${invalidValue}`,
      ).toThrow();
    }
  });

  it("rejects an empty summary", () => {
    expect(() => transfer({ summary: "" })).toThrow();
  });

  it("rejects duplicate artifact names", () => {
    expect(() =>
      transfer({
        artifacts: [
          artifact("workspace.plan", "produced"),
          artifact("workspace.plan", "consumed"),
        ],
      }),
    ).toThrow();
  });

  it("rejects duplicate candidate behaviour ids", () => {
    expect(() =>
      transfer({
        behaviourCandidates: [
          candidate("behaviour.shared-handoff", trust(), "naming-overlap"),
          candidate("behaviour.shared-handoff", trust(), "shared-artifact"),
        ],
      }),
    ).toThrow();
  });

  it("reasserts that grounded candidate trust requires grounding", () => {
    expect(() =>
      transfer({
        behaviourCandidates: [
          candidate("behaviour.invalid-grounded", { state: "grounded", grounding: null }),
        ],
      }),
    ).toThrow();
  });

  for (const mechanismKind of CONTRACT_MECHANISM_VALUES) {
    it(`accepts no legacy mechanism for ${mechanismKind}`, () => {
      expect(transfer({ mechanismKind, legacyMechanism: null }).legacyMechanism).toBeNull();
    });
  }

  it("accepts a legacy mechanism only when the mechanism kind is unknown", () => {
    expect(
      transfer({
        mechanismKind: "unknown",
        legacyMechanism: "fixture-bespoke-edge",
      }),
    ).toMatchObject({
      mechanismKind: "unknown",
      legacyMechanism: "fixture-bespoke-edge",
    });
  });

  it("rejects a legacy mechanism for classified mechanism kinds", () => {
    for (const mechanismKind of CONTRACT_MECHANISM_VALUES.filter((kind) => kind !== "unknown")) {
      expect(
        () => transfer({ mechanismKind, legacyMechanism: "fixture-bespoke-edge" }),
        `legacy mechanism transition rule violated for ${mechanismKind}`,
      ).toThrow();
    }
  });

  it("preserves caller artifact order in makeEdgeTransfer", () => {
    const artifacts = [
      artifact("third", "shared"),
      artifact("first", "produced"),
      artifact("second", "consumed"),
    ] as const satisfies readonly EdgeArtifact[];

    expect(
      makeEdgeTransfer({
        edgeId: "edge.artifacts",
        mechanismKind: "artifact-flow",
        summary: "Artifacts move in caller-provided order.",
        trust: trust(),
        artifacts,
        behaviourCandidates: [],
        attributionActor: null,
        legacyMechanism: null,
      }).artifacts,
    ).toEqual(artifacts);
  });

  it("sorts candidates by trust descending then evidence source in makeEdgeTransfer", () => {
    const candidates = [
      candidate("behaviour.stale", trust("stale"), "z-source"),
      candidate("behaviour.grounded-b", trust("grounded", "test"), "b-source"),
      candidate("behaviour.candidate", trust("candidate"), "a-source"),
      candidate("behaviour.grounded-a", trust("grounded", "annotation"), "a-source"),
      candidate("behaviour.conflicting", trust("conflicting"), "c-source"),
    ] as const satisfies readonly EdgeBehaviorCandidate[];

    const transferWithCandidates = makeEdgeTransfer({
      edgeId: "edge.candidates",
      mechanismKind: "publish",
      summary: "Candidates are sorted by confidence.",
      trust: trust(),
      artifacts: [],
      behaviourCandidates: candidates,
      attributionActor: null,
      legacyMechanism: null,
    });

    expect(
      transferWithCandidates.behaviourCandidates.map((entry) => [
        TRUST_ORDER.indexOf(entry.trust.state),
        entry.evidenceSource,
        entry.behaviourId,
      ]),
    ).toEqual([
      [0, "a-source", "behaviour.grounded-a"],
      [0, "b-source", "behaviour.grounded-b"],
      [1, "a-source", "behaviour.candidate"],
      [2, "c-source", "behaviour.conflicting"],
      [3, "z-source", "behaviour.stale"],
    ]);
  });
});
