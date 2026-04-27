import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState
from visual_code_editor.model.widget import (
    WIDGET_ID_PATTERN,
    WIDGET_MAPPING_ID_PATTERN,
    Widget,
    WidgetKind,
    WidgetMapping,
    WidgetReference,
    WidgetSurface,
    widget_kind_from_string,
    widget_surface_from_string,
)


CONTRACT_WIDGET_KINDS = (
    ("BUTTON", "button"),
    ("INPUT", "input"),
    ("LIST", "list"),
    ("MODAL", "modal"),
    ("TAB", "tab"),
    ("PANEL", "panel"),
    ("CARD", "card"),
    ("TOOLTIP", "tooltip"),
    ("BANNER", "banner"),
    ("CHIP", "chip"),
    ("FORM", "form"),
    ("TABLE", "table"),
    ("AVATAR", "avatar"),
    ("ICON", "icon"),
    ("GENERIC", "generic"),
)

CONTRACT_WIDGET_SURFACES = (
    ("SOURCE", "source"),
    ("STORYBOOK", "storybook"),
    ("FIGMA", "figma"),
    ("DESIGN_TOKEN", "design-token"),
    ("RUNTIME", "runtime"),
)

CONTRACT_WIDGET_KIND_VALUES = tuple(value for _, value in CONTRACT_WIDGET_KINDS)
CONTRACT_WIDGET_SURFACE_VALUES = tuple(value for _, value in CONTRACT_WIDGET_SURFACES)


def _reference(**overrides) -> WidgetReference:
    values = {
        "surface": WidgetSurface.SOURCE,
        "identifier": "Button.tsx",
        "evidence_source": "component export scan",
    }
    values.update(overrides)
    return WidgetReference(**values)


def _widget(**overrides) -> Widget:
    values = {
        "id": "widget:button.primary",
        "label": "Primary Button",
        "kind": WidgetKind.BUTTON,
        "references": (_reference(),),
        "trust": TrustSignal(state=TrustState.CANDIDATE, grounding=None),
        "attribution_actor": ActorKind.YOU_THIS_SESSION,
        "created_at_ms": 1_700_000_000_000,
    }
    values.update(overrides)
    return Widget(**values)


def _mapping(**overrides) -> WidgetMapping:
    values = {
        "id": "widget-mapping:button.primary-source",
        "widget_id": "widget:button.primary",
        "reference": _reference(surface=WidgetSurface.FIGMA, identifier="figma:123"),
        "confirmed_by": ActorKind.YOU_THIS_SESSION,
        "confirmed_at_ms": 1_700_000_001_000,
        "notes": None,
    }
    values.update(overrides)
    return WidgetMapping(**values)


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_WIDGET_KINDS)
def test_widget_kind_enum_contains_each_contract_member(member_name, kind_value):
    assert hasattr(WidgetKind, member_name), (
        f"Enum membership invariant violated: WidgetKind is missing {member_name}"
    )
    assert getattr(WidgetKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"WidgetKind.{member_name}.value must be {kind_value!r}"
    )


@pytest.mark.parametrize(("member_name", "surface_value"), CONTRACT_WIDGET_SURFACES)
def test_widget_surface_enum_contains_each_contract_member(member_name, surface_value):
    assert hasattr(WidgetSurface, member_name), (
        f"Enum membership invariant violated: WidgetSurface is missing {member_name}"
    )
    assert getattr(WidgetSurface, member_name).value == surface_value, (
        "String stability invariant violated: "
        f"WidgetSurface.{member_name}.value must be {surface_value!r}"
    )


def test_widget_enums_contain_exactly_the_contract_members():
    assert len(WidgetKind) == 15, (
        "Enum membership invariant violated: WidgetKind must expose 15 kinds"
    )
    assert tuple(kind.value for kind in WidgetKind) == CONTRACT_WIDGET_KIND_VALUES, (
        "Enum membership invariant violated: WidgetKind must contain exactly the "
        "contract kinds"
    )

    assert len(WidgetSurface) == 5, (
        "Enum membership invariant violated: WidgetSurface must expose 5 surfaces"
    )
    assert (
        tuple(surface.value for surface in WidgetSurface)
        == CONTRACT_WIDGET_SURFACE_VALUES
    ), (
        "Enum membership invariant violated: WidgetSurface must contain exactly the "
        "contract surfaces"
    )


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_WIDGET_KINDS)
def test_widget_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert widget_kind_from_string(kind_value) is getattr(WidgetKind, member_name)


