import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.user_context import (
    CHANGE_EVENT_ID_PATTERN,
    USER_CONTEXT_ID_PATTERN,
    ChangeEvent,
    ChangeEventKind,
    ChangeEventTier,
    OpenedSurface,
    OpenedSurfaceKind,
    RecentPromptSummary,
    UserContext,
    change_event_kind_from_string,
    change_event_tier_from_string,
    opened_surface_kind_from_string,
)


CONTRACT_OPENED_SURFACE_KINDS = (
    ("DIAGRAM", "diagram"),
    ("PANEL", "panel"),
    ("BEHAVIOUR_CARD", "behaviour-card"),
    ("SLICE", "slice"),
    ("TASK", "task"),
    ("PR_DELTA", "pr-delta"),
)

CONTRACT_CHANGE_EVENT_KINDS = (
    ("ENTITY_ADDED", "entity-added"),
    ("ENTITY_REMOVED", "entity-removed"),
    ("ENTITY_RESHAPED", "entity-reshaped"),
    ("ENTITY_RENAMED", "entity-renamed"),
    ("ENTITY_SPLIT", "entity-split"),
    ("ENTITY_MERGED", "entity-merged"),
    ("ENTITY_UNMATCHED", "entity-unmatched"),
    ("PROVIDER_SYNC", "provider-sync"),
    ("TASK_STATE_CHANGE", "task-state-change"),
    ("REVIEW_THREAD_UPDATE", "review-thread-update"),
    ("AGENTS_RUNTIME_HEALTH", "agents-runtime-health"),
    ("CI_RUN_FINISHED", "ci-run-finished"),
)

CONTRACT_CHANGE_EVENT_TIERS = (
    ("IMMEDIATE", "immediate"),
    ("STASHED", "stashed"),
    ("SUPPRESSED", "suppressed"),
)

CONTRACT_OPENED_SURFACE_KIND_VALUES = tuple(
    value for _, value in CONTRACT_OPENED_SURFACE_KINDS
)
CONTRACT_CHANGE_EVENT_KIND_VALUES = tuple(
    value for _, value in CONTRACT_CHANGE_EVENT_KINDS
)
CONTRACT_CHANGE_EVENT_TIER_VALUES = tuple(
    value for _, value in CONTRACT_CHANGE_EVENT_TIERS
)


def _surface(**overrides) -> OpenedSurface:
    values = {
        "kind": OpenedSurfaceKind.DIAGRAM,
        "entity_id": "system:auth",
        "opened_at_ms": 1_700_000_000_000,
        "last_focused_at_ms": 1_700_000_000_500,
        "total_dwell_ms": 500,
    }
    values.update(overrides)
    return OpenedSurface(**values)


def _prompt(**overrides) -> RecentPromptSummary:
    values = {
        "request_id": "req-001",
        "mode": "ask",
        "surface_anchor": "node",
        "selection_count": 1,
        "issued_at_ms": 1_700_000_001_000,
    }
    values.update(overrides)
    return RecentPromptSummary(**values)


def _context(**overrides) -> UserContext:
    values = {
        "id": "user-context:session-1",
        "opened_surfaces": (_surface(),),
        "recent_prompts": (_prompt(),),
        "active_task_ids": ("task:t1",),
        "active_slice_ids": ("slice:s1",),
        "auto_motion_disabled": False,
        "computed_at_ms": 1_700_000_002_000,
    }
    values.update(overrides)
    return UserContext(**values)


def _event(**overrides) -> ChangeEvent:
    values = {
        "id": "change:c1",
        "kind": ChangeEventKind.ENTITY_ADDED,
        "actor": ActorKind.AGENTS_DIRECT,
        "affected_entity_ids": ("system:auth",),
        "affected_kinds": ("system",),
        "tier": ChangeEventTier.STASHED,
        "blocking": False,
        "timestamp_ms": 1_700_000_003_000,
        "context_summary": "Auth system was added.",
        "detail_url": None,
    }
    values.update(overrides)
    return ChangeEvent(**values)


@pytest.mark.parametrize(
    ("member_name", "kind_value"),
    CONTRACT_OPENED_SURFACE_KINDS,
)
def test_opened_surface_kind_enum_contains_each_contract_member(
    member_name,
    kind_value,
):
    assert hasattr(OpenedSurfaceKind, member_name), (
        "Enum membership invariant violated: "
        f"OpenedSurfaceKind is missing {member_name}"
    )
    assert getattr(OpenedSurfaceKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"OpenedSurfaceKind.{member_name}.value must be {kind_value!r}"
    )


