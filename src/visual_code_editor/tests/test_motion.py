import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.motion import (
    MOTION_ID_PATTERN,
    SCREEN_ID_PATTERN,
    EasingKind,
    Motion,
    MotionKind,
    MotionRole,
    easing_kind_from_string,
    motion_kind_from_string,
    motion_role_from_string,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


CONTRACT_MOTION_KINDS = (
    ("ENTER", "enter"),
    ("EXIT", "exit"),
    ("HOVER", "hover"),
    ("PRESS", "press"),
    ("FOCUS", "focus"),
    ("TRANSITION", "transition"),
    ("AMBIENT", "ambient"),
    ("ATTENTION", "attention"),
)

CONTRACT_MOTION_ROLES = (
    ("STATE_CHANGE", "state-change"),
    ("AFFORDANCE", "affordance"),
    ("FEEDBACK", "feedback"),
    ("NAVIGATION", "navigation"),
    ("LOADING", "loading"),
    ("ERROR", "error"),
    ("CELEBRATION", "celebration"),
    ("AMBIENT", "ambient"),
)

CONTRACT_EASING_KINDS = (
    ("LINEAR", "linear"),
    ("EASE", "ease"),
    ("EASE_IN", "ease-in"),
    ("EASE_OUT", "ease-out"),
    ("EASE_IN_OUT", "ease-in-out"),
    ("STEP_START", "step-start"),
    ("STEP_END", "step-end"),
    ("CUSTOM", "custom"),
)

CONTRACT_MOTION_KIND_VALUES = tuple(value for _, value in CONTRACT_MOTION_KINDS)
CONTRACT_MOTION_ROLE_VALUES = tuple(value for _, value in CONTRACT_MOTION_ROLES)
CONTRACT_EASING_KIND_VALUES = tuple(value for _, value in CONTRACT_EASING_KINDS)


def _trust(
    state: TrustState = TrustState.CANDIDATE,
    grounding: GroundingSource | None = None,
) -> TrustSignal:
    return TrustSignal(state=state, grounding=grounding)


def _motion(**overrides) -> Motion:
    values = {
        "id": "motion:button.primary-hover",
        "widget_id": "widget:button.primary",
        "screen_id": None,
        "kind": MotionKind.HOVER,
        "role": MotionRole.AFFORDANCE,
        "duration_ms": 180,
        "easing": EasingKind.EASE_OUT,
        "custom_curve": None,
        "capture_asset_path": "app/assets/animations/button-hover.webm",
        "trust": _trust(),
        "attribution_actor": ActorKind.GENERATOR,
        "created_at_ms": 1_700_000_000_000,
    }
    values.update(overrides)
    return Motion(**values)


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_MOTION_KINDS)
def test_motion_kind_enum_contains_each_contract_member(member_name, kind_value):
    assert hasattr(MotionKind, member_name), (
        f"Enum membership invariant violated: MotionKind is missing {member_name}"
    )
    assert getattr(MotionKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"MotionKind.{member_name}.value must be {kind_value!r}"
    )


@pytest.mark.parametrize(("member_name", "role_value"), CONTRACT_MOTION_ROLES)
def test_motion_role_enum_contains_each_contract_member(member_name, role_value):
    assert hasattr(MotionRole, member_name), (
        f"Enum membership invariant violated: MotionRole is missing {member_name}"
    )
    assert getattr(MotionRole, member_name).value == role_value, (
        "String stability invariant violated: "
        f"MotionRole.{member_name}.value must be {role_value!r}"
    )


@pytest.mark.parametrize(("member_name", "easing_value"), CONTRACT_EASING_KINDS)
def test_easing_kind_enum_contains_each_contract_member(member_name, easing_value):
    assert hasattr(EasingKind, member_name), (
        f"Enum membership invariant violated: EasingKind is missing {member_name}"
    )
    assert getattr(EasingKind, member_name).value == easing_value, (
        "String stability invariant violated: "
        f"EasingKind.{member_name}.value must be {easing_value!r}"
    )


def test_motion_enums_contain_exactly_the_contract_members():
    assert len(MotionKind) == 8
    assert tuple(kind.value for kind in MotionKind) == CONTRACT_MOTION_KIND_VALUES

    assert len(MotionRole) == 8
    assert tuple(role.value for role in MotionRole) == CONTRACT_MOTION_ROLE_VALUES

    assert len(EasingKind) == 8
    assert tuple(easing.value for easing in EasingKind) == CONTRACT_EASING_KIND_VALUES


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_MOTION_KINDS)
def test_motion_kind_from_string_accepts_every_contract_value(member_name, kind_value):
    assert motion_kind_from_string(kind_value) is getattr(MotionKind, member_name)


@pytest.mark.parametrize(("member_name", "role_value"), CONTRACT_MOTION_ROLES)
def test_motion_role_from_string_accepts_every_contract_value(member_name, role_value):
    assert motion_role_from_string(role_value) is getattr(MotionRole, member_name)


