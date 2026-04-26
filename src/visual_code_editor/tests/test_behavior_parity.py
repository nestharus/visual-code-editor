import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.behavior import (
    BehaviorSourceSlice,
    BehaviorSliceRole,
    make_behavior,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


PARITY_SCENARIOS = (
    {
        "name": "candidate single body slice",
        "input": {
            "id": "behavior:auth.validate-token",
            "label": "Validate token",
            "description": "Confirms a request token before session access.",
            "sourceSlices": (
                {
                    "filePath": "app/auth/session.ts",
                    "startLine": 10,
                    "endLine": 14,
                    "startCol": None,
                    "endCol": None,
                    "sliceRole": "body",
                    "discoveredBy": "generator",
                    "confirmedBy": None,
                },
            ),
            "trust": {"state": "candidate", "grounding": None},
            "parentBehaviorId": None,
            "attributionActor": "generator",
        },
    },
    {
        "name": "grounded multi file behavior",
        "input": {
            "id": "behavior:auth.login-flow",
            "label": "Login flow",
            "description": None,
            "sourceSlices": (
                {
                    "filePath": "app/auth/controller.ts",
                    "startLine": 4,
                    "endLine": 4,
                    "startCol": 2,
                    "endCol": 18,
                    "sliceRole": "entry-point",
                    "discoveredBy": "agents:slice-constructor",
                    "confirmedBy": "you-this-session",
                },
                {
                    "filePath": "app/auth/session.ts",
                    "startLine": 20,
                    "endLine": 31,
                    "startCol": None,
                    "endCol": None,
                    "sliceRole": "body",
                    "discoveredBy": "agents:slice-constructor",
                    "confirmedBy": "you-this-session",
                },
                {
                    "filePath": "app/auth/audit.ts",
                    "startLine": 8,
                    "endLine": 8,
                    "startCol": 4,
                    "endCol": 22,
                    "sliceRole": "telemetry",
                    "discoveredBy": "agents:provider-mapper",
                    "confirmedBy": None,
                },
            ),
            "trust": {"state": "grounded", "grounding": "test"},
            "parentBehaviorId": "behavior:auth",
            "attributionActor": "you-this-session",
        },
    },
    {
        "name": "conflicting behavior with guard and error path",
        "input": {
            "id": "behavior:checkout.apply-discount",
            "label": "Apply discount",
            "description": "Applies eligible discounts before checkout totals are persisted.",
            "sourceSlices": (
                {
                    "filePath": "app/checkout/discounts.ts",
                    "startLine": 12,
                    "endLine": 13,
                    "startCol": 1,
                    "endCol": 80,
                    "sliceRole": "guard",
                    "discoveredBy": "product:auto-focus",
                    "confirmedBy": None,
                },
                {
                    "filePath": "app/checkout/discounts.ts",
                    "startLine": 18,
                    "endLine": 24,
                    "startCol": None,
                    "endCol": None,
                    "sliceRole": "error-path",
                    "discoveredBy": "product:auto-focus",
                    "confirmedBy": "unknown-external",
                },
            ),
            "trust": {"state": "conflicting", "grounding": None},
            "parentBehaviorId": None,
            "attributionActor": None,
        },
    },
    {
        "name": "stale test fixture behavior",
        "input": {
            "id": "behavior:billing.invoice-fixture",
            "label": "Invoice fixture",
            "description": None,
            "sourceSlices": (
                {
                    "filePath": "tests/billing/invoice.test.ts",
                    "startLine": 7,
                    "endLine": 15,
                    "startCol": None,
                    "endCol": None,
                    "sliceRole": "fixture",
                    "discoveredBy": "ci",
                    "confirmedBy": None,
                },
                {
                    "filePath": "tests/billing/invoice.test.ts",
                    "startLine": 21,
                    "endLine": 29,
                    "startCol": None,
                    "endCol": None,
                    "sliceRole": "test",
                    "discoveredBy": "ci",
                    "confirmedBy": None,
                },
            ),
            "trust": {"state": "stale", "grounding": None},
            "parentBehaviorId": "behavior:billing",
            "attributionActor": "ci",
        },
    },
    {
        "name": "orphaned annotation behavior",
        "input": {
            "id": "behavior:docs.legacy-export",
            "label": "Legacy export note",
            "description": "Comment-only behavior retained until export code is mapped.",
            "sourceSlices": (
                {
                    "filePath": "app/export/legacy.ts",
                    "startLine": 2,
                    "endLine": 6,
                    "startCol": 1,
                    "endCol": 1,
                    "sliceRole": "annotation",
                    "discoveredBy": "unknown-external",
                    "confirmedBy": None,
                },
            ),
            "trust": {"state": "orphaned", "grounding": None},
            "parentBehaviorId": None,
            "attributionActor": "unknown-external",
        },
    },
)


def _trust(value: dict[str, str | None]) -> TrustSignal:
    grounding = (
        GroundingSource(value["grounding"]) if value["grounding"] is not None else None
    )
    return TrustSignal(state=TrustState(value["state"]), grounding=grounding)


def _actor(value: str | None) -> ActorKind | None:
    return ActorKind(value) if value is not None else None


def _source_slice(value: dict) -> BehaviorSourceSlice:
    return BehaviorSourceSlice(
        file_path=value["filePath"],
        start_line=value["startLine"],
        end_line=value["endLine"],
        start_col=value["startCol"],
        end_col=value["endCol"],
        slice_role=BehaviorSliceRole(value["sliceRole"]),
        discovered_by=ActorKind(value["discoveredBy"]),
        confirmed_by=_actor(value["confirmedBy"]),
    )


def _behavior(value: dict):
    return make_behavior(
        id=value["id"],
        label=value["label"],
        description=value["description"],
        source_slices=tuple(
            _source_slice(source_slice) for source_slice in value["sourceSlices"]
        ),
        trust=_trust(value["trust"]),
        parent_behavior_id=value["parentBehaviorId"],
        attribution_actor=_actor(value["attributionActor"]),
    )


def _serialize_behavior(behavior) -> dict:
    return {
        "id": behavior.id,
        "label": behavior.label,
        "description": behavior.description,
        "sourceSlices": [
            {
                "filePath": source_slice.file_path,
                "startLine": source_slice.start_line,
                "endLine": source_slice.end_line,
                "startCol": source_slice.start_col,
                "endCol": source_slice.end_col,
                "sliceRole": source_slice.slice_role.value,
                "discoveredBy": source_slice.discovered_by.value,
                "confirmedBy": (
                    source_slice.confirmed_by.value
                    if source_slice.confirmed_by is not None
                    else None
                ),
            }
            for source_slice in behavior.source_slices
        ],
        "trust": {
            "state": behavior.trust.state.value,
            "grounding": (
                behavior.trust.grounding.value
                if behavior.trust.grounding is not None
                else None
            ),
        },
        "parentBehaviorId": behavior.parent_behavior_id,
        "attributionActor": (
            behavior.attribution_actor.value
            if behavior.attribution_actor is not None
            else None
        ),
    }


def test_python_and_typescript_behavior_records_match_for_representative_inputs():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-behavior.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_records = json.loads(result.stdout)
    py_records = [
        {
            "name": scenario["name"],
            "behavior": _serialize_behavior(_behavior(scenario["input"])),
        }
        for scenario in PARITY_SCENARIOS
    ]

    assert ts_records == py_records, (
        "Cross-language parity invariant violated: Python and TypeScript Behavior "
        "constructors must produce equivalent records for representative inputs"
    )
