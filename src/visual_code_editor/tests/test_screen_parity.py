import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.screen import (
    Screen,
    ScreenEdge,
    ScreenEdgeKind,
    ScreenEdgeTrigger,
    ScreenKind,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


PARITY_SCREEN = {
    "id": "screen:overview",
    "label": "Overview",
    "kind": "page",
    "route": "/",
    "widgetIds": (
        "widget:nav.primary",
        "widget:graph.canvas",
        "widget:nav.primary",
    ),
    "trust": {
        "state": "grounded",
        "grounding": "user-confirmed",
    },
    "attributionActor": "generator",
    "createdAtMs": 1_700_000_000_000,
}

PARITY_SCREEN_EDGE = {
    "id": "screen-edge:overview-to-detail",
    "fromScreenId": "screen:overview",
    "toScreenId": "screen:detail",
    "kind": "navigate",
    "trigger": "click",
    "trust": {
        "state": "candidate",
        "grounding": None,
    },
    "attributionActor": "you-this-session",
    "observedAtMs": 1_700_000_001_000,
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


def _screen_from_payload(payload) -> Screen:
    return Screen(
        id=payload["id"],
        label=payload["label"],
        kind=ScreenKind(payload["kind"]),
        route=payload["route"],
        widget_ids=tuple(payload["widgetIds"]),
        trust=_trust_signal(payload["trust"]),
        attribution_actor=ActorKind(payload["attributionActor"]),
        created_at_ms=payload["createdAtMs"],
    )


def _screen_to_payload(screen: Screen):
    return {
        "id": screen.id,
        "label": screen.label,
        "kind": screen.kind.value,
        "route": screen.route,
        "widgetIds": list(screen.widget_ids),
        "trust": _trust_to_payload(screen.trust),
        "attributionActor": screen.attribution_actor.value,
        "createdAtMs": screen.created_at_ms,
    }


def _screen_edge_from_payload(payload) -> ScreenEdge:
    return ScreenEdge(
        id=payload["id"],
        from_screen_id=payload["fromScreenId"],
        to_screen_id=payload["toScreenId"],
        kind=ScreenEdgeKind(payload["kind"]),
        trigger=ScreenEdgeTrigger(payload["trigger"]),
        trust=_trust_signal(payload["trust"]),
        attribution_actor=ActorKind(payload["attributionActor"]),
        observed_at_ms=payload["observedAtMs"],
    )


def _screen_edge_to_payload(edge: ScreenEdge):
    return {
        "id": edge.id,
        "fromScreenId": edge.from_screen_id,
        "toScreenId": edge.to_screen_id,
        "kind": edge.kind.value,
        "trigger": edge.trigger.value,
        "trust": _trust_to_payload(edge.trust),
        "attributionActor": edge.attribution_actor.value,
        "observedAtMs": edge.observed_at_ms,
    }


def test_python_and_typescript_screen_contracts_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-screen.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_payload = json.loads(result.stdout)
    py_payload = {
        "screenKinds": [kind.value for kind in ScreenKind],
        "screenEdgeKinds": [kind.value for kind in ScreenEdgeKind],
        "screenEdgeTriggers": [trigger.value for trigger in ScreenEdgeTrigger],
        "screen": _screen_to_payload(_screen_from_payload(PARITY_SCREEN)),
        "screenEdge": _screen_edge_to_payload(
            _screen_edge_from_payload(PARITY_SCREEN_EDGE),
        ),
    }

    assert ts_payload == py_payload, (
        "Cross-language parity invariant violated: Python and TypeScript Screen "
        "schemas must expose the same enum strings and record shapes"
    )
