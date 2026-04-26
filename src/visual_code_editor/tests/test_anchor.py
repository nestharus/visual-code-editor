import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.anchor import (
    CONTAINER_ANCHOR_KINDS,
    AnchorContext,
    AnchorKind,
    SelectionItem,
    SelectionMode,
    anchor_kind_from_string,
    make_selection_scope,
    selection_mode_from_string,
)


CONTRACT_ANCHOR_KINDS = (
    ("NODE", "node"),
    ("EDGE", "edge"),
    ("CODE_BLOCK", "code-block"),
    ("SECTION", "section"),
    ("BEHAVIOUR_CARD", "behaviour-card"),
    ("TASK", "task"),
    ("PR_DELTA", "pr-delta"),
    ("SELECTION_BOX", "selection-box"),
    ("SLICE", "slice"),
    ("SCREEN", "screen"),
    ("WIDGET", "widget"),
)

CONTRACT_SELECTION_MODES = (
    ("ENTITY", "entity"),
    ("CONTENTS", "contents"),
)

CONTRACT_ANCHOR_VALUES = tuple(value for _, value in CONTRACT_ANCHOR_KINDS)
CONTRACT_SELECTION_MODE_VALUES = tuple(value for _, value in CONTRACT_SELECTION_MODES)
CONTRACT_CONTAINER_NAMES = ("NODE", "BEHAVIOUR_CARD", "SCREEN", "WIDGET")


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_ANCHOR_KINDS)
def test_anchor_kind_enum_contains_each_contract_member(member_name, kind_value):
    assert hasattr(AnchorKind, member_name), (
        f"Enum membership invariant violated: AnchorKind is missing {member_name}"
    )
    assert getattr(AnchorKind, member_name).value == kind_value, (
        f"Stability invariant violated: AnchorKind.{member_name}.value must be {kind_value!r}"
    )


@pytest.mark.parametrize(("member_name", "mode_value"), CONTRACT_SELECTION_MODES)
def test_selection_mode_enum_contains_each_contract_member(member_name, mode_value):
    assert hasattr(SelectionMode, member_name), (
        f"Enum membership invariant violated: SelectionMode is missing {member_name}"
    )
    assert getattr(SelectionMode, member_name).value == mode_value, (
        "Stability invariant violated: "
        f"SelectionMode.{member_name}.value must be {mode_value!r}"
    )


def test_anchor_kind_enum_contains_exactly_the_contract_members():
    assert len(AnchorKind) == 11, (
        "Enum membership invariant violated: AnchorKind must expose 11 anchor kinds"
    )
    assert tuple(kind.value for kind in AnchorKind) == CONTRACT_ANCHOR_VALUES, (
        "Enum membership invariant violated: AnchorKind must contain exactly the contract "
        "anchor kinds"
    )


def test_selection_mode_enum_contains_exactly_the_contract_members():
    assert len(SelectionMode) == 2, (
        "Enum membership invariant violated: SelectionMode must expose 2 selection modes"
    )
    assert tuple(mode.value for mode in SelectionMode) == CONTRACT_SELECTION_MODE_VALUES, (
        "Enum membership invariant violated: SelectionMode must contain exactly the contract "
        "selection modes"
    )


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_ANCHOR_KINDS)
def test_anchor_kind_from_string_accepts_every_contract_value(member_name, kind_value):
    assert anchor_kind_from_string(kind_value) is getattr(AnchorKind, member_name), (
        f"anchor_kind_from_string strictness invariant violated: {kind_value!r} must parse "
        f"to AnchorKind.{member_name}"
    )


@pytest.mark.parametrize(("member_name", "mode_value"), CONTRACT_SELECTION_MODES)
def test_selection_mode_from_string_accepts_every_contract_value(member_name, mode_value):
    assert selection_mode_from_string(mode_value) is getattr(SelectionMode, member_name), (
        "selection_mode_from_string strictness invariant violated: "
        f"{mode_value!r} must parse to SelectionMode.{member_name}"
    )


