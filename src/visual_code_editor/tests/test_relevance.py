import sys
from dataclasses import replace
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.relevance import (
    DEFAULT_CONFIG,
    ClassifierReason,
    classify,
)
from visual_code_editor.model.user_context import (
    ChangeEvent,
    ChangeEventKind,
    ChangeEventTier,
    OpenedSurface,
    OpenedSurfaceKind,
    UserContext,
)


NOW_MS = 1_700_000_000_000

ALWAYS_IMMEDIATE_KINDS = (
    ChangeEventKind.ENTITY_RENAMED,
    ChangeEventKind.ENTITY_SPLIT,
    ChangeEventKind.ENTITY_MERGED,
    ChangeEventKind.ENTITY_UNMATCHED,
    ChangeEventKind.REVIEW_THREAD_UPDATE,
    ChangeEventKind.AGENTS_RUNTIME_HEALTH,
)

ALWAYS_STASHED_KINDS = (
    ChangeEventKind.PROVIDER_SYNC,
    ChangeEventKind.CI_RUN_FINISHED,
)


def _context(**overrides) -> UserContext:
    values = {
        "id": "user-context:relevance",
        "opened_surfaces": (),
        "recent_prompts": (),
        "active_task_ids": (),
        "active_slice_ids": (),
        "auto_motion_disabled": False,
        "computed_at_ms": NOW_MS,
    }
    values.update(overrides)
    return UserContext(**values)


def _surface(entity_id: str) -> OpenedSurface:
    return OpenedSurface(
        kind=OpenedSurfaceKind.DIAGRAM,
        entity_id=entity_id,
        opened_at_ms=NOW_MS - 10_000,
        last_focused_at_ms=NOW_MS - 1_000,
        total_dwell_ms=9_000,
    )


def _event(**overrides) -> ChangeEvent:
    values = {
        "id": "change:relevance",
        "kind": ChangeEventKind.ENTITY_ADDED,
        "actor": ActorKind.AGENTS_DIRECT,
        "affected_entity_ids": ("system:auth",),
        "affected_kinds": ("system",),
        "tier": ChangeEventTier.STASHED,
        "blocking": False,
        "timestamp_ms": NOW_MS,
        "context_summary": "Auth system changed.",
        "detail_url": None,
    }
    values.update(overrides)
    return ChangeEvent(**values)


def _score_only_config():
    return replace(
        DEFAULT_CONFIG,
        recency_window_ms=100,
        recency_weight=1.0,
        on_surface_weight=0.0,
        provider_weight=0.0,
        actor_weight=0.0,
        context_match_weight=0.0,
        immediate_threshold=0.55,
        stashed_threshold=0.20,
        provider_tier_weight={},
    )


@pytest.mark.parametrize("kind", ALWAYS_IMMEDIATE_KINDS)
def test_always_immediate_kinds_return_immediate_with_always_reason(kind):
    decision = classify(
        _event(kind=kind, actor=ActorKind.YOU_THIS_SESSION, timestamp_ms=0),
        _context(),
        replace(DEFAULT_CONFIG, immediate_threshold=1.0, stashed_threshold=1.0),
        NOW_MS,
    )

    assert decision.tier is ChangeEventTier.IMMEDIATE
    assert decision.reason is ClassifierReason.ALWAYS_IMMEDIATE


@pytest.mark.parametrize("kind", ALWAYS_STASHED_KINDS)
def test_always_stashed_kinds_return_stashed_with_always_reason(kind):
    decision = classify(
        _event(kind=kind, actor=ActorKind.YOU_OTHER_SESSION, timestamp_ms=NOW_MS),
        _context(opened_surfaces=(_surface("system:auth"),)),
        replace(DEFAULT_CONFIG, immediate_threshold=0.0, stashed_threshold=0.0),
        NOW_MS,
    )

    assert decision.tier is ChangeEventTier.STASHED
    assert decision.reason is ClassifierReason.ALWAYS_STASHED


def test_blocking_non_always_stashed_event_returns_immediate_with_blocking_reason():
    decision = classify(
        _event(
            kind=ChangeEventKind.TASK_STATE_CHANGE,
            blocking=True,
            tier=ChangeEventTier.IMMEDIATE,
            timestamp_ms=0,
        ),
        _context(),
        replace(DEFAULT_CONFIG, immediate_threshold=1.0, stashed_threshold=1.0),
        NOW_MS,
    )

    assert decision.tier is ChangeEventTier.IMMEDIATE
    assert decision.reason is ClassifierReason.BLOCKING


def test_recency_scoring_gives_recent_events_higher_scores_than_old_events():
    recent = classify(_event(timestamp_ms=NOW_MS), _context(), DEFAULT_CONFIG, NOW_MS)
    old = classify(_event(timestamp_ms=0), _context(), DEFAULT_CONFIG, NOW_MS)

    assert recent.reason is ClassifierReason.SCORED
    assert old.reason is ClassifierReason.SCORED
    assert recent.total_score > old.total_score


def test_on_surface_entity_match_boosts_score():
    away = classify(_event(), _context(), DEFAULT_CONFIG, NOW_MS)
    on_surface = classify(
        _event(),
        _context(opened_surfaces=(_surface("system:auth"),)),
        DEFAULT_CONFIG,
        NOW_MS,
    )

    assert on_surface.total_score > away.total_score


def test_you_this_session_scores_lower_than_you_other_session_for_same_context():
    this_session = classify(
        _event(actor=ActorKind.YOU_THIS_SESSION),
        _context(),
        DEFAULT_CONFIG,
        NOW_MS,
    )
    other_session = classify(
        _event(actor=ActorKind.YOU_OTHER_SESSION),
        _context(),
        DEFAULT_CONFIG,
        NOW_MS,
    )

    assert this_session.total_score < other_session.total_score


def test_threshold_transition_at_immediate_threshold():
    config = _score_only_config()

    stashed = classify(_event(timestamp_ms=954), _context(), config, 1_000)
    immediate = classify(_event(timestamp_ms=955), _context(), config, 1_000)

    assert stashed.total_score == pytest.approx(0.54)
    assert stashed.tier is ChangeEventTier.STASHED
    assert immediate.total_score == pytest.approx(0.55)
    assert immediate.tier is ChangeEventTier.IMMEDIATE


def test_score_below_stashed_threshold_is_suppressed():
    decision = classify(
        _event(actor=ActorKind.GENERATOR, timestamp_ms=0),
        _context(),
        DEFAULT_CONFIG,
        NOW_MS,
    )

    assert decision.total_score < DEFAULT_CONFIG.stashed_threshold
    assert decision.tier is ChangeEventTier.SUPPRESSED


def test_classification_is_deterministic_for_identical_inputs():
    event = _event(
        affected_entity_ids=("task:t1",),
        affected_kinds=("task",),
        actor=ActorKind.ANOTHER_USER,
    )
    context = _context(
        active_task_ids=("task:t1",),
        opened_surfaces=(_surface("task:t1"),),
    )

    first = classify(event, context, DEFAULT_CONFIG, NOW_MS)
    second = classify(event, context, DEFAULT_CONFIG, NOW_MS)

    assert first == second
