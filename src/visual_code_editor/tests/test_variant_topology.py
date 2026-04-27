import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState
from visual_code_editor.model.variant_topology import (
    VARIANT_TOPOLOGY_ID_PATTERN,
    VariantAxis,
    VariantAxisKind,
    VariantCell,
    VariantCellState,
    VariantTopology,
    variant_axis_kind_from_string,
    variant_cell_state_from_string,
)


CONTRACT_AXIS_KINDS = (
    ("PROP", "prop"),
    ("THEME", "theme"),
    ("LOCALE", "locale"),
    ("DENSITY", "density"),
    ("A11Y_STATE", "a11y-state"),
    ("IMPLIED_STATE", "implied-state"),
    ("VIEWPORT", "viewport"),
)

CONTRACT_CELL_STATES = (
    ("GROUNDED", "grounded"),
    ("CANDIDATE", "candidate"),
    ("MISSING", "missing"),
    ("IMPLIED", "implied"),
)

CONTRACT_AXIS_KIND_VALUES = tuple(value for _, value in CONTRACT_AXIS_KINDS)
CONTRACT_CELL_STATE_VALUES = tuple(value for _, value in CONTRACT_CELL_STATES)


def _axis(**overrides) -> VariantAxis:
    values = {
        "kind": VariantAxisKind.PROP,
        "name": "size",
        "values": ("small", "large"),
    }
    values.update(overrides)
    return VariantAxis(**values)


def _cell(**overrides) -> VariantCell:
    values = {
        "coordinates": {"size": "small"},
        "state": VariantCellState.CANDIDATE,
        "evidence_render_ids": (),
        "trust": TrustSignal(state=TrustState.CANDIDATE, grounding=None),
    }
    values.update(overrides)
    return VariantCell(**values)


def _topology(**overrides) -> VariantTopology:
    axes = (_axis(),)
    values = {
        "id": "variant-topology:button.primary",
        "widget_id": "widget:button.primary",
        "axes": axes,
        "cells": (_cell(),),
        "computed_at_ms": 1_700_000_000_000,
    }
    values.update(overrides)
    return VariantTopology(**values)


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_AXIS_KINDS)
def test_variant_axis_kind_enum_contains_each_contract_member(
    member_name,
    kind_value,
):
    assert hasattr(VariantAxisKind, member_name), (
        f"Enum membership invariant violated: VariantAxisKind is missing {member_name}"
    )
    assert getattr(VariantAxisKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"VariantAxisKind.{member_name}.value must be {kind_value!r}"
    )


@pytest.mark.parametrize(("member_name", "state_value"), CONTRACT_CELL_STATES)
def test_variant_cell_state_enum_contains_each_contract_member(
    member_name,
    state_value,
):
    assert hasattr(VariantCellState, member_name), (
        f"Enum membership invariant violated: VariantCellState is missing {member_name}"
    )
    assert getattr(VariantCellState, member_name).value == state_value, (
        "String stability invariant violated: "
        f"VariantCellState.{member_name}.value must be {state_value!r}"
    )


def test_variant_enums_contain_exactly_the_contract_members():
    assert len(VariantAxisKind) == 7, (
        "Enum membership invariant violated: VariantAxisKind must expose 7 kinds"
    )
    assert tuple(kind.value for kind in VariantAxisKind) == CONTRACT_AXIS_KIND_VALUES

    assert len(VariantCellState) == 4, (
        "Enum membership invariant violated: VariantCellState must expose 4 states"
    )
    assert tuple(state.value for state in VariantCellState) == CONTRACT_CELL_STATE_VALUES


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_AXIS_KINDS)
def test_variant_axis_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert variant_axis_kind_from_string(kind_value) is getattr(
        VariantAxisKind,
        member_name,
    )


@pytest.mark.parametrize(("member_name", "state_value"), CONTRACT_CELL_STATES)
def test_variant_cell_state_from_string_accepts_every_contract_value(
    member_name,
    state_value,
):
    assert variant_cell_state_from_string(state_value) is getattr(
        VariantCellState,
        member_name,
    )