def test_opened_surface_kind_enum_contains_exactly_the_contract_members():
    assert len(OpenedSurfaceKind) == 6, (
        "Enum membership invariant violated: OpenedSurfaceKind must expose 6 kinds"
    )
    assert (
        tuple(kind.value for kind in OpenedSurfaceKind)
        == CONTRACT_OPENED_SURFACE_KIND_VALUES
    ), (
        "Enum membership invariant violated: OpenedSurfaceKind must contain exactly "
        "the contract kinds"
    )


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_CHANGE_EVENT_KINDS)
def test_change_event_kind_enum_contains_each_contract_member(
    member_name,
    kind_value,
):
    assert hasattr(ChangeEventKind, member_name), (
        "Enum membership invariant violated: "
        f"ChangeEventKind is missing {member_name}"
    )
    assert getattr(ChangeEventKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"ChangeEventKind.{member_name}.value must be {kind_value!r}"
    )


def test_change_event_kind_enum_contains_exactly_the_contract_members():
    assert len(ChangeEventKind) == 12, (
        "Enum membership invariant violated: ChangeEventKind must expose 12 kinds"
    )
    assert (
        tuple(kind.value for kind in ChangeEventKind)
        == CONTRACT_CHANGE_EVENT_KIND_VALUES
    ), (
        "Enum membership invariant violated: ChangeEventKind must contain exactly "
        "the contract kinds"
    )


@pytest.mark.parametrize(("member_name", "tier_value"), CONTRACT_CHANGE_EVENT_TIERS)
def test_change_event_tier_enum_contains_each_contract_member(
    member_name,
    tier_value,
):
    assert hasattr(ChangeEventTier, member_name), (
        "Enum membership invariant violated: "
        f"ChangeEventTier is missing {member_name}"
    )
    assert getattr(ChangeEventTier, member_name).value == tier_value, (
        "String stability invariant violated: "
        f"ChangeEventTier.{member_name}.value must be {tier_value!r}"
    )


def test_change_event_tier_enum_contains_exactly_the_contract_members():
    assert len(ChangeEventTier) == 3, (
        "Enum membership invariant violated: ChangeEventTier must expose 3 tiers"
    )
    assert (
        tuple(tier.value for tier in ChangeEventTier)
        == CONTRACT_CHANGE_EVENT_TIER_VALUES
    ), (
        "Enum membership invariant violated: ChangeEventTier must contain exactly "
        "the contract tiers"
    )


@pytest.mark.parametrize(
    ("member_name", "kind_value"),
    CONTRACT_OPENED_SURFACE_KINDS,
)
def test_opened_surface_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert opened_surface_kind_from_string(kind_value) is getattr(
        OpenedSurfaceKind,
        member_name,
    )


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_CHANGE_EVENT_KINDS)
def test_change_event_kind_from_string_accepts_every_contract_value(
    member_name,
    kind_value,
):
    assert change_event_kind_from_string(kind_value) is getattr(
        ChangeEventKind,
        member_name,
    )


@pytest.mark.parametrize(("member_name", "tier_value"), CONTRACT_CHANGE_EVENT_TIERS)
def test_change_event_tier_from_string_accepts_every_contract_value(
    member_name,
    tier_value,
):
    assert change_event_tier_from_string(tier_value) is getattr(
        ChangeEventTier,
        member_name,
    )


@pytest.mark.parametrize(
    ("parser", "invalid_value"),
    (
        (opened_surface_kind_from_string, ""),
        (opened_surface_kind_from_string, "DIAGRAM"),
        (opened_surface_kind_from_string, "behaviour_card"),
        (opened_surface_kind_from_string, "diagram "),
        (change_event_kind_from_string, ""),
        (change_event_kind_from_string, "ENTITY_ADDED"),
        (change_event_kind_from_string, "entity_added"),
        (change_event_kind_from_string, "entity-added "),
        (change_event_tier_from_string, ""),
        (change_event_tier_from_string, "IMMEDIATE"),
        (change_event_tier_from_string, "immediate "),
    ),
)
def test_strict_enum_parsers_reject_unknown_values(parser, invalid_value):
    with pytest.raises(ValueError):
        parser(invalid_value)


@pytest.mark.parametrize(
    "overrides",
    (
        {"entity_id": ""},
        {"opened_at_ms": -1},
        {"opened_at_ms": 20, "last_focused_at_ms": 19},
        {"total_dwell_ms": -1},
    ),
)
def test_opened_surface_validation_matrix_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _surface(**overrides)


@pytest.mark.parametrize(
    "context_id",
    (
        "user-context:session",
        "user-context:User_1.2-abc",
    ),
)
def test_user_context_id_pattern_accepts_contract_values(context_id):
    assert USER_CONTEXT_ID_PATTERN.fullmatch(context_id)
    assert _context(id=context_id).id == context_id


