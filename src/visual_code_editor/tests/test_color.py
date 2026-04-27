import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.color import (
    ColorPalette,
    ColorRole,
    ColorToken,
    ContrastLevel,
    ContrastPair,
    color_role_from_string,
    contrast_level_from_string,
)
from visual_code_editor.model.trust import TrustSignal, TrustState


CONTRACT_COLOR_ROLES = (
    ("PRIMARY", "primary"),
    ("SECONDARY", "secondary"),
    ("ACCENT", "accent"),
    ("NEUTRAL", "neutral"),
    ("SURFACE", "surface"),
    ("BACKGROUND", "background"),
    ("TEXT", "text"),
    ("BORDER", "border"),
    ("SUCCESS", "success"),
    ("WARNING", "warning"),
    ("ERROR", "error"),
    ("INFO", "info"),
    ("MUTED", "muted"),
    ("DECORATIVE", "decorative"),
)

CONTRACT_CONTRAST_LEVELS = (
    ("PASS_AA", "pass-aa"),
    ("PASS_AAA", "pass-aaa"),
    ("FAIL", "fail"),
    ("NOT_TEXT", "not-text"),
)

CONTRACT_COLOR_ROLE_VALUES = tuple(value for _, value in CONTRACT_COLOR_ROLES)
CONTRACT_CONTRAST_LEVEL_VALUES = tuple(value for _, value in CONTRACT_CONTRAST_LEVELS)


def _trust() -> TrustSignal:
    return TrustSignal(state=TrustState.CANDIDATE, grounding=None)


def _token(**overrides) -> ColorToken:
    values = {
        "id": "color-token:text.primary",
        "name": "Primary text",
        "role": ColorRole.TEXT,
        "hex_value": "#FFFFFF",
        "description": "Primary foreground text.",
        "trust": _trust(),
        "attribution_actor": ActorKind.GENERATOR,
        "created_at_ms": 1_700_000_000_000,
    }
    values.update(overrides)
    return ColorToken(**values)


def _contrast_pair(**overrides) -> ContrastPair:
    values = {
        "id": "contrast-pair:text-on-bg",
        "foreground_token_id": "color-token:text.primary",
        "background_token_id": "color-token:bg.default",
        "ratio": 7.5,
        "level_normal_text": ContrastLevel.PASS_AA,
        "level_large_text": ContrastLevel.PASS_AAA,
        "level_ui_component": ContrastLevel.PASS_AA,
        "computed_at_ms": 1_700_000_000_001,
    }
    values.update(overrides)
    return ContrastPair(**values)


def _palette(**overrides) -> ColorPalette:
    values = {
        "id": "color-palette:workspace.default",
        "workspace_id": "workspace:main",
        "tokens": (
            _token(id="color-token:text.primary"),
            _token(
                id="color-token:bg.default",
                name="Default background",
                role=ColorRole.BACKGROUND,
                hex_value="#0D1117",
            ),
        ),
        "contrast_pairs": (_contrast_pair(),),
        "computed_at_ms": 1_700_000_000_002,
    }
    values.update(overrides)
    return ColorPalette(**values)


@pytest.mark.parametrize(("member_name", "role_value"), CONTRACT_COLOR_ROLES)
def test_color_role_enum_contains_each_contract_member(member_name, role_value):
    assert hasattr(ColorRole, member_name), (
        f"Enum membership invariant violated: ColorRole is missing {member_name}"
    )
    assert getattr(ColorRole, member_name).value == role_value, (
        "String stability invariant violated: "
        f"ColorRole.{member_name}.value must be {role_value!r}"
    )


@pytest.mark.parametrize(("member_name", "level_value"), CONTRACT_CONTRAST_LEVELS)
def test_contrast_level_enum_contains_each_contract_member(member_name, level_value):
    assert hasattr(ContrastLevel, member_name), (
        f"Enum membership invariant violated: ContrastLevel is missing {member_name}"
    )
    assert getattr(ContrastLevel, member_name).value == level_value, (
        "String stability invariant violated: "
        f"ContrastLevel.{member_name}.value must be {level_value!r}"
    )


def test_color_enums_contain_exactly_the_contract_members():
    assert len(ColorRole) == 14
    assert tuple(role.value for role in ColorRole) == CONTRACT_COLOR_ROLE_VALUES

    assert len(ContrastLevel) == 4
    assert tuple(level.value for level in ContrastLevel) == CONTRACT_CONTRAST_LEVEL_VALUES


@pytest.mark.parametrize(("member_name", "role_value"), CONTRACT_COLOR_ROLES)
def test_color_role_from_string_accepts_every_contract_value(member_name, role_value):
    assert color_role_from_string(role_value) is getattr(ColorRole, member_name)


@pytest.mark.parametrize(("member_name", "level_value"), CONTRACT_CONTRAST_LEVELS)
def test_contrast_level_from_string_accepts_every_contract_value(
    member_name,
    level_value,
):
    assert contrast_level_from_string(level_value) is getattr(ContrastLevel, member_name)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "PRIMARY", "primary ", "brand", "pass-aa"),
)
def test_color_role_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        color_role_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "PASS_AA", "pass_aa", "aa", "text"),
)
def test_contrast_level_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        contrast_level_from_string(invalid_value)


