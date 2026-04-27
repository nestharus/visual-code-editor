import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.screen import (
    SCREEN_EDGE_ID_PATTERN,
    SCREEN_ID_PATTERN,
    Screen,
    ScreenEdge,
    ScreenEdgeKind,
    ScreenEdgeTrigger,
    ScreenKind,
    screen_edge_kind_from_string,
    screen_edge_trigger_from_string,
    screen_kind_from_string,
)
from visual_code_editor.model.trust import TrustSignal, TrustState


CONTRACT_SCREEN_KINDS = (
    ("PAGE", "page"),
    ("MODAL", "modal"),
    ("OVERLAY", "overlay"),
    ("DIALOG", "dialog"),
    ("POPOVER", "popover"),
    ("DRAWER", "drawer"),
    ("SIDEPANEL", "sidepanel"),
    ("TOAST", "toast"),
)

CONTRACT_SCREEN_EDGE_KINDS = (
    ("NAVIGATE", "navigate"),
    ("OPEN_MODAL", "open-modal"),
    ("CLOSE_MODAL", "close-modal"),
    ("PUSH", "push"),
    ("POP", "pop"),
    ("REPLACE", "replace"),
    ("REDIRECT", "redirect"),
    ("USER_BACK", "user-back"),
)

CONTRACT_SCREEN_EDGE_TRIGGERS = (
    ("CLICK", "click"),
    ("KEYBOARD", "keyboard"),
    ("AUTO", "auto"),
    ("ROUTE", "route"),
    ("PARENT_REQUEST", "parent-request"),
)

CONTRACT_SCREEN_KIND_VALUES = tuple(value for _, value in CONTRACT_SCREEN_KINDS)
CONTRACT_SCREEN_EDGE_KIND_VALUES = tuple(
    value for _, value in CONTRACT_SCREEN_EDGE_KINDS
)
CONTRACT_SCREEN_EDGE_TRIGGER_VALUES = tuple(
    value for _, value in CONTRACT_SCREEN_EDGE_TRIGGERS
)


def _trust() -> TrustSignal:
    return TrustSignal(state=TrustState.CANDIDATE, grounding=None)


def _screen(**overrides) -> Screen:
    values = {
        "id": "screen:overview",
        "label": "Overview",
        "kind": ScreenKind.PAGE,
        "route": "/",
        "widget_ids": ("widget:nav.primary", "widget:graph.canvas"),
        "trust": _trust(),
        "attribution_actor": ActorKind.GENERATOR,
        "created_at_ms": 1_700_000_000_000,
    }
    values.update(overrides)
    return Screen(**values)


def _screen_edge(**overrides) -> ScreenEdge:
    values = {
        "id": "screen-edge:overview-to-detail",
        "from_screen_id": "screen:overview",
        "to_screen_id": "screen:detail",
        "kind": ScreenEdgeKind.NAVIGATE,
        "trigger": ScreenEdgeTrigger.CLICK,
        "trust": _trust(),
        "attribution_actor": ActorKind.GENERATOR,
        "observed_at_ms": 1_700_000_001_000,
    }
    values.update(overrides)
    return ScreenEdge(**values)


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_SCREEN_KINDS)
def test_screen_kind_enum_contains_each_contract_member(member_name, kind_value):
    assert hasattr(ScreenKind, member_name), (
        f"Enum membership invariant violated: ScreenKind is missing {member_name}"
    )
    assert getattr(ScreenKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"ScreenKind.{member_name}.value must be {kind_value!r}"
    )


@pytest.mark.parametrize(
    ("member_name", "kind_value"),
    CONTRACT_SCREEN_EDGE_KINDS,
)
def test_screen_edge_kind_enum_contains_each_contract_member(member_name, kind_value):
    assert hasattr(ScreenEdgeKind, member_name), (
        f"Enum membership invariant violated: ScreenEdgeKind is missing {member_name}"
    )
    assert getattr(ScreenEdgeKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"ScreenEdgeKind.{member_name}.value must be {kind_value!r}"
    )


@pytest.mark.parametrize(
    ("member_name", "trigger_value"),
    CONTRACT_SCREEN_EDGE_TRIGGERS,
)
def test_screen_edge_trigger_enum_contains_each_contract_member(
    member_name,
    trigger_value,
):
    assert hasattr(ScreenEdgeTrigger, member_name), (
        f"Enum membership invariant violated: ScreenEdgeTrigger is missing {member_name}"
    )
    assert getattr(ScreenEdgeTrigger, member_name).value == trigger_value, (
        "String stability invariant violated: "
        f"ScreenEdgeTrigger.{member_name}.value must be {trigger_value!r}"
    )


