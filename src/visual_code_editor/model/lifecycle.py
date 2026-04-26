"""Pure artifact lifecycle evaluator."""

from dataclasses import dataclass
from enum import Enum

from visual_code_editor.model.slice import SliceLifecycleState


class LifecycleReason(str, Enum):
    STILL_ACTIVE = "still-active"
    ENTERED_EXPIRING = "entered-expiring"
    ENTERED_TOMBSTONED = "entered-tombstoned"
    TOMBSTONE_PURGEABLE = "tombstone-purgeable"
    STILL_PINNED = "still-pinned"
    STILL_RECOVERED = "still-recovered"
    DISMISSED_TERMINAL = "dismissed-terminal"


def _require_int(value: int, field_name: str) -> None:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer")


@dataclass(frozen=True)
class LifecycleConfig:
    expiring_warning_ms: int = 300_000
    tombstone_grace_ms: int = 0
    tombstone_retention_ms: int = 86_400_000

    def __post_init__(self) -> None:
        _require_int(self.expiring_warning_ms, "expiring_warning_ms")
        _require_int(self.tombstone_grace_ms, "tombstone_grace_ms")
        _require_int(self.tombstone_retention_ms, "tombstone_retention_ms")

        if self.expiring_warning_ms < 0:
            raise ValueError("expiring_warning_ms must be >= 0")
        if self.tombstone_grace_ms < 0:
            raise ValueError("tombstone_grace_ms must be >= 0")
        if self.tombstone_retention_ms < 0:
            raise ValueError("tombstone_retention_ms must be >= 0")


@dataclass(frozen=True)
class ArtifactSnapshot:
    artifact_id: str
    current_state: SliceLifecycleState
    created_at_ms: int
    ttl_ms: int | None
    tombstoned_at_ms: int | None

    def __post_init__(self) -> None:
        if not isinstance(self.artifact_id, str) or not self.artifact_id:
            raise ValueError("artifact_id must be a non-empty string")
        if not isinstance(self.current_state, SliceLifecycleState):
            raise ValueError("current_state must be a SliceLifecycleState")

        _require_int(self.created_at_ms, "created_at_ms")
        if self.created_at_ms < 0:
            raise ValueError("created_at_ms must be >= 0")

        if self.ttl_ms is not None:
            _require_int(self.ttl_ms, "ttl_ms")
        if self.tombstoned_at_ms is not None:
            _require_int(self.tombstoned_at_ms, "tombstoned_at_ms")

        if self.current_state is SliceLifecycleState.PINNED:
            if self.ttl_ms is not None:
                raise ValueError("PINNED snapshots require ttl_ms None")
        elif self.ttl_ms is None:
            raise ValueError("non-PINNED snapshots require ttl_ms")

        if (
            self.current_state is SliceLifecycleState.TOMBSTONED
            and self.tombstoned_at_ms is None
        ):
            raise ValueError("TOMBSTONED snapshots require tombstoned_at_ms")

        if self.current_state in (
            SliceLifecycleState.ACTIVE,
            SliceLifecycleState.EXPIRING,
            SliceLifecycleState.RECOVERED,
        ) and self.ttl_ms is None:
            raise ValueError(
                "ACTIVE, EXPIRING, and RECOVERED snapshots require ttl_ms"
            )


@dataclass(frozen=True)
class LifecycleDecision:
    next_state: SliceLifecycleState
    changed: bool
    reason: LifecycleReason

    def __post_init__(self) -> None:
        if not isinstance(self.next_state, SliceLifecycleState):
            raise ValueError("next_state must be a SliceLifecycleState")
        if not isinstance(self.changed, bool):
            raise ValueError("changed must be a bool")
        if not isinstance(self.reason, LifecycleReason):
            raise ValueError("reason must be a LifecycleReason")


DEFAULT_CONFIG: LifecycleConfig = LifecycleConfig()


def evaluate(
    snapshot: ArtifactSnapshot,
    now_ms: int,
    config: LifecycleConfig,
) -> LifecycleDecision:
    _require_int(now_ms, "now_ms")
    if not isinstance(snapshot, ArtifactSnapshot):
        raise ValueError("snapshot must be an ArtifactSnapshot")
    if not isinstance(config, LifecycleConfig):
        raise ValueError("config must be a LifecycleConfig")

    current_state = snapshot.current_state

    if current_state is SliceLifecycleState.DISMISSED:
        return _decision(
            current_state,
            SliceLifecycleState.DISMISSED,
            LifecycleReason.DISMISSED_TERMINAL,
        )

    if current_state is SliceLifecycleState.PINNED:
        return _decision(
            current_state,
            SliceLifecycleState.PINNED,
            LifecycleReason.STILL_PINNED,
        )

    if current_state is SliceLifecycleState.TOMBSTONED:
        if snapshot.tombstoned_at_ms is None:
            raise ValueError("tombstoned_at_ms required for TOMBSTONED")
        if (
            now_ms - snapshot.tombstoned_at_ms
        ) >= config.tombstone_retention_ms:
            return _decision(
                current_state,
                SliceLifecycleState.TOMBSTONED,
                LifecycleReason.TOMBSTONE_PURGEABLE,
            )
        return _decision(
            current_state,
            SliceLifecycleState.TOMBSTONED,
            LifecycleReason.STILL_RECOVERED,
        )

    if snapshot.ttl_ms is None:
        raise ValueError("ttl_ms required for non-PINNED non-TOMBSTONED")

    time_until_ttl = snapshot.ttl_ms - now_ms

    if time_until_ttl <= -config.tombstone_grace_ms:
        return _decision(
            current_state,
            SliceLifecycleState.TOMBSTONED,
            LifecycleReason.ENTERED_TOMBSTONED,
        )

    if time_until_ttl <= config.expiring_warning_ms:
        return _decision(
            current_state,
            SliceLifecycleState.EXPIRING,
            LifecycleReason.ENTERED_EXPIRING,
        )

    if current_state is SliceLifecycleState.RECOVERED:
        return _decision(
            current_state,
            SliceLifecycleState.RECOVERED,
            LifecycleReason.STILL_RECOVERED,
        )

    return _decision(
        current_state,
        SliceLifecycleState.ACTIVE,
        LifecycleReason.STILL_ACTIVE,
    )


def _decision(
    current_state: SliceLifecycleState,
    next_state: SliceLifecycleState,
    reason: LifecycleReason,
) -> LifecycleDecision:
    return LifecycleDecision(
        next_state=next_state,
        changed=next_state is not current_state,
        reason=reason,
    )
