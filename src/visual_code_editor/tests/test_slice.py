import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.slice import (
    SLICE_ID_PATTERN,
    NeighbourhoodKind,
    NeighbourhoodRule,
    Slice,
    SliceLifecycleState,
    neighbourhood_kind_from_string,
    slice_lifecycle_state_from_string,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


CONTRACT_NEIGHBOURHOOD_KINDS = (
    ("DIRECT_NEIGHBOURS", "direct-neighbours"),
    ("TRANSITIVE_BY_EDGE_KIND", "transitive-by-edge-kind"),
    ("SHARED_BEHAVIOUR", "shared-behaviour"),
    ("SHARED_CONTAINER", "shared-container"),
    ("EXACT", "exact"),
)

CONTRACT_LIFECYCLE_STATES = (
    ("ACTIVE", "active"),
    ("PINNED", "pinned"),
    ("EXPIRING", "expiring"),
    ("TOMBSTONED", "tombstoned"),
    ("RECOVERED", "recovered"),
    ("DISMISSED", "dismissed"),
)

CONTRACT_NEIGHBOURHOOD_KIND_VALUES = tuple(
    value for _, value in CONTRACT_NEIGHBOURHOOD_KINDS
)
CONTRACT_LIFECYCLE_STATE_VALUES = tuple(
    value for _, value in CONTRACT_LIFECYCLE_STATES
)


def _trust() -> TrustSignal:
    return TrustSignal(state=TrustState.GROUNDED, grounding=GroundingSource.LSP_TYPE)


def _rule(**overrides) -> NeighbourhoodRule:
    values = {
        "kind": NeighbourhoodKind.EXACT,
        "edge_kinds": (),
        "max_hops": 0,
    }
    values.update(overrides)
    return NeighbourhoodRule(**values)


def _slice(**overrides) -> Slice:
    values = {
        "id": "slice:auth-search",
        "query": "auth",
        "matched_entity_ids": ("system:auth",),
        "neighbourhood_entity_ids": ("module:auth.session",),
        "rule": _rule(),
        "lifecycle_state": SliceLifecycleState.ACTIVE,
        "ttl_ms": 1_700_000_900_000,
        "created_by": ActorKind.YOU_THIS_SESSION,
        "created_at_ms": 1_700_000_000_000,
        "pinned_at_ms": None,
        "trust": _trust(),
    }
    values.update(overrides)
    return Slice(**values)


@pytest.mark.parametrize(
    ("member_name", "kind_value"), CONTRACT_NEIGHBOURHOOD_KINDS
)
def test_neighbourhood_kind_enum_contains_each_contract_member(
    member_name,
    kind_value,
):
    assert hasattr(NeighbourhoodKind, member_name), (
        "Enum membership invariant violated: "
        f"NeighbourhoodKind is missing {member_name}"
    )
    assert getattr(NeighbourhoodKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"NeighbourhoodKind.{member_name}.value must be {kind_value!r}"
    )


def test_neighbourhood_kind_enum_contains_exactly_the_contract_members():
    assert len(NeighbourhoodKind) == 5, (
        "Enum membership invariant violated: NeighbourhoodKind must expose 5 kinds"
    )
    assert (
        tuple(kind.value for kind in NeighbourhoodKind)
        == CONTRACT_NEIGHBOURHOOD_KIND_VALUES
    ), (
        "Enum membership invariant violated: NeighbourhoodKind must contain exactly "
        "the contract kinds"
    )


@pytest.mark.parametrize(("member_name", "state_value"), CONTRACT_LIFECYCLE_STATES)
def test_slice_lifecycle_state_enum_contains_each_contract_member(
    member_name,
    state_value,
):
    assert hasattr(SliceLifecycleState, member_name), (
        "Enum membership invariant violated: "
        f"SliceLifecycleState is missing {member_name}"
    )
    assert getattr(SliceLifecycleState, member_name).value == state_value, (
        "String stability invariant violated: "
        f"SliceLifecycleState.{member_name}.value must be {state_value!r}"
    )


def test_slice_lifecycle_state_enum_contains_exactly_the_contract_members():
    assert len(SliceLifecycleState) == 6, (
        "Enum membership invariant violated: SliceLifecycleState must expose 6 states"
    )
    assert (
        tuple(state.value for state in SliceLifecycleState)
        == CONTRACT_LIFECYCLE_STATE_VALUES
    ), (
        "Enum membership invariant violated: SliceLifecycleState must contain exactly "
        "the contract states"
    )


@pytest.mark.parametrize(
    ("member_name", "kind_value"), CONTRACT_NEIGHBOURHOOD_KINDS
)
def test_neighbourhood_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert neighbourhood_kind_from_string(kind_value) is getattr(
        NeighbourhoodKind, member_name
    )


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "direct_neighbors",
        "DIRECT_NEIGHBOURS",
        "direct-neighbours ",
        "shared-container-extra",
    ),
)
def test_neighbourhood_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        neighbourhood_kind_from_string(invalid_value)