@pytest.mark.parametrize(
    "context_id",
    (
        "",
        "session",
        "user-context:",
        "user-context:has spaces",
        "user-context:has/slash",
    ),
)
def test_user_context_id_pattern_rejects_contract_values(context_id):
    assert not USER_CONTEXT_ID_PATTERN.fullmatch(context_id)
    with pytest.raises(ValueError):
        _context(id=context_id)


def test_user_context_rejects_negative_computed_at_ms():
    with pytest.raises(ValueError):
        _context(computed_at_ms=-1)


def test_user_context_dedupes_opened_surfaces_by_kind_and_entity_id():
    older = _surface(last_focused_at_ms=1_700_000_000_100, total_dwell_ms=100)
    other = _surface(
        kind=OpenedSurfaceKind.PANEL,
        entity_id="system:auth",
        last_focused_at_ms=1_700_000_000_200,
        total_dwell_ms=200,
    )
    newer = _surface(last_focused_at_ms=1_700_000_000_900, total_dwell_ms=900)

    context = _context(opened_surfaces=(older, other, newer))
    by_key = {
        (surface.kind, surface.entity_id): surface
        for surface in context.opened_surfaces
    }

    assert len(context.opened_surfaces) == 2, (
        "UserContext opened_surfaces dedup invariant violated: surfaces must be "
        "unique by (kind, entity_id)"
    )
    assert by_key[(OpenedSurfaceKind.DIAGRAM, "system:auth")] == newer, (
        "UserContext opened_surfaces recency invariant violated: the most-recent "
        "surface must be kept when duplicate (kind, entity_id) entries exist"
    )


def test_user_context_dedupes_recent_prompts_by_request_id():
    context = _context(
        recent_prompts=(
            _prompt(request_id="req-001", issued_at_ms=1_700_000_001_000),
            _prompt(request_id="req-002", issued_at_ms=1_700_000_001_500),
            _prompt(request_id="req-001", issued_at_ms=1_700_000_002_000),
        )
    )

    request_ids = [prompt.request_id for prompt in context.recent_prompts]
    assert len(request_ids) == len(set(request_ids)) == 2, (
        "UserContext recent_prompts dedup invariant violated: prompts must be "
        "unique by request_id"
    )


def test_user_context_dedupes_active_task_and_slice_ids():
    context = _context(
        active_task_ids=("task:t1", "task:t1", "task:t2"),
        active_slice_ids=("slice:s1", "slice:s1", "slice:s2"),
    )

    assert set(context.active_task_ids) == {"task:t1", "task:t2"}
    assert len(context.active_task_ids) == 2
    assert set(context.active_slice_ids) == {"slice:s1", "slice:s2"}
    assert len(context.active_slice_ids) == 2


@pytest.mark.parametrize(
    "overrides",
    (
        {"active_task_ids": ("t1",)},
        {"active_task_ids": ("task:",)},
        {"active_task_ids": ("task:has spaces",)},
        {"active_slice_ids": ("s1",)},
        {"active_slice_ids": ("slice:",)},
        {"active_slice_ids": ("slice:has spaces",)},
    ),
)
def test_user_context_rejects_invalid_active_task_and_slice_ids(overrides):
    with pytest.raises(ValueError):
        _context(**overrides)


@pytest.mark.parametrize(
    "overrides",
    (
        {"affected_entity_ids": ()},
        {"affected_entity_ids": ("system:auth",), "affected_kinds": ()},
        {"affected_entity_ids": ("system:auth", "module:auth"), "affected_kinds": ("system",)},
        {"context_summary": ""},
        {"timestamp_ms": -1},
        {"blocking": True, "tier": ChangeEventTier.STASHED},
    ),
)
def test_change_event_validation_matrix_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _event(**overrides)


def test_change_event_validation_accepts_blocking_immediate_events():
    event = _event(blocking=True, tier=ChangeEventTier.IMMEDIATE)

    assert event.blocking is True
    assert event.tier is ChangeEventTier.IMMEDIATE


@pytest.mark.parametrize(
    "change_event_id",
    (
        "change:c1",
        "change:User_1.2-abc",
    ),
)
def test_change_event_id_pattern_accepts_contract_values(change_event_id):
    assert CHANGE_EVENT_ID_PATTERN.fullmatch(change_event_id)
    assert _event(id=change_event_id).id == change_event_id


@pytest.mark.parametrize(
    "change_event_id",
    (
        "",
        "c1",
        "change:",
        "change:has spaces",
        "change:has/slash",
    ),
)
def test_change_event_id_pattern_rejects_contract_values(change_event_id):
    assert not CHANGE_EVENT_ID_PATTERN.fullmatch(change_event_id)
    with pytest.raises(ValueError):
        _event(id=change_event_id)
