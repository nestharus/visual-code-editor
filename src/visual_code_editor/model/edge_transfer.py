"""Canonical edge-transfer schema for rendered workspace edges."""

from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import TrustSignal, TrustState


class EdgeMechanismKind(str, Enum):
    ARTIFACT_FLOW = "artifact-flow"
    FEEDBACK_LOOP = "feedback-loop"
    CALL = "call"
    IMPORT = "import"
    STORE_READ = "store-read"
    STORE_WRITE = "store-write"
    PUBLISH = "publish"
    SUBSCRIBE = "subscribe"
    AGENT_INVOKE = "agent-invoke"
    CLUSTER_LINK = "cluster-link"
    UNKNOWN = "unknown"


class EdgeArtifactRole(str, Enum):
    CARRIED = "carried"
    PRODUCED = "produced"
    CONSUMED = "consumed"
    SHARED = "shared"


TRUST_STATE_ORDER: dict[TrustState, int] = {
    TrustState.GROUNDED: 0,
    TrustState.CANDIDATE: 1,
    TrustState.CONFLICTING: 2,
    TrustState.STALE: 3,
    TrustState.ORPHANED: 4,
}


def edge_mechanism_kind_from_string(value: str) -> EdgeMechanismKind:
    try:
        return EdgeMechanismKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown edge mechanism kind: {value}") from exc


def edge_artifact_role_from_string(value: str) -> EdgeArtifactRole:
    try:
        return EdgeArtifactRole(value)
    except ValueError as exc:
        raise ValueError(f"Unknown edge artifact role: {value}") from exc


def _validate_trust_signal(trust: TrustSignal) -> None:
    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED

    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


@dataclass(frozen=True)
class EdgeArtifact:
    name: str
    role: EdgeArtifactRole


@dataclass(frozen=True)
class EdgeBehaviorCandidate:
    behaviour_id: str
    trust: TrustSignal
    evidence_source: str

    def __post_init__(self) -> None:
        _validate_trust_signal(self.trust)


@dataclass(frozen=True)
class EdgeTransfer:
    edge_id: str
    mechanism_kind: EdgeMechanismKind
    summary: str
    trust: TrustSignal
    artifacts: tuple[EdgeArtifact, ...]
    behaviour_candidates: tuple[EdgeBehaviorCandidate, ...]
    attribution_actor: ActorKind | None
    legacy_mechanism: str | None

    def __post_init__(self) -> None:
        if not self.summary.strip():
            raise ValueError("EdgeTransfer summary must be non-empty")

        artifacts = tuple(self.artifacts)
        object.__setattr__(self, "artifacts", artifacts)
        artifact_names = [artifact.name for artifact in artifacts]
        if len(set(artifact_names)) != len(artifact_names):
            raise ValueError("EdgeTransfer artifacts must be unique by name")

        behaviour_candidates = tuple(self.behaviour_candidates)
        object.__setattr__(self, "behaviour_candidates", behaviour_candidates)
        behaviour_ids = [
            candidate.behaviour_id for candidate in behaviour_candidates
        ]
        if len(set(behaviour_ids)) != len(behaviour_ids):
            raise ValueError(
                "EdgeTransfer behaviour_candidates must be unique by behaviour_id"
            )

        _validate_trust_signal(self.trust)

        if (
            self.legacy_mechanism is not None
            and self.mechanism_kind != EdgeMechanismKind.UNKNOWN
        ):
            raise ValueError(
                "EdgeTransfer legacy_mechanism is only valid for UNKNOWN mechanism_kind"
            )


def make_edge_transfer(
    *,
    edge_id: str,
    mechanism_kind: EdgeMechanismKind,
    summary: str,
    trust: TrustSignal,
    artifacts: Iterable[EdgeArtifact],
    behaviour_candidates: Iterable[EdgeBehaviorCandidate],
    attribution_actor: ActorKind | None,
    legacy_mechanism: str | None,
) -> EdgeTransfer:
    artifact_tuple = tuple(artifacts)
    candidate_tuple = tuple(
        sorted(
            behaviour_candidates,
            key=lambda candidate: (
                TRUST_STATE_ORDER[candidate.trust.state],
                candidate.evidence_source,
            ),
        )
    )

    return EdgeTransfer(
        edge_id=edge_id,
        mechanism_kind=mechanism_kind,
        summary=summary,
        trust=trust,
        artifacts=artifact_tuple,
        behaviour_candidates=candidate_tuple,
        attribution_actor=attribution_actor,
        legacy_mechanism=legacy_mechanism,
    )