@pytest.mark.parametrize(
    "invalid_value",
    ("", "PROP", "a11y_state", "viewport ", "state"),
)
def test_variant_axis_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        variant_axis_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    ("", "GROUNDED", "not-covered", "candidate ", "covered"),
)
def test_variant_cell_state_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        variant_cell_state_from_string(invalid_value)


@pytest.mark.parametrize(
    "topology_id",
    (
        "variant-topology:button.primary",
        "variant-topology:Button_123",
        "variant-topology:system-card",
    ),
)
def test_topology_id_pattern_accepts_contract_values(topology_id):
    assert VARIANT_TOPOLOGY_ID_PATTERN.fullmatch(topology_id)
    assert _topology(id=topology_id).id == topology_id


@pytest.mark.parametrize(
    "topology_id",
    (
        "",
        "button.primary",
        "variant-topology:",
        "Variant-topology:button",
        "variant-topology:has spaces",
        "variant-topology:button/primary",
    ),
)
def test_topology_id_pattern_rejects_invalid_values(topology_id):
    assert not VARIANT_TOPOLOGY_ID_PATTERN.fullmatch(topology_id)
    with pytest.raises(ValueError):
        _topology(id=topology_id)


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
def test_variant_topology_rejects_invalid_widget_id(widget_id):
    with pytest.raises(ValueError):
        _topology(widget_id=widget_id)


def test_variant_topology_requires_at_least_one_axis():
    with pytest.raises(ValueError):
        _topology(axes=())


@pytest.mark.parametrize("name", ("", "   ", "\n\t"))
def test_variant_axis_rejects_empty_name(name):
    with pytest.raises(ValueError):
        _axis(name=name)


def test_variant_axis_rejects_empty_values():
    with pytest.raises(ValueError):
        _axis(values=())


def test_variant_axis_rejects_duplicated_values():
    with pytest.raises(ValueError):
        _axis(values=("small", "small"))


def test_variant_cell_coordinates_must_cover_every_axis():
    axes = (
        _axis(name="size", values=("small", "large")),
        _axis(kind=VariantAxisKind.THEME, name="theme", values=("dark", "light")),
    )
    cell = _cell(coordinates={"size": "small"})

    with pytest.raises(ValueError):
        _topology(axes=axes, cells=(cell,))


def test_variant_cell_coordinate_values_must_exist_on_axis():
    axes = (_axis(name="size", values=("small", "large")),)
    cell = _cell(coordinates={"size": "medium"})

    with pytest.raises(ValueError):
        _topology(axes=axes, cells=(cell,))


def test_variant_cell_evidence_render_ids_must_match_pattern():
    grounded = _cell(
        state=VariantCellState.GROUNDED,
        evidence_render_ids=("render:button.primary.desktop",),
    )
    assert grounded.evidence_render_ids == ("render:button.primary.desktop",)

    with pytest.raises(ValueError):
        _cell(
            state=VariantCellState.GROUNDED,
            evidence_render_ids=("button.primary.desktop",),
        )


def test_variant_cell_evidence_render_ids_are_non_empty_only_when_grounded():
    assert (
        _cell(
            state=VariantCellState.GROUNDED,
            evidence_render_ids=("render:button.primary.desktop",),
        ).evidence_render_ids
        == ("render:button.primary.desktop",)
    )

    for state in (
        VariantCellState.CANDIDATE,
        VariantCellState.MISSING,
        VariantCellState.IMPLIED,
    ):
        with pytest.raises(ValueError):
            _cell(
                state=state,
                evidence_render_ids=("render:button.primary.desktop",),
            )


def test_variant_cell_uses_trust_signal_iff_grounding_invariant():
    grounded = _cell(
        trust=TrustSignal(
            state=TrustState.GROUNDED,
            grounding=GroundingSource.USER_CONFIRMED,
        )
    )

    assert grounded.trust.state is TrustState.GROUNDED
    assert grounded.trust.grounding is GroundingSource.USER_CONFIRMED

    with pytest.raises(ValueError):
        _cell(trust=TrustSignal(state=TrustState.GROUNDED, grounding=None))
