import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.color import (
    ColorPalette,
    ColorRole,
    ColorToken,
    ContrastLevel,
    ContrastPair,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


PARITY_PALETTE = {
    "id": "color-palette:workspace.default",
    "workspaceId": "workspace:main",
    "tokens": [
        {
            "id": "color-token:text.primary",
            "name": "Primary text",
            "role": "text",
            "hexValue": "#FFFFFF",
            "description": "Primary foreground text.",
            "trust": {"state": "candidate", "grounding": None},
            "attributionActor": "generator",
            "createdAtMs": 1_700_000_000_000,
        },
        {
            "id": "color-token:bg.default",
            "name": "Default background",
            "role": "background",
            "hexValue": "#0D1117",
            "description": None,
            "trust": {"state": "grounded", "grounding": "user-confirmed"},
            "attributionActor": "you-this-session",
            "createdAtMs": 1_700_000_000_001,
        },
    ],
    "contrastPairs": [
        {
            "id": "contrast-pair:text-on-bg",
            "foregroundTokenId": "color-token:text.primary",
            "backgroundTokenId": "color-token:bg.default",
            "ratio": 7.5,
            "levelNormalText": "pass-aa",
            "levelLargeText": "pass-aaa",
            "levelUiComponent": "pass-aa",
            "computedAtMs": 1_700_000_000_002,
        }
    ],
    "computedAtMs": 1_700_000_000_003,
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


def _token_from_payload(payload) -> ColorToken:
    return ColorToken(
        id=payload["id"],
        name=payload["name"],
        role=ColorRole(payload["role"]),
        hex_value=payload["hexValue"],
        description=payload["description"],
        trust=_trust_signal(payload["trust"]),
        attribution_actor=ActorKind(payload["attributionActor"]),
        created_at_ms=payload["createdAtMs"],
    )


def _token_to_payload(token: ColorToken):
    return {
        "id": token.id,
        "name": token.name,
        "role": token.role.value,
        "hexValue": token.hex_value,
        "description": token.description,
        "trust": {
            "state": token.trust.state.value,
            "grounding": (
                token.trust.grounding.value if token.trust.grounding is not None else None
            ),
        },
        "attributionActor": token.attribution_actor.value,
        "createdAtMs": token.created_at_ms,
    }


def _contrast_pair_from_payload(payload) -> ContrastPair:
    return ContrastPair(
        id=payload["id"],
        foreground_token_id=payload["foregroundTokenId"],
        background_token_id=payload["backgroundTokenId"],
        ratio=payload["ratio"],
        level_normal_text=ContrastLevel(payload["levelNormalText"]),
        level_large_text=ContrastLevel(payload["levelLargeText"]),
        level_ui_component=ContrastLevel(payload["levelUiComponent"]),
        computed_at_ms=payload["computedAtMs"],
    )


def _contrast_pair_to_payload(pair: ContrastPair):
    return {
        "id": pair.id,
        "foregroundTokenId": pair.foreground_token_id,
        "backgroundTokenId": pair.background_token_id,
        "ratio": pair.ratio,
        "levelNormalText": pair.level_normal_text.value,
        "levelLargeText": pair.level_large_text.value,
        "levelUiComponent": pair.level_ui_component.value,
        "computedAtMs": pair.computed_at_ms,
    }


def _palette_from_payload(payload) -> ColorPalette:
    return ColorPalette(
        id=payload["id"],
        workspace_id=payload["workspaceId"],
        tokens=tuple(_token_from_payload(token) for token in payload["tokens"]),
        contrast_pairs=tuple(
            _contrast_pair_from_payload(pair) for pair in payload["contrastPairs"]
        ),
        computed_at_ms=payload["computedAtMs"],
    )


def _palette_to_payload(palette: ColorPalette):
    return {
        "id": palette.id,
        "workspaceId": palette.workspace_id,
        "tokens": [_token_to_payload(token) for token in palette.tokens],
        "contrastPairs": [
            _contrast_pair_to_payload(pair) for pair in palette.contrast_pairs
        ],
        "computedAtMs": palette.computed_at_ms,
    }


def test_python_and_typescript_color_contracts_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-color.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_payload = json.loads(result.stdout)
    py_payload = {
        "colorRoles": [role.value for role in ColorRole],
        "contrastLevels": [level.value for level in ContrastLevel],
        "palette": _palette_to_payload(_palette_from_payload(PARITY_PALETTE)),
    }

    assert ts_payload == py_payload, (
        "Cross-language parity invariant violated: Python and TypeScript color "
        "schemas must expose the same enum strings and record shapes"
    )
