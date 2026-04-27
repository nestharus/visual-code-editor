import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.motion import EasingKind, Motion, MotionKind, MotionRole
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


PARITY_MOTIONS = (
    {
        "name": "widget hover affordance",
        "input": {
            "id": "motion:button.primary-hover",
            "widgetId": "widget:button.primary",
            "screenId": None,
            "kind": "hover",
            "role": "affordance",
            "durationMs": 180,
            "easing": "ease-out",
            "customCurve": None,
            "captureAssetPath": "app/assets/animations/button-hover.webm",
            "trust": {"state": "candidate", "grounding": None},
            "attributionActor": "generator",
            "createdAtMs": 1_700_000_000_000,
        },
    },
    {
        "name": "screen transition navigation",
        "input": {
            "id": "motion:screen.overview-to-system",
            "widgetId": None,
            "screenId": "screen:overview",
            "kind": "transition",
            "role": "navigation",
            "durationMs": 320,
            "easing": "custom",
            "customCurve": "cubic-bezier(0.22, 1, 0.36, 1)",
            "captureAssetPath": None,
            "trust": {"state": "grounded", "grounding": "user-confirmed"},
            "attributionActor": "you-this-session",
            "createdAtMs": 1_700_000_001_000,
        },
    },
    {
        "name": "ambient loading motion",
        "input": {
            "id": "motion:loading.ambient-pulse",
            "widgetId": "widget:loading-chip",
            "screenId": "screen:dashboard",
            "kind": "ambient",
            "role": "loading",
            "durationMs": 0,
            "easing": "linear",
            "customCurve": None,
            "captureAssetPath": "app/assets/animations/loading-pulse.lottie",
            "trust": {"state": "stale", "grounding": None},
            "attributionActor": "agents:provider-mapper",
            "createdAtMs": 0,
        },
    },
)


def _trust(value: dict[str, str | None]) -> TrustSignal:
    grounding = (
        GroundingSource(value["grounding"]) if value["grounding"] is not None else None
    )
    return TrustSignal(state=TrustState(value["state"]), grounding=grounding)


def _motion(value: dict) -> Motion:
    return Motion(
        id=value["id"],
        widget_id=value["widgetId"],
        screen_id=value["screenId"],
        kind=MotionKind(value["kind"]),
        role=MotionRole(value["role"]),
        duration_ms=value["durationMs"],
        easing=EasingKind(value["easing"]),
        custom_curve=value["customCurve"],
        capture_asset_path=value["captureAssetPath"],
        trust=_trust(value["trust"]),
        attribution_actor=ActorKind(value["attributionActor"]),
        created_at_ms=value["createdAtMs"],
    )


def _serialize_motion(motion: Motion) -> dict:
    return {
        "id": motion.id,
        "widgetId": motion.widget_id,
        "screenId": motion.screen_id,
        "kind": motion.kind.value,
        "role": motion.role.value,
        "durationMs": motion.duration_ms,
        "easing": motion.easing.value,
        "customCurve": motion.custom_curve,
        "captureAssetPath": motion.capture_asset_path,
        "trust": {
            "state": motion.trust.state.value,
            "grounding": (
                motion.trust.grounding.value
                if motion.trust.grounding is not None
                else None
            ),
        },
        "attributionActor": motion.attribution_actor.value,
        "createdAtMs": motion.created_at_ms,
    }


def test_python_and_typescript_motion_contracts_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-motion.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_payload = json.loads(result.stdout)
    py_payload = {
        "motionKinds": [kind.value for kind in MotionKind],
        "motionRoles": [role.value for role in MotionRole],
        "easingKinds": [easing.value for easing in EasingKind],
        "motions": [
            {
                "name": scenario["name"],
                "motion": _serialize_motion(_motion(scenario["input"])),
            }
            for scenario in PARITY_MOTIONS
        ],
    }

    assert ts_payload == py_payload, (
        "Cross-language parity invariant violated: Python and TypeScript Motion "
        "schemas must expose the same enum strings and record shapes"
    )