def test_anchor_kind_from_string_rejects_unknown_values():
    with pytest.raises(ValueError):
        anchor_kind_from_string("button")


def test_selection_mode_from_string_rejects_unknown_values():
    with pytest.raises(ValueError):
        selection_mode_from_string("entity-and-contents")


@pytest.mark.parametrize(("member_name", "_kind_value"), CONTRACT_ANCHOR_KINDS)
def test_every_anchor_kind_accepts_entity_mode(member_name, _kind_value):
    kind = getattr(AnchorKind, member_name)

    item = SelectionItem(id=f"{kind.value}-entity", kind=kind, mode=SelectionMode.ENTITY)

    assert item.id == f"{kind.value}-entity"
    assert item.kind is kind
    assert item.mode is SelectionMode.ENTITY


@pytest.mark.parametrize(("member_name", "_kind_value"), CONTRACT_ANCHOR_KINDS)
def test_contents_mode_is_restricted_to_container_anchor_kinds(member_name, _kind_value):
    kind = getattr(AnchorKind, member_name)

    if member_name in CONTRACT_CONTAINER_NAMES:
        item = SelectionItem(
            id=f"{kind.value}-contents",
            kind=kind,
            mode=SelectionMode.CONTENTS,
        )
        assert item.kind is kind
        assert item.mode is SelectionMode.CONTENTS
        return

    with pytest.raises(ValueError):
        SelectionItem(id=f"{kind.value}-contents", kind=kind, mode=SelectionMode.CONTENTS)


def test_selection_scope_rejects_duplicate_id_and_mode_pairs():
    first = SelectionItem(id="same", kind=AnchorKind.NODE, mode=SelectionMode.ENTITY)
    duplicate_pair = SelectionItem(id="same", kind=AnchorKind.EDGE, mode=SelectionMode.ENTITY)

    with pytest.raises(ValueError):
        make_selection_scope((first, duplicate_pair))


def test_selection_scope_allows_same_id_with_different_modes():
    entity_item = SelectionItem(id="same", kind=AnchorKind.NODE, mode=SelectionMode.ENTITY)
    contents_item = SelectionItem(id="same", kind=AnchorKind.NODE, mode=SelectionMode.CONTENTS)

    scope = make_selection_scope((entity_item, contents_item))

    assert scope.items == (entity_item, contents_item)
    assert scope.primary_anchor is AnchorKind.NODE


def test_selection_scope_primary_anchor_is_none_for_empty_scope():
    scope = make_selection_scope(())

    assert scope.items == ()
    assert scope.primary_anchor is None


def test_selection_scope_primary_anchor_comes_from_last_item():
    first = SelectionItem(id="first", kind=AnchorKind.NODE, mode=SelectionMode.ENTITY)
    last = SelectionItem(id="last", kind=AnchorKind.WIDGET, mode=SelectionMode.CONTENTS)

    scope = make_selection_scope((first, last))

    assert scope.primary_anchor is AnchorKind.WIDGET


def test_anchor_context_surface_anchor_is_independent_of_selection_primary_anchor():
    selection = make_selection_scope(
        (SelectionItem(id="selected-node", kind=AnchorKind.NODE, mode=SelectionMode.ENTITY),)
    )

    context = AnchorContext(selection=selection, surface_anchor=AnchorKind.SECTION)

    assert context.selection.primary_anchor is AnchorKind.NODE
    assert context.surface_anchor is AnchorKind.SECTION


def test_container_anchor_kinds_match_contract_set():
    expected = {getattr(AnchorKind, member_name) for member_name in CONTRACT_CONTAINER_NAMES}

    assert CONTAINER_ANCHOR_KINDS == frozenset(expected), (
        "CONTAINER_ANCHOR_KINDS membership invariant violated: only node, behaviour-card, "
        "screen, and widget may accept contents mode"
    )