@pytest.mark.parametrize(
    "token_id",
    (
        "color-token:text.primary",
        "color-token:Brand_123",
        "color-token:surface-muted",
    ),
)
def test_color_token_id_pattern_accepts_contract_values(token_id):
    assert _token(id=token_id).id == token_id


@pytest.mark.parametrize(
    "token_id",
    (
        "",
        "text.primary",
        "color-token:",
        "Color-token:text",
        "color-token:has spaces",
        "color-token:text/primary",
    ),
)
def test_color_token_id_pattern_rejects_invalid_values(token_id):
    with pytest.raises(ValueError):
        _token(id=token_id)


@pytest.mark.parametrize(
    "hex_value",
    ("#FFFFFF", "#FFFFFFFF", "#00ffaa", "#00ffaa80"),
)
def test_color_token_hex_value_accepts_six_or_eight_hex_digits(hex_value):
    assert _token(hex_value=hex_value).hex_value == hex_value


@pytest.mark.parametrize(
    "hex_value",
    (
        "",
        "FFFFFF",
        "#fff",
        "#FFFFF",
        "#FFFFFFF",
        "#FFFFFFFFF",
        "#GGGGGG",
    ),
)
def test_color_token_hex_value_rejects_values_outside_contract_regex(hex_value):
    with pytest.raises(ValueError):
        _token(hex_value=hex_value)


@pytest.mark.parametrize(
    "pair_id",
    (
        "contrast-pair:text-on-bg",
        "contrast-pair:Pair_123",
        "contrast-pair:foreground.background",
    ),
)
def test_contrast_pair_id_pattern_accepts_contract_values(pair_id):
    assert _contrast_pair(id=pair_id).id == pair_id


@pytest.mark.parametrize(
    "pair_id",
    (
        "",
        "text-on-bg",
        "contrast-pair:",
        "Contrast-pair:text-on-bg",
        "contrast-pair:has spaces",
        "contrast-pair:text/bg",
    ),
)
def test_contrast_pair_id_pattern_rejects_invalid_values(pair_id):
    with pytest.raises(ValueError):
        _contrast_pair(id=pair_id)


@pytest.mark.parametrize(
    "token_field",
    ("foreground_token_id", "background_token_id"),
)
@pytest.mark.parametrize(
    "token_id",
    (
        "color-token:text.primary",
        "color-token:Brand_123",
        "color-token:surface-muted",
    ),
)
def test_contrast_pair_token_id_patterns_accept_contract_values(
    token_field,
    token_id,
):
    overrides = {token_field: token_id}
    if token_field == "background_token_id" and token_id == "color-token:text.primary":
        overrides["foreground_token_id"] = "color-token:other.foreground"

    assert getattr(_contrast_pair(**overrides), token_field) == token_id


@pytest.mark.parametrize(
    "token_field",
    ("foreground_token_id", "background_token_id"),
)
@pytest.mark.parametrize(
    "token_id",
    (
        "",
        "text.primary",
        "color-token:",
        "Color-token:text",
        "color-token:has spaces",
        "color-token:text/primary",
    ),
)
def test_contrast_pair_token_id_patterns_reject_invalid_values(token_field, token_id):
    with pytest.raises(ValueError):
        _contrast_pair(**{token_field: token_id})


def test_contrast_pair_rejects_equal_foreground_and_background_token_ids():
    with pytest.raises(ValueError):
        _contrast_pair(
            foreground_token_id="color-token:text.primary",
            background_token_id="color-token:text.primary",
        )


def test_contrast_pair_ratio_accepts_one_or_greater():
    assert _contrast_pair(ratio=1.0).ratio == 1.0
    assert _contrast_pair(ratio=4.5).ratio == 4.5


def test_contrast_pair_ratio_rejects_less_than_one():
    with pytest.raises(ValueError):
        _contrast_pair(ratio=0.999)


@pytest.mark.parametrize(
    "palette_id",
    (
        "color-palette:workspace.default",
        "color-palette:Palette_123",
        "color-palette:theme-dark",
    ),
)
def test_color_palette_id_pattern_accepts_contract_values(palette_id):
    assert _palette(id=palette_id).id == palette_id


@pytest.mark.parametrize(
    "palette_id",
    (
        "",
        "workspace.default",
        "color-palette:",
        "Color-palette:workspace",
        "color-palette:has spaces",
        "color-palette:workspace/default",
    ),
)
def test_color_palette_id_pattern_rejects_invalid_values(palette_id):
    with pytest.raises(ValueError):
        _palette(id=palette_id)


def test_color_palette_requires_at_least_one_token():
    with pytest.raises(ValueError):
        _palette(tokens=())


def test_color_palette_rejects_duplicate_token_ids():
    token = _token(id="color-token:text.primary")

    with pytest.raises(ValueError):
        _palette(tokens=(token, token))