@pytest.mark.parametrize(("member_name", "easing_value"), CONTRACT_EASING_KINDS)
def test_easing_kind_from_string_accepts_every_contract_value(
    member_name,
    easing_value,
):
    assert easing_kind_from_string(easing_value) is getattr(EasingKind, member_name)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "ENTER", "hover ", "tap", "state-change"),
)
def test_motion_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        motion_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "STATE_CHANGE", "state_change", "navigation ", "hover"),
)
def test_motion_role_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        motion_role_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "EASE_IN", "ease_in", "spring", "ease-out "),
)
def test_easing_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        easing_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    "motion_id",
    (
        "motion:button.primary-hover",
        "motion:Screen_123",
        "motion:system-card",
    ),
)
def test_motion_id_pattern_accepts_contract_values(motion_id):
    assert MOTION_ID_PATTERN.fullmatch(motion_id)
    assert _motion(id=motion_id).id == motion_id


@pytest.mark.parametrize(
    "motion_id",
    (
        "",
        "button.primary-hover",
        "motion:",
        "Motion:hover",
        "motion:has spaces",
        "motion:button/hover",
    ),
)
def test_motion_id_pattern_rejects_invalid_values(motion_id):
    assert not MOTION_ID_PATTERN.fullmatch(motion_id)
    with pytest.raises(ValueError):
        _motion(id=motion_id)


@pytest.mark.parametrize(
    "widget_id",
    (
        None,
        "widget:button.primary",
        "widget:Button_123",
        "widget:system-card",
    ),
)
def test_motion_widget_id_accepts_none_or_widget_pattern(widget_id):
    assert _motion(widget_id=widget_id).widget_id == widget_id


@pytest.mark.parametrize(
    "widget_id",
    (
        "",
        "button.primary",
        "widget:",
        "Widget:button",
        "widget:has spaces",
        "widget:button/primary",
    ),
)
def test_motion_widget_id_rejects_values_outside_widget_pattern(widget_id):
    with pytest.raises(ValueError):
        _motion(widget_id=widget_id)


@pytest.mark.parametrize(
    "screen_id",
    (
        None,
        "screen:overview",
        "screen:Screen_123",
        "screen:system-card",
    ),
)
def test_motion_screen_id_accepts_none_or_screen_pattern(screen_id):
    if screen_id is not None:
        assert SCREEN_ID_PATTERN.fullmatch(screen_id)
    assert _motion(screen_id=screen_id).screen_id == screen_id


@pytest.mark.parametrize(
    "screen_id",
    (
        "",
        "overview",
        "screen:",
        "Screen:overview",
        "screen:has spaces",
        "screen:overview/main",
    ),
)
def test_motion_screen_id_rejects_values_outside_screen_pattern(screen_id):
    assert not SCREEN_ID_PATTERN.fullmatch(screen_id)
    with pytest.raises(ValueError):
        _motion(screen_id=screen_id)


def test_custom_easing_requires_custom_curve():
    with pytest.raises(ValueError):
        _motion(easing=EasingKind.CUSTOM, custom_curve=None)

    motion = _motion(
        easing=EasingKind.CUSTOM,
        custom_curve="cubic-bezier(0.2, 0, 0, 1)",
    )

    assert motion.custom_curve == "cubic-bezier(0.2, 0, 0, 1)"


@pytest.mark.parametrize(
    "easing",
    (
        EasingKind.LINEAR,
        EasingKind.EASE,
        EasingKind.EASE_IN,
        EasingKind.EASE_OUT,
        EasingKind.EASE_IN_OUT,
        EasingKind.STEP_START,
        EasingKind.STEP_END,
    ),
)
def test_non_custom_easing_rejects_custom_curve(easing):
    with pytest.raises(ValueError):
        _motion(easing=easing, custom_curve="cubic-bezier(0.2, 0, 0, 1)")


@pytest.mark.parametrize("duration_ms", (0, 180))
def test_motion_accepts_non_negative_duration(duration_ms):
    assert _motion(duration_ms=duration_ms).duration_ms == duration_ms


def test_motion_rejects_negative_duration():
    with pytest.raises(ValueError):
        _motion(duration_ms=-1)


@pytest.mark.parametrize("created_at_ms", (0, 1_700_000_000_000))
def test_motion_accepts_non_negative_created_at(created_at_ms):
    assert _motion(created_at_ms=created_at_ms).created_at_ms == created_at_ms


def test_motion_rejects_negative_created_at():
    with pytest.raises(ValueError):
        _motion(created_at_ms=-1)


def test_motion_reasserts_trust_grounding_iff_grounded():
    valid_grounded = _trust(TrustState.GROUNDED, GroundingSource.USER_CONFIRMED)
    assert _motion(trust=valid_grounded).trust is valid_grounded

    invalid_grounded = object.__new__(TrustSignal)
    object.__setattr__(invalid_grounded, "state", TrustState.GROUNDED)
    object.__setattr__(invalid_grounded, "grounding", None)

    invalid_ungrounded = object.__new__(TrustSignal)
    object.__setattr__(invalid_ungrounded, "state", TrustState.CANDIDATE)
    object.__setattr__(invalid_ungrounded, "grounding", GroundingSource.TEST)

    with pytest.raises(ValueError):
        _motion(trust=invalid_grounded)
    with pytest.raises(ValueError):
        _motion(trust=invalid_ungrounded)
