import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.edge_transfer import (
    EdgeArtifact,
    EdgeArtifactRole,
    EdgeBehaviorCandidate,
    EdgeMechanismKind,
    EdgeTransfer,
    edge_artifact_role_from_string,
    edge_mechanism_kind_from_string,
    make_edge_transfer,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


CONTRACT_EDGE_MECHANISM_KINDS = (
    ("ARTIFACT_FLOW", "artifact-flow"),
    ("FEEDBACK_LOOP", "feedback-loop"),
    ("CALL", "call"),
    ("IMPORT", "import"),
    ("STORE_READ", "store-read"),
    ("STORE_WRITE", "store-write"),
    ("PUBLISH", "publish"),
    ("SUBSCRIBE", "subscribe"),
    ("AGENT_INVOKE", "agent-invoke"),
    ("CLUSTER_LINK", "cluster-link"),
    ("UNKNOWN", "unknown"),
)

CONTRACT_EDGE_ARTIFACT_ROLES = (
    ("CARRIED", "carried"),
    ("PRODUCED", "produced"),
    ("CONSUMED", "consumed"),
    ("SHARED", "shared"),
)

CONTRACT_MECHANISM_VALUES = tuple(value for _, value in CONTRACT_EDGE_MECHANISM_KINDS)
CONTRACT_ROLE_VALUES = tuple(value for _, value in CONTRACT_EDGE_ARTIFACT_ROLES)


def _trust(
    state: TrustState = TrustState.CANDIDATE,
    grounding: GroundingSource | None = None,
) -> TrustSignal:
    return TrustSignal(state=state, grounding=grounding)


def _artifact(
    name: str = "workspace.plan",
    role: EdgeArtifactRole = EdgeArtifactRole.CARRIED,
) -> EdgeArtifact:
    return EdgeArtifact(name=name, role=role)


def _candidate(
    behaviour_id: str = "behaviour.shared-handoff",
    trust: TrustSignal | None = None,
    evidence_source: str = "naming-overlap",
) -> EdgeBehaviorCandidate:
    return EdgeBehaviorCandidate(
        behaviour_id=behaviour_id,
        trust=trust or _trust(),
        evidence_source=evidence_source,
    )


def _transfer(**overrides) -> EdgeTransfer:
    values = {
        "edge_id": "edge.source.target",
        "mechanism_kind": EdgeMechanismKind.CALL,
        "summary": "Source calls target.",
        "trust": _trust(),
        "artifacts": (_artifact(),),
        "behaviour_candidates": (_candidate(),),
        "attribution_actor": ActorKind.GENERATOR,
        "legacy_mechanism": None,
    }
    values.update(overrides)
    return EdgeTransfer(**values)


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_EDGE_MECHANISM_KINDS)
def test_edge_mechanism_kind_enum_contains_each_contract_member(member_name, kind_value):
    assert hasattr(EdgeMechanismKind, member_name), (
        f"Enum membership invariant violated: EdgeMechanismKind is missing {member_name}"
    )
    assert getattr(EdgeMechanismKind, member_name).value == kind_value, (
        "Stability invariant violated: "
        f"EdgeMechanismKind.{member_name}.value must be {kind_value!r}"
    )


@pytest.mark.parametrize(("member_name", "role_value"), CONTRACT_EDGE_ARTIFACT_ROLES)
def test_edge_artifact_role_enum_contains_each_contract_member(member_name, role_value):
    assert hasattr(EdgeArtifactRole, member_name), (
        f"Enum membership invariant violated: EdgeArtifactRole is missing {member_name}"
    )
    assert getattr(EdgeArtifactRole, member_name).value == role_value, (
        "Stability invariant violated: "
        f"EdgeArtifactRole.{member_name}.value must be {role_value!r}"
    )


def test_edge_mechanism_kind_enum_contains_exactly_the_contract_members():
    assert len(EdgeMechanismKind) == 11, (
        "Enum membership invariant violated: EdgeMechanismKind must expose 11 kinds"
    )
    assert tuple(kind.value for kind in EdgeMechanismKind) == CONTRACT_MECHANISM_VALUES, (
        "Enum membership invariant violated: EdgeMechanismKind must contain exactly the "
        "contract mechanism kinds"
    )


def test_edge_artifact_role_enum_contains_exactly_the_contract_members():
    assert len(EdgeArtifactRole) == 4, (
        "Enum membership invariant violated: EdgeArtifactRole must expose 4 roles"
    )
    assert tuple(role.value for role in EdgeArtifactRole) == CONTRACT_ROLE_VALUES, (
        "Enum membership invariant violated: EdgeArtifactRole must contain exactly the "
        "contract artifact roles"
    )


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_EDGE_MECHANISM_KINDS)
def test_edge_mechanism_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert edge_mechanism_kind_from_string(kind_value) is getattr(
        EdgeMechanismKind, member_name
    ), (
        "edge_mechanism_kind_from_string strictness invariant violated: "
        f"{kind_value!r} must parse to EdgeMechanismKind.{member_name}"
    )


