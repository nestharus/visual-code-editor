import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.pr_delta import (
    PR_DELTA_ID_PATTERN,
    DeltaKind,
    EntityDelta,
    EntityKind,
    PRDeltaSet,
    delta_kind_from_string,
    entity_kind_from_string,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


CONTRACT_DELTA_KINDS = (
    ("ADDED", "added"),
    ("REMOVED", "removed"),
    ("RENAMED", "renamed"),
    ("RESHAPED", "reshaped"),
    ("UNCHANGED", "unchanged"),
    ("SPLIT", "split"),
    ("MERGED", "merged"),
    ("UNMATCHED", "unmatched"),
)

CONTRACT_ENTITY_KINDS = (
    ("BEHAVIOR", "behavior"),
    ("EDGE", "edge"),
    ("CONTAINER", "container"),
    ("STORE", "store"),
    ("ARTIFACT", "artifact"),
    ("WIDGET", "widget"),
    ("TEST", "test"),
    ("TASK", "task"),
)

CONTRACT_DELTA_KIND_VALUES = tuple(value for _, value in CONTRACT_DELTA_KINDS)
CONTRACT_ENTITY_KIND_VALUES = tuple(value for _, value in CONTRACT_ENTITY_KINDS)


def _trust(
    state: TrustState = TrustState.GROUNDED,
    grounding: GroundingSource | None = GroundingSource.LSP_TYPE,
) -> TrustSignal:
    return TrustSignal(state=state, grounding=grounding)


def _entity_delta(**overrides) -> EntityDelta:
    values = {
        "delta_kind": DeltaKind.RESHAPED,
        "entity_kind": EntityKind.BEHAVIOR,
        "base_id": "behavior:auth.validate-token",
        "head_id": "behavior:auth.validate-token",
        "related_ids": (),
        "trust": _trust(),
        "attribution_actor": ActorKind.GENERATOR,
    }
    values.update(overrides)
    return EntityDelta(**values)


def _pr_delta_set(**overrides) -> PRDeltaSet:
    values = {
        "id": "prdelta:repo.42",
        "base_revision": "abc123",
        "head_revision": "def456",
        "base_branch": "main",
        "head_branch": "feature/auth",
        "pr_number": 42,
        "task_id": None,
        "deltas": (_entity_delta(),),
        "computed_at_ms": 1_700_000_000_000,
        "attribution_actor": ActorKind.GENERATOR,
    }
    values.update(overrides)
    return PRDeltaSet(**values)


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_DELTA_KINDS)
def test_delta_kind_enum_contains_each_contract_member(member_name, kind_value):
    assert hasattr(DeltaKind, member_name), (
        f"Enum membership invariant violated: DeltaKind is missing {member_name}"
    )
    assert getattr(DeltaKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"DeltaKind.{member_name}.value must be {kind_value!r}"
    )


def test_delta_kind_enum_contains_exactly_the_contract_members():
    assert len(DeltaKind) == 8, (
        "Enum membership invariant violated: DeltaKind must expose 8 kinds"
    )
    assert tuple(kind.value for kind in DeltaKind) == CONTRACT_DELTA_KIND_VALUES, (
        "Enum membership invariant violated: DeltaKind must contain exactly the "
        "contract kinds"
    )


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_ENTITY_KINDS)
def test_entity_kind_enum_contains_each_contract_member(member_name, kind_value):
    assert hasattr(EntityKind, member_name), (
        f"Enum membership invariant violated: EntityKind is missing {member_name}"
    )
    assert getattr(EntityKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"EntityKind.{member_name}.value must be {kind_value!r}"
    )


