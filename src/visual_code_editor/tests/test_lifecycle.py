import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.lifecycle import (
    DEFAULT_CONFIG,
    ArtifactSnapshot,
    LifecycleReason,
    evaluate,
)
from visual_code_editor.model.slice import SliceLifecycleState


NOW_MS = 1_700_000_000_000


def _snapshot(**overrides) -> ArtifactSnapshot:
    values = {
        "artifact_id": "slice:auth-search",
        "current_state": SliceLifecycleState.ACTIVE,
        "created_at_ms": NOW_MS - 60_000,
        "ttl_ms": NOW_MS + 600_000,
        "tombstoned_at_ms": None,
    }
    values.update(overrides)
    return ArtifactSnapshot(**values)


def test_dismissed_is_terminal():
    decision = evaluate(
        _snapshot(
            current_state=SliceLifecycleState.DISMISSED,
            ttl_ms=NOW_MS - 1,
        ),
        NOW_MS,
        DEFAULT_CONFIG,
    )

    assert decision.next_state is SliceLifecycleState.DISMISSED
    assert decision.changed is False
    assert decision.reason is LifecycleReason.DISMISSED_TERMINAL


def test_pinned_is_preserved():
    decision = evaluate(
        _snapshot(
            current_state=SliceLifecycleState.PINNED,
            ttl_ms=None,
        ),
        NOW_MS,
        DEFAULT_CONFIG,
    )

    assert decision.next_state is SliceLifecycleState.PINNED
    assert decision.changed is False
    assert decision.reason is LifecycleReason.STILL_PINNED


def test_old_tombstone_is_reported_as_purgeable():
    decision = evaluate(
        _snapshot(
            current_state=SliceLifecycleState.TOMBSTONED,
            tombstoned_at_ms=NOW_MS - DEFAULT_CONFIG.tombstone_retention_ms,
        ),
        NOW_MS,
        DEFAULT_CONFIG,
    )

    assert decision.next_state is SliceLifecycleState.TOMBSTONED
    assert decision.changed is False
    assert decision.reason is LifecycleReason.TOMBSTONE_PURGEABLE


def test_tombstone_within_retention_stays_tombstoned():
    decision = evaluate(
        _snapshot(
            current_state=SliceLifecycleState.TOMBSTONED,
            tombstoned_at_ms=NOW_MS - DEFAULT_CONFIG.tombstone_retention_ms + 1,
        ),
        NOW_MS,
        DEFAULT_CONFIG,
    )

    assert decision.next_state is SliceLifecycleState.TOMBSTONED
    assert decision.changed is False


def test_ttl_fully_elapsed_transitions_to_tombstoned():
    config = replace(DEFAULT_CONFIG, tombstone_grace_ms=250)

    decision = evaluate(
        _snapshot(ttl_ms=NOW_MS - config.tombstone_grace_ms),
        NOW_MS,
        config,
    )

    assert decision.next_state is SliceLifecycleState.TOMBSTONED
    assert decision.changed is True
    assert decision.reason is LifecycleReason.ENTERED_TOMBSTONED


def test_within_expiring_warning_window_transitions_to_expiring():
    decision = evaluate(
        _snapshot(ttl_ms=NOW_MS + 60_000),
        NOW_MS,
        DEFAULT_CONFIG,
    )

    assert decision.next_state is SliceLifecycleState.EXPIRING
    assert decision.changed is True
    assert decision.reason is LifecycleReason.ENTERED_EXPIRING


def test_plenty_of_ttl_remaining_returns_active():
    decision = evaluate(
        _snapshot(ttl_ms=NOW_MS + DEFAULT_CONFIG.expiring_warning_ms + 1),
        NOW_MS,
        DEFAULT_CONFIG,
    )

    assert decision.next_state is SliceLifecycleState.ACTIVE
    assert decision.changed is False
    assert decision.reason is LifecycleReason.STILL_ACTIVE


def test_recovered_with_ttl_remaining_stays_recovered():
    decision = evaluate(
        _snapshot(
            current_state=SliceLifecycleState.RECOVERED,
            ttl_ms=NOW_MS + DEFAULT_CONFIG.expiring_warning_ms + 1,
        ),
        NOW_MS,
        DEFAULT_CONFIG,
    )

    assert decision.next_state is SliceLifecycleState.RECOVERED
    assert decision.changed is False
    assert decision.reason is LifecycleReason.STILL_RECOVERED


def test_ttl_boundary_at_now_transitions_to_tombstoned():
    decision = evaluate(_snapshot(ttl_ms=NOW_MS), NOW_MS, DEFAULT_CONFIG)

    assert decision.next_state is SliceLifecycleState.TOMBSTONED
    assert decision.changed is True
    assert decision.reason is LifecycleReason.ENTERED_TOMBSTONED


def test_expiring_warning_boundary_transitions_to_expiring():
    decision = evaluate(
        _snapshot(ttl_ms=NOW_MS + DEFAULT_CONFIG.expiring_warning_ms),
        NOW_MS,
        DEFAULT_CONFIG,
    )

    assert decision.next_state is SliceLifecycleState.EXPIRING
    assert decision.changed is True
    assert decision.reason is LifecycleReason.ENTERED_EXPIRING
