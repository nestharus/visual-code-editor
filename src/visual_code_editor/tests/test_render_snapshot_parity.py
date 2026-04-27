import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.render_snapshot import (
    RenderSnapshot,
    RenderSurface,
    RenderViewport,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


PARITY_RENDER_SNAPSHOT = {
    "id": "render:button.primary.desktop",
    "widgetId": "widget:button.primary",
    "surface": "static-image",
    "viewport": "desktop",
    "theme": "dark",
    "locale": "en-US",
    "assetPath": "public/data/widget-renders/button.primary/desktop.png",
    "capturedAtMs": 1_700_000_000_000,
    "trust": {
        "state": "grounded",
        "grounding": "user-confirmed",
    },
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


def _snapshot_from_payload(payload) -> RenderSnapshot:
    return RenderSnapshot(
        id=payload["id"],
        widget_id=payload["widgetId"],
        surface=RenderSurface(payload["surface"]),
        viewport=RenderViewport(payload["viewport"]),
        theme=payload["theme"],
        locale=payload["locale"],
        asset_path=payload["assetPath"],
        captured_at_ms=payload["capturedAtMs"],
        trust=_trust_signal(payload["trust"]),
    )


def _snapshot_to_payload(snapshot: RenderSnapshot):
    return {
        "id": snapshot.id,
        "widgetId": snapshot.widget_id,
        "surface": snapshot.surface.value,
        "viewport": snapshot.viewport.value,
        "theme": snapshot.theme,
        "locale": snapshot.locale,
        "assetPath": snapshot.asset_path,
        "capturedAtMs": snapshot.captured_at_ms,
        "trust": {
            "state": snapshot.trust.state.value,
            "grounding": (
                snapshot.trust.grounding.value
                if snapshot.trust.grounding is not None
                else None
            ),
        },
    }


def test_python_and_typescript_render_snapshot_contracts_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-render-snapshot.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_payload = json.loads(result.stdout)
    py_payload = {
        "renderSurfaces": [surface.value for surface in RenderSurface],
        "renderViewports": [viewport.value for viewport in RenderViewport],
        "renderSnapshot": _snapshot_to_payload(
            _snapshot_from_payload(PARITY_RENDER_SNAPSHOT)
        ),
    }

    assert ts_payload == py_payload, (
        "Cross-language parity invariant violated: Python and TypeScript "
        "RenderSnapshot schemas must expose the same enum strings and record shapes"
    )
