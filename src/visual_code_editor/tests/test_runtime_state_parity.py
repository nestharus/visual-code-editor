import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.runtime_state import (
    RuntimeStateCapture,
    RuntimeStateKind,
    RuntimeStateNode,
    RuntimeStateNodeKind,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


PARITY_RUNTIME_STATE_CAPTURE = {
    "id": "runtime-capture:graph.canvas.1700000000000",
    "widgetId": "widget:graph.canvas",
    "screenId": "screen:overview",
    "kind": "component-tree",
    "nodes": [
        {
            "kind": "component",
            "name": "GraphCanvas",
            "propsSummary": "nodes=12 edges=18",
            "childrenCount": 3,
        },
        {
            "kind": "element",
            "name": "div",
            "propsSummary": "class=graph-surface",
            "childrenCount": 0,
        },
    ],
    "rawPayloadPath": "public/data/runtime/graph.canvas/dom.json",
    "trust": {
        "state": "grounded",
        "grounding": "runtime-trace",
    },
    "attributionActor": "generator",
    "capturedAtMs": 1_700_000_000_000,
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


def _trust_to_payload(trust: TrustSignal):
    return {
        "state": trust.state.value,
        "grounding": (
            trust.grounding.value if trust.grounding is not None else None
        ),
    }


def _node_from_payload(payload) -> RuntimeStateNode:
    return RuntimeStateNode(
        kind=RuntimeStateNodeKind(payload["kind"]),
        name=payload["name"],
        props_summary=payload["propsSummary"],
        children_count=payload["childrenCount"],
    )


def _node_to_payload(node: RuntimeStateNode):
    return {
        "kind": node.kind.value,
        "name": node.name,
        "propsSummary": node.props_summary,
        "childrenCount": node.children_count,
    }


def _capture_from_payload(payload) -> RuntimeStateCapture:
    return RuntimeStateCapture(
        id=payload["id"],
        widget_id=payload["widgetId"],
        screen_id=payload["screenId"],
        kind=RuntimeStateKind(payload["kind"]),
        nodes=tuple(_node_from_payload(node) for node in payload["nodes"]),
        raw_payload_path=payload["rawPayloadPath"],
        trust=_trust_signal(payload["trust"]),
        attribution_actor=ActorKind(payload["attributionActor"]),
        captured_at_ms=payload["capturedAtMs"],
    )


def _capture_to_payload(capture: RuntimeStateCapture):
    return {
        "id": capture.id,
        "widgetId": capture.widget_id,
        "screenId": capture.screen_id,
        "kind": capture.kind.value,
        "nodes": [_node_to_payload(node) for node in capture.nodes],
        "rawPayloadPath": capture.raw_payload_path,
        "trust": _trust_to_payload(capture.trust),
        "attributionActor": capture.attribution_actor.value,
        "capturedAtMs": capture.captured_at_ms,
    }


def test_python_and_typescript_runtime_state_contracts_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-runtime-state.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_payload = json.loads(result.stdout)
    py_payload = {
        "runtimeStateKinds": [kind.value for kind in RuntimeStateKind],
        "runtimeStateNodeKinds": [kind.value for kind in RuntimeStateNodeKind],
        "runtimeStateCapture": _capture_to_payload(
            _capture_from_payload(PARITY_RUNTIME_STATE_CAPTURE)
        ),
    }

    assert ts_payload == py_payload, (
        "Cross-language parity invariant violated: Python and TypeScript "
        "RuntimeStateCapture schemas must expose the same enum strings and record shape"
    )
