import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState
from visual_code_editor.model.widget import (
    Widget,
    WidgetKind,
    WidgetMapping,
    WidgetReference,
    WidgetSurface,
)


PARITY_WIDGET = {
    "id": "widget:button.primary",
    "label": "Primary Button",
    "kind": "button",
    "references": (
        {
            "surface": "source",
            "identifier": "Button.tsx",
            "evidenceSource": "component export scan",
        },
        {
            "surface": "storybook",
            "identifier": "button--primary",
            "evidenceSource": "storybook index",
        },
    ),
    "trust": {
        "state": "grounded",
        "grounding": "user-confirmed",
    },
    "attributionActor": "agents:provider-mapper",
    "createdAtMs": 1_700_000_000_000,
}

PARITY_MAPPING = {
    "id": "widget-mapping:button.primary-figma",
    "widgetId": "widget:button.primary",
    "reference": {
        "surface": "figma",
        "identifier": "figma:123",
        "evidenceSource": "design review",
    },
    "confirmedBy": "you-this-session",
    "confirmedAtMs": 1_700_000_001_000,
    "notes": None,
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


def _reference_from_payload(payload) -> WidgetReference:
    return WidgetReference(
        surface=WidgetSurface(payload["surface"]),
        identifier=payload["identifier"],
        evidence_source=payload["evidenceSource"],
    )


def _reference_to_payload(reference: WidgetReference):
    return {
        "surface": reference.surface.value,
        "identifier": reference.identifier,
        "evidenceSource": reference.evidence_source,
    }


def _widget_from_payload(payload) -> Widget:
    return Widget(
        id=payload["id"],
        label=payload["label"],
        kind=WidgetKind(payload["kind"]),
        references=tuple(
            _reference_from_payload(reference) for reference in payload["references"]
        ),
        trust=_trust_signal(payload["trust"]),
        attribution_actor=ActorKind(payload["attributionActor"]),
        created_at_ms=payload["createdAtMs"],
    )


def _widget_to_payload(widget: Widget):
    return {
        "id": widget.id,
        "label": widget.label,
        "kind": widget.kind.value,
        "references": [
            _reference_to_payload(reference) for reference in widget.references
        ],
        "trust": {
            "state": widget.trust.state.value,
            "grounding": (
                widget.trust.grounding.value
                if widget.trust.grounding is not None
                else None
            ),
        },
        "attributionActor": widget.attribution_actor.value,
        "createdAtMs": widget.created_at_ms,
    }


def _mapping_from_payload(payload) -> WidgetMapping:
    return WidgetMapping(
        id=payload["id"],
        widget_id=payload["widgetId"],
        reference=_reference_from_payload(payload["reference"]),
        confirmed_by=ActorKind(payload["confirmedBy"]),
        confirmed_at_ms=payload["confirmedAtMs"],
        notes=payload["notes"],
    )


def _mapping_to_payload(mapping: WidgetMapping):
    return {
        "id": mapping.id,
        "widgetId": mapping.widget_id,
        "reference": _reference_to_payload(mapping.reference),
        "confirmedBy": mapping.confirmed_by.value,
        "confirmedAtMs": mapping.confirmed_at_ms,
        "notes": mapping.notes,
    }


def test_python_and_typescript_widget_contracts_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-widget.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_payload = json.loads(result.stdout)
    py_payload = {
        "widgetKinds": [kind.value for kind in WidgetKind],
        "widgetSurfaces": [surface.value for surface in WidgetSurface],
        "widget": _widget_to_payload(_widget_from_payload(PARITY_WIDGET)),
        "mapping": _mapping_to_payload(_mapping_from_payload(PARITY_MAPPING)),
    }

    assert ts_payload == py_payload, (
        "Cross-language parity invariant violated: Python and TypeScript Widget "
        "schemas must expose the same enum strings and record shapes"
    )