@pytest.mark.parametrize(("member_name", "role_value"), CONTRACT_EDGE_ARTIFACT_ROLES)
def test_edge_artifact_role_from_string_accepts_every_contract_value(
    member_name,
    role_value,
):
    assert edge_artifact_role_from_string(role_value) is getattr(
        EdgeArtifactRole, member_name
    ), (
        "edge_artifact_role_from_string strictness invariant violated: "
        f"{role_value!r} must parse to EdgeArtifactRole.{member_name}"
    )


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "artifact_flow",
        "file-import",
        "CALL",
        "store-read ",
    ),
)
def test_edge_mechanism_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        edge_mechanism_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "payload",
        "produced ",
        "CARRIED",
        "shared-artifact",
    ),
)
def test_edge_artifact_role_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        edge_artifact_role_from_string(invalid_value)


def test_edge_transfer_rejects_empty_summary():
    with pytest.raises(ValueError):
        _transfer(summary="")


def test_edge_transfer_rejects_duplicate_artifact_names():
    with pytest.raises(ValueError):
        _transfer(
            artifacts=(
                _artifact("workspace.plan", EdgeArtifactRole.PRODUCED),
                _artifact("workspace.plan", EdgeArtifactRole.CONSUMED),
            ),
        )


def test_edge_transfer_rejects_duplicate_candidate_behaviour_ids():
    with pytest.raises(ValueError):
        _transfer(
            behaviour_candidates=(
                _candidate("behaviour.shared-handoff", evidence_source="naming-overlap"),
                _candidate("behaviour.shared-handoff", evidence_source="shared-artifact"),
            ),
        )


def test_edge_behavior_candidate_reasserts_grounded_trust_requires_grounding():
    invalid_grounded = object.__new__(TrustSignal)
    object.__setattr__(invalid_grounded, "state", TrustState.GROUNDED)
    object.__setattr__(invalid_grounded, "grounding", None)

    with pytest.raises(ValueError):
        _candidate(trust=invalid_grounded)


@pytest.mark.parametrize("mechanism_kind", tuple(EdgeMechanismKind))
def test_legacy_mechanism_rule_accepts_no_legacy_for_any_mechanism_kind(mechanism_kind):
    transfer = _transfer(
        mechanism_kind=mechanism_kind,
        legacy_mechanism=None,
    )

    assert transfer.mechanism_kind is mechanism_kind
    assert transfer.legacy_mechanism is None


def test_legacy_mechanism_rule_accepts_unknown_with_legacy_value():
    transfer = _transfer(
        mechanism_kind=EdgeMechanismKind.UNKNOWN,
        legacy_mechanism="fixture-bespoke-edge",
    )

    assert transfer.mechanism_kind is EdgeMechanismKind.UNKNOWN
    assert transfer.legacy_mechanism == "fixture-bespoke-edge"


@pytest.mark.parametrize(
    "mechanism_kind",
    tuple(kind for kind in EdgeMechanismKind if kind is not EdgeMechanismKind.UNKNOWN),
)
def test_legacy_mechanism_rule_rejects_legacy_value_for_classified_kind(mechanism_kind):
    with pytest.raises(ValueError):
        _transfer(
            mechanism_kind=mechanism_kind,
            legacy_mechanism="fixture-bespoke-edge",
        )


def test_make_edge_transfer_preserves_caller_artifact_order():
    artifacts = (
        _artifact("third", EdgeArtifactRole.SHARED),
        _artifact("first", EdgeArtifactRole.PRODUCED),
        _artifact("second", EdgeArtifactRole.CONSUMED),
    )

    transfer = make_edge_transfer(
        edge_id="edge.artifacts",
        mechanism_kind=EdgeMechanismKind.ARTIFACT_FLOW,
        summary="Artifacts move in caller-provided order.",
        trust=_trust(),
        artifacts=artifacts,
        behaviour_candidates=(),
        attribution_actor=None,
        legacy_mechanism=None,
    )

    assert transfer.artifacts == artifacts


def test_make_edge_transfer_sorts_candidates_by_trust_desc_then_evidence_source():
    candidates = (
        _candidate(
            "behaviour.stale",
            trust=_trust(TrustState.STALE),
            evidence_source="z-source",
        ),
        _candidate(
            "behaviour.grounded-b",
            trust=_trust(TrustState.GROUNDED, GroundingSource.TEST),
            evidence_source="b-source",
        ),
        _candidate(
            "behaviour.candidate",
            trust=_trust(TrustState.CANDIDATE),
            evidence_source="a-source",
        ),
        _candidate(
            "behaviour.grounded-a",
            trust=_trust(TrustState.GROUNDED, GroundingSource.ANNOTATION),
            evidence_source="a-source",
        ),
        _candidate(
            "behaviour.conflicting",
            trust=_trust(TrustState.CONFLICTING),
            evidence_source="c-source",
        ),
    )

    transfer = make_edge_transfer(
        edge_id="edge.candidates",
        mechanism_kind=EdgeMechanismKind.PUBLISH,
        summary="Candidates are sorted by confidence.",
        trust=_trust(),
        artifacts=(),
        behaviour_candidates=candidates,
        attribution_actor=None,
        legacy_mechanism=None,
    )

    assert tuple(candidate.behaviour_id for candidate in transfer.behaviour_candidates) == (
        "behaviour.grounded-a",
        "behaviour.grounded-b",
        "behaviour.candidate",
        "behaviour.conflicting",
        "behaviour.stale",
    )