@pytest.mark.parametrize(("member_name", "surface_value"), CONTRACT_WIDGET_SURFACES)
def test_widget_surface_from_string_accepts_every_contract_value(
    member_name,
    surface_value,
):
    assert widget_surface_from_string(surface_value) is getattr(
        WidgetSurface,
        member_name,
    )


@pytest.mark.parametrize(
    "invalid_value",
    ("", "BUTTON", "text-input", "generic ", "component"),
)
def test_widget_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        widget_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "SOURCE", "design_token", "runtime ", "code"),
)
def test_widget_surface_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        widget_surface_from_string(invalid_value)


@pytest.mark.parametrize(
    "widget_id",
    (
        "widget:button.primary",
        "widget:Button_123",
        "widget:system-card",
    ),
)
def test_widget_id_pattern_accepts_contract_values(widget_id):
    assert WIDGET_ID_PATTERN.fullmatch(widget_id)
    assert _widget(id=widget_id).id == widget_id


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
def test_widget_id_pattern_rejects_invalid_values(widget_id):
    assert not WIDGET_ID_PATTERN.fullmatch(widget_id)
    with pytest.raises(ValueError):
        _widget(id=widget_id)


@pytest.mark.parametrize("label", ("", "   ", "\n\t"))
def test_widget_validation_rejects_empty_label(label):
    with pytest.raises(ValueError):
        _widget(label=label)


def test_widget_validation_requires_at_least_one_reference():
    with pytest.raises(ValueError):
        _widget(references=())


def test_widget_validation_dedupes_references_by_surface_and_identifier():
    source = _reference(
        surface=WidgetSurface.SOURCE,
        identifier="Button.tsx",
        evidence_source="component export scan",
    )
    duplicate = _reference(
        surface=WidgetSurface.SOURCE,
        identifier="Button.tsx",
        evidence_source="manual review",
    )
    distinct = _reference(
        surface=WidgetSurface.STORYBOOK,
        identifier="button--primary",
        evidence_source="storybook index",
    )

    widget = _widget(references=(source, duplicate, distinct))

    assert widget.references == (source, distinct)


@pytest.mark.parametrize("identifier", ("", "   ", "\n\t"))
def test_widget_reference_validation_rejects_empty_identifier(identifier):
    with pytest.raises(ValueError):
        _reference(identifier=identifier)


@pytest.mark.parametrize(
    "mapping_id",
    (
        "widget-mapping:button.primary-source",
        "widget-mapping:Button_123",
        "widget-mapping:system-card",
    ),
)
def test_widget_mapping_id_pattern_accepts_contract_values(mapping_id):
    assert WIDGET_MAPPING_ID_PATTERN.fullmatch(mapping_id)
    assert _mapping(id=mapping_id).id == mapping_id


@pytest.mark.parametrize(
    "mapping_id",
    (
        "",
        "button.primary-source",
        "widget-mapping:",
        "Widget-mapping:button",
        "widget-mapping:has spaces",
        "widget-mapping:button/primary",
    ),
)
def test_widget_mapping_id_pattern_rejects_invalid_values(mapping_id):
    assert not WIDGET_MAPPING_ID_PATTERN.fullmatch(mapping_id)
    with pytest.raises(ValueError):
        _mapping(id=mapping_id)


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
def test_widget_mapping_rejects_invalid_widget_id(widget_id):
    with pytest.raises(ValueError):
        _mapping(widget_id=widget_id)


def test_widget_uses_trust_signal_iff_grounding_invariant():
    grounded = _widget(
        trust=TrustSignal(
            state=TrustState.GROUNDED,
            grounding=GroundingSource.USER_CONFIRMED,
        )
    )

    assert grounded.trust.state is TrustState.GROUNDED
    assert grounded.trust.grounding is GroundingSource.USER_CONFIRMED

    with pytest.raises(ValueError):
        _widget(trust=TrustSignal(state=TrustState.GROUNDED, grounding=None))


@pytest.mark.parametrize(
    ("factory", "field"),
    (
        (_widget, "created_at_ms"),
        (_mapping, "confirmed_at_ms"),
    ),
)
def test_widget_timestamps_must_be_non_negative(factory, field):
    with pytest.raises(ValueError):
        factory(**{field: -1})
