"""Build canonical EdgeTransfer records from rendered edge data."""

from __future__ import annotations

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.edge_transfer import (
    EdgeArtifact,
    EdgeArtifactRole,
    EdgeMechanismKind,
    EdgeTransfer,
    make_edge_transfer,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


_MECHANISM_MAP: dict[str, EdgeMechanismKind] = {
    "artifact flow": EdgeMechanismKind.ARTIFACT_FLOW,
    "feedback loop": EdgeMechanismKind.FEEDBACK_LOOP,
    "call": EdgeMechanismKind.CALL,
    "import": EdgeMechanismKind.IMPORT,
    "agent": EdgeMechanismKind.AGENT_INVOKE,
    "store-read": EdgeMechanismKind.STORE_READ,
    "store-write": EdgeMechanismKind.STORE_WRITE,
    "publish": EdgeMechanismKind.PUBLISH,
    "subscribe": EdgeMechanismKind.SUBSCRIBE,
    "cluster-link": EdgeMechanismKind.CLUSTER_LINK,
}


def classify_mechanism(
    legacy: str | None,
) -> tuple[EdgeMechanismKind, str | None]:
    """Classify legacy render-layer mechanism strings per contract A.2."""
    if legacy is None:
        return EdgeMechanismKind.UNKNOWN, None

    normalized = legacy.strip()
    if not normalized or normalized == "unknown":
        return EdgeMechanismKind.UNKNOWN, None

    mechanism_kind = _MECHANISM_MAP.get(normalized)
    if mechanism_kind is not None:
        return mechanism_kind, None

    return EdgeMechanismKind.UNKNOWN, legacy


def _summary(edge_id: str, edge_dict: dict) -> str:
    label = str(edge_dict.get("label", "")).strip()
    if label:
        return label

    source_label = str(
        edge_dict.get("fromLabel") or edge_dict.get("sourceLabel") or ""
    ).strip()
    target_label = str(edge_dict.get("toLabel") or edge_dict.get("targetLabel") or "").strip()
    if source_label and target_label:
        return f"{source_label} -> {target_label}"

    source = str(edge_dict.get("from") or edge_dict.get("source") or "").strip()
    target = str(edge_dict.get("to") or edge_dict.get("target") or "").strip()
    if source and target:
        return f"{source} -> {target}"

    return edge_id


def _artifact_names(values: object) -> list[str]:
    if not isinstance(values, list):
        return []

    names: list[str] = []
    for value in values:
        if isinstance(value, str):
            name = value.strip()
        elif isinstance(value, dict):
            name = str(value.get("name") or value.get("label") or value.get("id") or "").strip()
        else:
            name = str(value).strip()
        if name:
            names.append(name)
    return names


def _artifacts(edge_dict: dict, click_map_entry: dict | None) -> tuple[EdgeArtifact, ...]:
    artifacts: list[EdgeArtifact] = []
    seen: set[str] = set()

    def append(names: object, role: EdgeArtifactRole) -> None:
        for name in _artifact_names(names):
            if name in seen:
                continue
            seen.add(name)
            artifacts.append(EdgeArtifact(name=name, role=role))

    if click_map_entry:
        append(click_map_entry.get("sharedArtifacts"), EdgeArtifactRole.SHARED)
        append(click_map_entry.get("sourceArtifacts"), EdgeArtifactRole.PRODUCED)
        append(click_map_entry.get("targetArtifacts"), EdgeArtifactRole.CONSUMED)

    if not artifacts:
        append(edge_dict.get("imports"), EdgeArtifactRole.CARRIED)

    return tuple(artifacts)


def build_edge_transfer(
    edge_id: str,
    edge_dict: dict,
    click_map_entry: dict | None = None,
) -> EdgeTransfer:
    """Build an export-time EdgeTransfer for one rendered edge."""
    mechanism_kind, _legacy_mechanism = classify_mechanism(edge_dict.get("mechanism"))
    if mechanism_kind == EdgeMechanismKind.UNKNOWN:
        trust = TrustSignal(state=TrustState.CANDIDATE, grounding=None)
    else:
        trust = TrustSignal(
            state=TrustState.GROUNDED,
            grounding=GroundingSource.LSP_TYPE,
        )

    return make_edge_transfer(
        edge_id=edge_id,
        mechanism_kind=mechanism_kind,
        summary=_summary(edge_id, edge_dict),
        trust=trust,
        artifacts=_artifacts(edge_dict, click_map_entry),
        behaviour_candidates=(),
        attribution_actor=ActorKind.GENERATOR,
        legacy_mechanism=None,
    )