def test_screen_enums_contain_exactly_the_contract_members():
    assert len(ScreenKind) == 8
    assert tuple(kind.value for kind in ScreenKind) == CONTRACT_SCREEN_KIND_VALUES

    assert len(ScreenEdgeKind) == 8
    assert (
        tuple(kind.value for kind in ScreenEdgeKind)
        == CONTRACT_SCREEN_EDGE_KIND_VALUES
    )

    assert len(ScreenEdgeTrigger) == 5
    assert (
        tuple(trigger.value for trigger in ScreenEdgeTrigger)
        == CONTRACT_SCREEN_EDGE_TRIGGER_VALUES
    )


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_SCREEN_KINDS)
def test_screen_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert screen_kind_from_string(kind_value) is getattr(ScreenKind, member_name)


@pytest.mark.parametrize(
    ("member_name", "kind_value"),
    CONTRACT_SCREEN_EDGE_KINDS,
)
def test_screen_edge_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert screen_edge_kind_from_string(kind_value) is getattr(
        ScreenEdgeKind,
        member_name,
    )


@pytest.mark.parametrize(
    ("member_name", "trigger_value"),
    CONTRACT_SCREEN_EDGE_TRIGGERS,
)
def test_screen_edge_trigger_from_string_accepts_every_contract_value(
    member_name,
    trigger_value,
):
    assert screen_edge_trigger_from_string(trigger_value) is getattr(
        ScreenEdgeTrigger,
        member_name,
    )


@pytest.mark.parametrize("invalid_value", ("", "PAGE", "screen", "page ", "modal "))
def test_screen_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        screen_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "NAVIGATE", "open_modal", "navigate ", "click"),
)
def test_screen_edge_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        screen_edge_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "CLICK", "parent_request", "route ", "navigate"),
)
def test_screen_edge_trigger_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        screen_edge_trigger_from_string(invalid_value)


@pytest.mark.parametrize(
    "screen_id",
    (
        "screen:overview",
        "screen:Screen_123",
        "screen:system-card",
    ),
)
def test_screen_id_pattern_accepts_contract_values(screen_id):
    assert SCREEN_ID_PATTERN.fullmatch(screen_id)
    assert _screen(id=screen_id).id == screen_id


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
def test_screen_id_pattern_rejects_invalid_values(screen_id):
    assert not SCREEN_ID_PATTERN.fullmatch(screen_id)
    with pytest.raises(ValueError):
        _screen(id=screen_id)


@pytest.mark.parametrize("label", ("", "   ", "\n\t"))
def test_screen_validation_rejects_empty_label(label):
    with pytest.raises(ValueError):
        _screen(label=label)


def test_screen_validation_dedupes_widget_ids_in_order():
    screen = _screen(
        widget_ids=(
            "widget:nav.primary",
            "widget:graph.canvas",
            "widget:nav.primary",
            "widget:detail-panel",
        ),
    )

    assert screen.widget_ids == (
        "widget:nav.primary",
        "widget:graph.canvas",
        "widget:detail-panel",
    )


@pytest.mark.parametrize(
    "widget_id",
    (
        "",
        "nav.primary",
        "widget:",
        "Widget:button",
        "widget:has spaces",
        "widget:button/primary",
    ),
)
def test_screen_validation_rejects_invalid_widget_ids(widget_id):
    with pytest.raises(ValueError):
        _screen(widget_ids=("widget:nav.primary", widget_id))


@pytest.mark.parametrize(
    "edge_id",
    (
        "screen-edge:overview-to-detail",
        "screen-edge:Screen_123",
        "screen-edge:system-card",
    ),
)
def test_screen_edge_id_pattern_accepts_contract_values(edge_id):
    assert SCREEN_EDGE_ID_PATTERN.fullmatch(edge_id)
    assert _screen_edge(id=edge_id).id == edge_id


@pytest.mark.parametrize(
    "edge_id",
    (
        "",
        "overview-to-detail",
        "screen-edge:",
        "Screen-edge:overview",
        "screen-edge:has spaces",
        "screen-edge:overview/detail",
    ),
)
def test_screen_edge_id_pattern_rejects_invalid_values(edge_id):
    assert not SCREEN_EDGE_ID_PATTERN.fullmatch(edge_id)
    with pytest.raises(ValueError):
        _screen_edge(id=edge_id)


@pytest.mark.parametrize(
    "field_name",
    ("from_screen_id", "to_screen_id"),
)
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
def test_screen_edge_rejects_invalid_endpoint_screen_ids(field_name, screen_id):
    with pytest.raises(ValueError):
        _screen_edge(**{field_name: screen_id})


def test_screen_edge_allows_self_loop_screen_ids():
    edge = _screen_edge(
        from_screen_id="screen:overview",
        to_screen_id="screen:overview",
        kind=ScreenEdgeKind.REPLACE,
    )

    assert edge.from_screen_id == "screen:overview"
    assert edge.to_screen_id == "screen:overview"
