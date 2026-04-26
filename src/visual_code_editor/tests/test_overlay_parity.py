import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.overlay import (
    OperationalOverlay,
    OverlayLayer,
    OverlayProviderId,
    OverlaySignal,
    OverlaySignalKind,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


PARITY_SCENARIOS = (
    {
        "name": "complete overlay snapshot",
        "input": {
            "layers": (
                {
                    "providerId": "g:test",
                    "signals": (
                        {
                            "providerId": "g:test",
                            "entityId": "behavior:auth.login",
                            "kind": "fail",
                            "label": "1 failing test",
                            "trust": {
                                "state": "grounded",
                                "grounding": "runtime-trace",
                            },
                            "emittedAtMs": 1_700_000_000_000,
                            "detailUrl": "https://ci.example.test/runs/123",
                        },
                        {
                            "providerId": "g:test",
                            "entityId": "behavior:checkout.submit",
                            "kind": "pass",
                            "label": "12 tests passing",
                            "trust": {
                                "state": "grounded",
                                "grounding": "runtime-trace",
                            },
                            "emittedAtMs": 1_700_000_000_001,
                            "detailUrl": None,
                        },
                    ),
                    "computedAtMs": 1_700_000_000_500,
                    "attributionActor": "ci",
                },
                {
                    "providerId": "g:pr-delta",
                    "signals": (
                        {
                            "providerId": "g:pr-delta",
                            "entityId": "behavior:auth.login",
                            "kind": "info",
                            "label": "Changed in PR",
                            "trust": {"state": "candidate", "grounding": None},
                            "emittedAtMs": 1_700_000_000_100,
                            "detailUrl": "https://github.example.test/pull/42",
                        },
                    ),
                    "computedAtMs": 1_700_000_000_600,
                    "attributionActor": "generator",
                },
                {
                    "providerId": "g:deploy",
                    "signals": (
                        {
                            "providerId": "g:deploy",
                            "entityId": "system:api",
                            "kind": "in-progress",
                            "label": "Deploying to staging",
                            "trust": {"state": "candidate", "grounding": None},
                            "emittedAtMs": 1_700_000_000_200,
                            "detailUrl": None,
                        },
                    ),
                    "computedAtMs": 1_700_000_000_700,
                    "attributionActor": "generator",
                },
                {
                    "providerId": "g:profile",
                    "signals": (
                        {
                            "providerId": "g:profile",
                            "entityId": "module:billing.worker",
                            "kind": "stale",
                            "label": "Profile stale",
                            "trust": {"state": "stale", "grounding": None},
                            "emittedAtMs": 1_700_000_000_300,
                            "detailUrl": None,
                        },
                    ),
                    "computedAtMs": 1_700_000_000_800,
                    "attributionActor": "generator",
                },
                {
                    "providerId": "g:task-active",
                    "signals": (
                        {
                            "providerId": "g:task-active",
                            "entityId": "task:auth-flow",
                            "kind": "info",
                            "label": "Active task",
                            "trust": {"state": "grounded", "grounding": "annotation"},
                            "emittedAtMs": 1_700_000_000_400,
                            "detailUrl": None,
                        },
                    ),
                    "computedAtMs": 1_700_000_000_900,
                    "attributionActor": "agents:direct",
                },
            ),
            "computedAtMs": 1_700_000_001_000,
        },
    },
)


def _trust_from_wire(data) -> TrustSignal:
    grounding = (
        GroundingSource(data["grounding"])
        if data["grounding"] is not None
        else None
    )
    return TrustSignal(state=TrustState(data["state"]), grounding=grounding)


def _signal_from_wire(data) -> OverlaySignal:
    return OverlaySignal(
        provider_id=OverlayProviderId(data["providerId"]),
        entity_id=data["entityId"],
        kind=OverlaySignalKind(data["kind"]),
        label=data["label"],
        trust=_trust_from_wire(data["trust"]),
        emitted_at_ms=data["emittedAtMs"],
        detail_url=data["detailUrl"],
    )


def _layer_from_wire(data) -> OverlayLayer:
    return OverlayLayer(
        provider_id=OverlayProviderId(data["providerId"]),
        signals=tuple(_signal_from_wire(signal) for signal in data["signals"]),
        computed_at_ms=data["computedAtMs"],
        attribution_actor=ActorKind(data["attributionActor"]),
    )


def _overlay_from_wire(data) -> OperationalOverlay:
    return OperationalOverlay(
        layers=tuple(_layer_from_wire(layer) for layer in data["layers"]),
        computed_at_ms=data["computedAtMs"],
    )


def _trust_to_wire(trust: TrustSignal) -> dict:
    return {
        "state": trust.state.value,
        "grounding": trust.grounding.value if trust.grounding is not None else None,
    }


def _signal_to_wire(signal: OverlaySignal) -> dict:
    return {
        "providerId": signal.provider_id.value,
        "entityId": signal.entity_id,
        "kind": signal.kind.value,
        "label": signal.label,
        "trust": _trust_to_wire(signal.trust),
        "emittedAtMs": signal.emitted_at_ms,
        "detailUrl": signal.detail_url,
    }


def _layer_to_wire(layer: OverlayLayer) -> dict:
    return {
        "providerId": layer.provider_id.value,
        "signals": [_signal_to_wire(signal) for signal in layer.signals],
        "computedAtMs": layer.computed_at_ms,
        "attributionActor": layer.attribution_actor.value,
    }


def _overlay_to_wire(overlay: OperationalOverlay) -> dict:
    return {
        "layers": [_layer_to_wire(layer) for layer in overlay.layers],
        "computedAtMs": overlay.computed_at_ms,
    }


def test_python_and_typescript_overlay_contracts_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-overlay.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_registry = json.loads(result.stdout)
    py_registry = {
        "overlayProviderIds": [provider_id.value for provider_id in OverlayProviderId],
        "overlaySignalKinds": [kind.value for kind in OverlaySignalKind],
        "overlays": [
            {
                "name": scenario["name"],
                "overlay": _overlay_to_wire(_overlay_from_wire(scenario["input"])),
            }
            for scenario in PARITY_SCENARIOS
        ],
    }

    assert ts_registry == py_registry, (
        "Cross-language parity invariant violated: Python and TypeScript overlay "
        "schemas must expose the same provider ids, signal kinds, and record shape"
    )
