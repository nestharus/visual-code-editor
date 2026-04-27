import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState
from visual_code_editor.model.variant_topology import (
    VariantAxis,
    VariantAxisKind,
    VariantCell,
    VariantCellState,
    VariantTopology,
)


PARITY_TOPOLOGY = {
    "id": "variant-topology:button.primary",
    "widgetId": "widget:button.primary",
    "axes": [
        {
            "kind": "prop",
            "name": "size",
            "values": ["small", "large"],
        },
        {
            "kind": "theme",
            "name": "theme",
            "values": ["dark", "light"],
        },
    ],
    "cells": [
        {
            "coordinates": {"size": "small", "theme": "dark"},
            "state": "grounded",
            "evidenceRenderIds": ["render:button.primary.desktop"],
            "trust": {
                "state": "grounded",
                "grounding": "user-confirmed",
            },
        },
        {
            "coordinates": {"size": "large", "theme": "light"},
            "state": "candidate",
            "evidenceRenderIds": [],
            "trust": {
                "state": "candidate",
                "grounding": None,
            },
        },
    ],
    "computedAtMs": 1_700_000_000_000,
}


def _trust_signal(payload):
    return TrustSignal(
        state=TrustState(payload["state"]),
        grounding=(
            GroundingSource(payload["grounding"])
            if payload["grounding"] is not None
            else None
        ),
    )


def _axis_from_payload(payload) -> VariantAxis:
    return VariantAxis(
        kind=VariantAxisKind(payload["kind"]),
        name=payload["name"],
        values=tuple(payload["values"]),
    )


def _axis_to_payload(axis: VariantAxis):
    return {
        "kind": axis.kind.value,
        "name": axis.name,
        "values": list(axis.values),
    }


def _cell_from_payload(payload) -> VariantCell:
    return VariantCell(
        coordinates=dict(payload["coordinates"]),
        state=VariantCellState(payload["state"]),
        evidence_render_ids=tuple(payload["evidenceRenderIds"]),
        trust=_trust_signal(payload["trust"]),
    )


def _cell_to_payload(cell: VariantCell):
    return {
        "coordinates": dict(cell.coordinates),
        "state": cell.state.value,
        "evidenceRenderIds": list(cell.evidence_render_ids),
        "trust": {
            "state": cell.trust.state.value,
            "grounding": (
                cell.trust.grounding.value
                if cell.trust.grounding is not None
                else None
            ),
        },
    }


def _topology_from_payload(payload) -> VariantTopology:
    return VariantTopology(
        id=payload["id"],
        widget_id=payload["widgetId"],
        axes=tuple(_axis_from_payload(axis) for axis in payload["axes"]),
        cells=tuple(_cell_from_payload(cell) for cell in payload["cells"]),
        computed_at_ms=payload["computedAtMs"],
    )


def _topology_to_payload(topology: VariantTopology):
    return {
        "id": topology.id,
        "widgetId": topology.widget_id,
        "axes": [_axis_to_payload(axis) for axis in topology.axes],
        "cells": [_cell_to_payload(cell) for cell in topology.cells],
        "computedAtMs": topology.computed_at_ms,
    }


def test_python_and_typescript_variant_topology_contracts_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-variant-topology.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_payload = json.loads(result.stdout)
    py_payload = {
        "variantAxisKinds": [kind.value for kind in VariantAxisKind],
        "variantCellStates": [state.value for state in VariantCellState],
        "variantTopology": _topology_to_payload(
            _topology_from_payload(PARITY_TOPOLOGY)
        ),
    }

    assert ts_payload == py_payload, (
        "Cross-language parity invariant violated: Python and TypeScript "
        "VariantTopology schemas must expose the same enum strings and record shapes"
    )