@pytest.mark.parametrize(("member_name", "state_value"), CONTRACT_LIFECYCLE_STATES)
def test_slice_lifecycle_state_from_string_accepts_every_contract_value(
    member_name,
    state_value,
):
    assert slice_lifecycle_state_from_string(state_value) is getattr(
        SliceLifecycleState, member_name
    )


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "ACTIVE",
        "active ",
        "tombstone",
        "deleted",
    ),
)
def test_slice_lifecycle_state_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        slice_lifecycle_state_from_string(invalid_value)


@pytest.mark.parametrize(
    "overrides",
    (
        {"kind": NeighbourhoodKind.TRANSITIVE_BY_EDGE_KIND, "edge_kinds": ()},
        {
            "kind": NeighbourhoodKind.TRANSITIVE_BY_EDGE_KIND,
            "edge_kinds": ("imports",),
            "max_hops": 0,
        },
        {
            "kind": NeighbourhoodKind.DIRECT_NEIGHBOURS,
            "edge_kinds": ("imports",),
            "max_hops": 0,
        },
        {"kind": NeighbourhoodKind.DIRECT_NEIGHBOURS, "max_hops": 2},
    ),
)
def test_neighbourhood_rule_validation_matrix_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _rule(**overrides)


@pytest.mark.parametrize(
    "slice_id",
    (
        "slice:auth",
        "slice:Foo_Bar-1.2",
    ),
)
def test_slice_id_pattern_accepts_contract_values(slice_id):
    assert SLICE_ID_PATTERN.fullmatch(slice_id)
    assert _slice(id=slice_id).id == slice_id


@pytest.mark.parametrize(
    "slice_id",
    (
        "",
        "auth",
        "slice:",
        "slice:has spaces",
        "slice:has/slash",
    ),
)
def test_slice_id_pattern_rejects_contract_values(slice_id):
    assert not SLICE_ID_PATTERN.fullmatch(slice_id)
    with pytest.raises(ValueError):
        _slice(id=slice_id)


@pytest.mark.parametrize(
    "overrides",
    (
        {"query": ""},
        {"matched_entity_ids": ()},
    ),
)
def test_slice_content_invariants_reject_empty_query_or_matches(overrides):
    with pytest.raises(ValueError):
        _slice(**overrides)


@pytest.mark.parametrize(
    "neighbourhood_entity_ids",
    (
        ("module:auth.session", "module:auth.session"),
        ("system:auth", "module:auth.session"),
    ),
)
def test_slice_rejects_neighbourhood_duplicates_and_match_overlap(
    neighbourhood_entity_ids,
):
    with pytest.raises(ValueError):
        _slice(neighbourhood_entity_ids=neighbourhood_entity_ids)


@pytest.mark.parametrize(
    "overrides",
    (
        {"lifecycle_state": SliceLifecycleState.PINNED, "ttl_ms": 1_700_000_900_000},
        {"lifecycle_state": SliceLifecycleState.PINNED, "ttl_ms": None},
        {"lifecycle_state": SliceLifecycleState.ACTIVE, "ttl_ms": None},
    ),
)
def test_slice_lifecycle_ttl_pinned_matrix_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _slice(**overrides)


@pytest.mark.parametrize(
    "lifecycle_state",
    (
        SliceLifecycleState.EXPIRING,
        SliceLifecycleState.TOMBSTONED,
        SliceLifecycleState.RECOVERED,
        SliceLifecycleState.DISMISSED,
    ),
)
def test_slice_non_pinned_lifecycle_states_require_historical_ttl(lifecycle_state):
    with pytest.raises(ValueError):
        _slice(lifecycle_state=lifecycle_state, ttl_ms=None)


@pytest.mark.parametrize(
    "overrides",
    (
        {"created_at_ms": -1},
        {"pinned_at_ms": 1_699_999_999_999},
    ),
)
def test_slice_timestamp_invariants_reject_invalid_values(overrides):
    with pytest.raises(ValueError):
        _slice(**overrides)


def test_slice_accepts_contract_valid_pinned_state():
    created_at_ms = 1_700_000_000_000

    value = _slice(
        lifecycle_state=SliceLifecycleState.PINNED,
        ttl_ms=None,
        created_at_ms=created_at_ms,
        pinned_at_ms=created_at_ms,
    )

    assert value.lifecycle_state is SliceLifecycleState.PINNED
    assert value.ttl_ms is None
    assert value.pinned_at_ms == created_at_ms
