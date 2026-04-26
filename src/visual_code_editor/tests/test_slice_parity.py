import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.slice import (
    NeighbourhoodKind,
    NeighbourhoodRule,
    Slice,
    SliceLifecycleState,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


PARITY_SCENARIOS = (
    {
        "name": "active exact slice",
        "input": {
            "id": "slice:auth-search",
            "query": "auth",
            "matchedEntityIds": ("system:auth",),
            "neighbourhoodEntityIds": (),
            "rule": {
                "kind": "exact",
                "edgeKinds": (),
                "maxHops": 0,
            },
            "lifecycleState": "active",
            "ttlMs": 1_700_000_900_000,
            "createdBy": "you-this-session",
            "createdAtMs": 1_700_000_000_000,
            "pinnedAtMs": None,
            "trust": {"state": "grounded", "grounding": "lsp-type"},
        },
    },
    {
        "name": "pinned transitive import slice",
        "input": {
            "id": "slice:imports.auth",
            "query": "imports:auth",
            "matchedEntityIds": ("file:auth.entry",),
            "neighbourhoodEntityIds": ("file:auth.session", "file:auth.store"),
            "rule": {
                "kind": "transitive-by-edge-kind",
                "edgeKinds": ("file-import",),
                "maxHops": 3,
            },
            "lifecycleState": "pinned",
            "ttlMs": None,
            "createdBy": "agents:slice-constructor",
            "createdAtMs": 1_700_000_100_000,
            "pinnedAtMs": 1_700_000_120_000,
            "trust": {"state": "grounded", "grounding": "lsp-type"},
        },
    },
    {
        "name": "tombstoned direct neighbour slice",
        "input": {
            "id": "slice:billing.retry",
            "query": "retry",
            "matchedEntityIds": ("behavior:billing.retry",),
            "neighbourhoodEntityIds": (
                "module:billing.worker",
                "store:billing-attempts",
            ),
            "rule": {
                "kind": "direct-neighbours",
                "edgeKinds": (),
                "maxHops": 0,
            },
            "lifecycleState": "tombstoned",
            "ttlMs": 1_700_000_800_000,
            "createdBy": "you-this-session",
            "createdAtMs": 1_700_000_200_000,
            "pinnedAtMs": None,
            "trust": {"state": "grounded", "grounding": "lsp-type"},
        },
    },
)


def _trust(value: dict) -> TrustSignal:
    grounding = value["grounding"]
    return TrustSignal(
        state=TrustState(value["state"]),
        grounding=GroundingSource(grounding) if grounding is not None else None,
    )


def _rule(value: dict) -> NeighbourhoodRule:
    return NeighbourhoodRule(
        kind=NeighbourhoodKind(value["kind"]),
        edge_kinds=tuple(value["edgeKinds"]),
        max_hops=value["maxHops"],
    )


def _slice(value: dict) -> Slice:
    return Slice(
        id=value["id"],
        query=value["query"],
        matched_entity_ids=tuple(value["matchedEntityIds"]),
        neighbourhood_entity_ids=tuple(value["neighbourhoodEntityIds"]),
        rule=_rule(value["rule"]),
        lifecycle_state=SliceLifecycleState(value["lifecycleState"]),
        ttl_ms=value["ttlMs"],
        created_by=ActorKind(value["createdBy"]),
        created_at_ms=value["createdAtMs"],
        pinned_at_ms=value["pinnedAtMs"],
        trust=_trust(value["trust"]),
    )


def _serialize_slice(value: Slice) -> dict:
    return {
        "id": value.id,
        "query": value.query,
        "matchedEntityIds": list(value.matched_entity_ids),
        "neighbourhoodEntityIds": list(value.neighbourhood_entity_ids),
        "rule": {
            "kind": value.rule.kind.value,
            "edgeKinds": list(value.rule.edge_kinds),
            "maxHops": value.rule.max_hops,
        },
        "lifecycleState": value.lifecycle_state.value,
        "ttlMs": value.ttl_ms,
        "createdBy": value.created_by.value,
        "createdAtMs": value.created_at_ms,
        "pinnedAtMs": value.pinned_at_ms,
        "trust": {
            "state": value.trust.state.value,
            "grounding": (
                value.trust.grounding.value if value.trust.grounding is not None else None
            ),
        },
    }


def test_python_and_typescript_slice_records_match_for_representative_inputs():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-slice.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_records = json.loads(result.stdout)
    py_records = [
        {
            "name": scenario["name"],
            "slice": _serialize_slice(_slice(scenario["input"])),
        }
        for scenario in PARITY_SCENARIOS
    ]

    assert ts_records == py_records, (
        "Cross-language parity invariant violated: Python and TypeScript Slice "
        "constructors must produce equivalent records for representative inputs"
    )