def test_entity_kind_enum_contains_exactly_the_contract_members():
    assert len(EntityKind) == 8, (
        "Enum membership invariant violated: EntityKind must expose 8 kinds"
    )
    assert tuple(kind.value for kind in EntityKind) == CONTRACT_ENTITY_KIND_VALUES, (
        "Enum membership invariant violated: EntityKind must contain exactly the "
        "contract kinds"
    )


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_DELTA_KINDS)
def test_delta_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert delta_kind_from_string(kind_value) is getattr(DeltaKind, member_name)


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "ADD",
        "ADDED",
        "added ",
        "re-shaped",
        "unknown",
    ),
)
def test_delta_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        delta_kind_from_string(invalid_value)


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_ENTITY_KINDS)
def test_entity_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert entity_kind_from_string(kind_value) is getattr(EntityKind, member_name)


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "BEHAVIOR",
        "behaviour",
        "behavior ",
        "file",
        "work-item",
    ),
)
def test_entity_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        entity_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    "overrides",
    (
        {"delta_kind": DeltaKind.ADDED, "base_id": "behavior:base-added"},
        {"delta_kind": DeltaKind.ADDED, "base_id": None, "head_id": None},
        {"delta_kind": DeltaKind.REMOVED, "head_id": "behavior:head-removed"},
        {
            "delta_kind": DeltaKind.RENAMED,
            "base_id": "behavior:same",
            "head_id": "behavior:same",
        },
        {"delta_kind": DeltaKind.RENAMED, "base_id": None},
        {"delta_kind": DeltaKind.SPLIT, "related_ids": ()},
        {"delta_kind": DeltaKind.MERGED, "related_ids": ()},
        {"delta_kind": DeltaKind.UNMATCHED, "base_id": None, "head_id": None},
        {
            "delta_kind": DeltaKind.UNCHANGED,
            "base_id": "behavior:old",
            "head_id": "behavior:new",
        },
    ),
)
def test_entity_delta_validation_matrix_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _entity_delta(**overrides)


@pytest.mark.parametrize(
    "overrides",
    (
        {"delta_kind": DeltaKind.ADDED, "base_id": None, "head_id": "behavior:new"},
        {"delta_kind": DeltaKind.REMOVED, "base_id": "behavior:old", "head_id": None},
        {
            "delta_kind": DeltaKind.RENAMED,
            "base_id": "behavior:old",
            "head_id": "behavior:new",
        },
        {
            "delta_kind": DeltaKind.SPLIT,
            "base_id": "behavior:old",
            "head_id": "behavior:new-primary",
            "related_ids": ("behavior:new-secondary",),
        },
        {
            "delta_kind": DeltaKind.MERGED,
            "base_id": "behavior:old-primary",
            "head_id": "behavior:new",
            "related_ids": ("behavior:old-secondary",),
        },
        {"delta_kind": DeltaKind.UNMATCHED, "base_id": "behavior:old", "head_id": None},
    ),
)
def test_entity_delta_validation_accepts_contract_valid_values(overrides):
    delta = _entity_delta(**overrides)

    assert delta.delta_kind is overrides["delta_kind"]
    assert delta.trust == _trust()


@pytest.mark.parametrize(
    "pr_delta_id",
    (
        "prdelta:repo.42",
        "prdelta:task-abc_123",
        "prdelta:owner.repo:pull-42",
    ),
)
def test_pr_delta_id_pattern_accepts_contract_values(pr_delta_id):
    assert PR_DELTA_ID_PATTERN.fullmatch(pr_delta_id)
    assert _pr_delta_set(id=pr_delta_id).id == pr_delta_id


@pytest.mark.parametrize(
    "pr_delta_id",
    (
        "",
        "repo.42",
        "prdelta:",
        "prdelta:has spaces",
        "prdelta:has/slash",
    ),
)
def test_pr_delta_id_pattern_rejects_contract_values(pr_delta_id):
    assert not PR_DELTA_ID_PATTERN.fullmatch(pr_delta_id)
    with pytest.raises(ValueError):
        _pr_delta_set(id=pr_delta_id)


@pytest.mark.parametrize(
    "overrides",
    (
        {"base_revision": ""},
        {"head_revision": ""},
        {"base_revision": "abc123", "head_revision": "abc123"},
        {"base_branch": ""},
        {"head_branch": ""},
        {"pr_number": 42, "task_id": "task:t1"},
        {"pr_number": None, "task_id": None},
        {"computed_at_ms": -1},
    ),
)
def test_pr_delta_set_validation_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _pr_delta_set(**overrides)


def test_pr_delta_set_validation_allows_empty_delta_tuple():
    delta_set = _pr_delta_set(deltas=())

    assert delta_set.deltas == ()


def test_pr_delta_set_validation_accepts_task_id_instead_of_pr_number():
    delta_set = _pr_delta_set(pr_number=None, task_id="task:t1")

    assert delta_set.pr_number is None
    assert delta_set.task_id == "task:t1"
