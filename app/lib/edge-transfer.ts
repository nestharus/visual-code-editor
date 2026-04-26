import type { ActorKind } from "./actors";
import type { TrustSignal, TrustState } from "./trust";

export type EdgeMechanismKind =
  | "artifact-flow"
  | "feedback-loop"
  | "call"
  | "import"
  | "store-read"
  | "store-write"
  | "publish"
  | "subscribe"
  | "agent-invoke"
  | "cluster-link"
  | "unknown";

export type EdgeArtifactRole = "carried" | "produced" | "consumed" | "shared";

export interface EdgeArtifact {
  name: string;
  role: EdgeArtifactRole;
}

export interface EdgeBehaviorCandidate {
  behaviourId: string;
  trust: TrustSignal;
  evidenceSource: string;
}

export interface EdgeTransfer {
  edgeId: string;
  mechanismKind: EdgeMechanismKind;
  summary: string;
  trust: TrustSignal;
  artifacts: readonly EdgeArtifact[];
  behaviourCandidates: readonly EdgeBehaviorCandidate[];
  attributionActor: ActorKind | null;
  legacyMechanism: string | null;
}

const EDGE_MECHANISM_KINDS = [
  "artifact-flow",
  "feedback-loop",
  "call",
  "import",
  "store-read",
  "store-write",
  "publish",
  "subscribe",
  "agent-invoke",
  "cluster-link",
  "unknown",
] as const satisfies readonly EdgeMechanismKind[];

const EDGE_ARTIFACT_ROLES = [
  "carried",
  "produced",
  "consumed",
  "shared",
] as const satisfies readonly EdgeArtifactRole[];

const TRUST_STATE_ORDER: Readonly<Record<TrustState, number>> = {
  grounded: 0,
  candidate: 1,
  conflicting: 2,
  stale: 3,
  orphaned: 4,
};

const EDGE_MECHANISM_KIND_SET: ReadonlySet<string> = new Set(EDGE_MECHANISM_KINDS);
const EDGE_ARTIFACT_ROLE_SET: ReadonlySet<string> = new Set(EDGE_ARTIFACT_ROLES);

export function edgeMechanismKindFromString(value: string): EdgeMechanismKind {
  if (EDGE_MECHANISM_KIND_SET.has(value)) {
    return value as EdgeMechanismKind;
  }

  throw new Error(`Unknown edge mechanism kind: ${value}`);
}

export function edgeArtifactRoleFromString(value: string): EdgeArtifactRole {
  if (EDGE_ARTIFACT_ROLE_SET.has(value)) {
    return value as EdgeArtifactRole;
  }

  throw new Error(`Unknown edge artifact role: ${value}`);
}

function validateTrustSignal(trust: TrustSignal): void {
  const hasGrounding = trust.grounding !== null;
  const isGrounded = trust.state === "grounded";

  if (isGrounded !== hasGrounding) {
    throw new Error("TrustSignal grounding must be set iff state is grounded");
  }
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(message);
  }
}

export function makeEdgeTransfer(partial: EdgeTransfer): EdgeTransfer {
  if (partial.summary.trim() === "") {
    throw new Error("EdgeTransfer summary must be non-empty");
  }

  edgeMechanismKindFromString(partial.mechanismKind);

  for (const artifact of partial.artifacts) {
    edgeArtifactRoleFromString(artifact.role);
  }
  assertUnique(
    partial.artifacts.map((artifact) => artifact.name),
    "EdgeTransfer artifacts must be unique by name",
  );

  for (const candidate of partial.behaviourCandidates) {
    validateTrustSignal(candidate.trust);
  }
  assertUnique(
    partial.behaviourCandidates.map((candidate) => candidate.behaviourId),
    "EdgeTransfer behaviourCandidates must be unique by behaviourId",
  );

  validateTrustSignal(partial.trust);

  if (partial.legacyMechanism !== null && partial.mechanismKind !== "unknown") {
    throw new Error(
      "EdgeTransfer legacyMechanism is only valid for unknown mechanismKind",
    );
  }

  const behaviourCandidates = partial.behaviourCandidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const trustOrder =
        TRUST_STATE_ORDER[left.candidate.trust.state] -
        TRUST_STATE_ORDER[right.candidate.trust.state];
      if (trustOrder !== 0) {
        return trustOrder;
      }

      const evidenceOrder = left.candidate.evidenceSource.localeCompare(
        right.candidate.evidenceSource,
      );
      if (evidenceOrder !== 0) {
        return evidenceOrder;
      }

      return left.index - right.index;
    })
    .map(({ candidate }) => candidate);

  return {
    ...partial,
    artifacts: [...partial.artifacts],
    behaviourCandidates,
  };
}
