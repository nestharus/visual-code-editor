import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.edge_transfer import (
    EdgeArtifact,
    EdgeArtifactRole,
    EdgeBehaviorCandidate,
    EdgeMechanismKind,
    make_edge_transfer,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


PARITY_SCENARIOS = (
    {
        "name": "grounded call with produced artifact",
        "input": {
            "edgeId": "edge.call.grounded",
            "mechanismKind": "call",
            "summary": "Controller calls renderer.",
            "trust": {"state": "grounded", "grounding": "test"},
            "artifacts": ({"name": "render-request", "role": "produced"},),
            "behaviourCandidates": (),
            "attributionActor": "generator",
            "legacyMechanism": None,
        },
    },
    {
        "name": "candidate import with no artifacts",
        "input": {
            "edgeId": "edge.import.candidate",
            "mechanismKind": "import",
            "summary": "File imports helper.",
            "trust": {"state": "candidate", "grounding": None},
            "artifacts": (),
            "behaviourCandidates": (),
            "attributionActor": None,
            "legacyMechanism": None,
        },
    },
    {
        "name": "unknown legacy mechanism bridge",
        "input": {
            "edgeId": "edge.legacy.unknown",
            "mechanismKind": "unknown",
            "summary": "Legacy edge retained during migration.",
            "trust": {"state": "orphaned", "grounding": None},
            "artifacts": (),
            "behaviourCandidates": (),
            "attributionActor": "unknown-external",
            "legacyMechanism": "fixture-bespoke-edge",
        },
    },
    {
        "name": "store read preserves artifact order",
        "input": {
            "edgeId": "edge.store.read",
            "mechanismKind": "store-read",
            "summary": "Module reads session and settings.",
            "trust": {"state": "candidate", "grounding": None},
            "artifacts": (
                {"name": "session-cache", "role": "shared"},
                {"name": "settings-record", "role": "consumed"},
            ),
            "behaviourCandidates": (),
            "attributionActor": "agents:provider-mapper",
            "legacyMechanism": None,
        },
    },
    {
        "name": "publish sorts behaviour candidates",
        "input": {
            "edgeId": "edge.publish.candidates",
            "mechanismKind": "publish",
            "summary": "Publisher emits lifecycle event.",
            "trust": {"state": "candidate", "grounding": None},
            "artifacts": ({"name": "lifecycle-event", "role": "carried"},),
            "behaviourCandidates": (
                {
                    "behaviourId": "behaviour.stale",
                    "trust": {"state": "stale", "grounding": None},
                    "evidenceSource": "z-source",
                },
                {
                    "behaviourId": "behaviour.grounded-b",
                    "trust": {"state": "grounded", "grounding": "annotation"},
                    "evidenceSource": "b-source",
                },
                {
                    "behaviourId": "behaviour.candidate",
                    "trust": {"state": "candidate", "grounding": None},
                    "evidenceSource": "a-source",
                },
                {
                    "behaviourId": "behaviour.grounded-a",
                    "trust": {"state": "grounded", "grounding": "test"},
                    "evidenceSource": "a-source",
                },
            ),
            "attributionActor": "product:auto-focus",
            "legacyMechanism": None,
        },
    },
    {
        "name": "feedback loop stale summary",
        "input": {
            "edgeId": "edge.feedback.stale",
            "mechanismKind": "feedback-loop",
            "summary": "Retry step loops back to validation.",
            "trust": {"state": "stale", "grounding": None},
            "artifacts": (),
            "behaviourCandidates": (),
            "attributionActor": "you-this-session",
            "legacyMechanism": None,
        },
    },
    {
        "name": "agent invoke with grounded candidate",
        "input": {
            "edgeId": "edge.agent.invoke",
            "mechanismKind": "agent-invoke",
            "summary": "Runtime invokes implementation agent.",
            "trust": {"state": "grounded", "grounding": "provider-verified"},
            "artifacts": ({"name": "agent-task", "role": "carried"},),
            "behaviourCandidates": (
                {
                    "behaviourId": "behaviour.agent-dispatch",
                    "trust": {"state": "grounded", "grounding": "provider-verified"},
                    "evidenceSource": "user-tagged",
                },
            ),
            "attributionActor": "agents:direct",
            "legacyMechanism": None,
        },
    },
    {
        "name": "cluster link without attribution",
        "input": {
            "edgeId": "edge.cluster.link",
            "mechanismKind": "cluster-link",
            "summary": "Cluster relates to downstream system.",
            "trust": {"state": "conflicting", "grounding": None},
            "artifacts": (),
            "behaviourCandidates": (),
            "attributionActor": None,
            "legacyMechanism": None,
        },
    },
)


def _trust(value: dict[str, str | None]) -> TrustSignal:
    grounding = (
        GroundingSource(value["grounding"]) if value["grounding"] is not None else None
    )
    return TrustSignal(state=TrustState(value["state"]), grounding=grounding)


def _artifact(value: dict[str, str]) -> EdgeArtifact:
    return EdgeArtifact(
        name=value["name"],
        role=EdgeArtifactRole(value["role"]),
    )


def _candidate(value: dict) -> EdgeBehaviorCandidate:
    return EdgeBehaviorCandidate(
        behaviour_id=value["behaviourId"],
        trust=_trust(value["trust"]),
        evidence_source=value["evidenceSource"],
    )


def _transfer(value: dict):
    actor = (
        ActorKind(value["attributionActor"])
        if value["attributionActor"] is not None
        else None
    )
    return make_edge_transfer(
        edge_id=value["edgeId"],
        mechanism_kind=EdgeMechanismKind(value["mechanismKind"]),
        summary=value["summary"],
        trust=_trust(value["trust"]),
        artifacts=tuple(_artifact(artifact) for artifact in value["artifacts"]),
        behaviour_candidates=tuple(
            _candidate(candidate) for candidate in value["behaviourCandidates"]
        ),
        attribution_actor=actor,
        legacy_mechanism=value["legacyMechanism"],
    )


def _serialize_transfer(transfer) -> dict:
    return {
        "edgeId": transfer.edge_id,
        "mechanismKind": transfer.mechanism_kind.value,
        "summary": transfer.summary,
        "trust": {
            "state": transfer.trust.state.value,
            "grounding": (
                transfer.trust.grounding.value if transfer.trust.grounding is not None else None
            ),
        },
        "artifacts": [
            {"name": artifact.name, "role": artifact.role.value}
            for artifact in transfer.artifacts
        ],
        "behaviourCandidates": [
            {
                "behaviourId": candidate.behaviour_id,
                "trust": {
                    "state": candidate.trust.state.value,
                    "grounding": (
                        candidate.trust.grounding.value
                        if candidate.trust.grounding is not None
                        else None
                    ),
                },
                "evidenceSource": candidate.evidence_source,
            }
            for candidate in transfer.behaviour_candidates
        ],
        "attributionActor": (
            transfer.attribution_actor.value
            if transfer.attribution_actor is not None
            else None
        ),
        "legacyMechanism": transfer.legacy_mechanism,
    }


def test_python_and_typescript_edge_transfer_records_match_for_representative_inputs():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-edge-transfer.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_records = json.loads(result.stdout)
    py_records = [
        {
            "name": scenario["name"],
            "transfer": _serialize_transfer(_transfer(scenario["input"])),
        }
        for scenario in PARITY_SCENARIOS
    ]

    assert ts_records == py_records, (
        "Cross-language parity invariant violated: Python and TypeScript EdgeTransfer "
        "constructors must produce equivalent records for representative inputs"
    )
