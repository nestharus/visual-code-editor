"""Schema for PR structural delta records."""

from dataclasses import dataclass
from enum import Enum
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


PR_DELTA_ID_PATTERN = re.compile(r"^prdelta:[a-zA-Z0-9._:-]+$")


class DeltaKind(str, Enum):
    ADDED = "added"
    REMOVED = "removed"
    RENAMED = "renamed"
    RESHAPED = "reshaped"
    UNCHANGED = "unchanged"
    SPLIT = "split"
    MERGED = "merged"
    UNMATCHED = "unmatched"


class EntityKind(str, Enum):
    BEHAVIOR = "behavior"
    EDGE = "edge"
    CONTAINER = "container"
    STORE = "store"
    ARTIFACT = "artifact"
    WIDGET = "widget"
    TEST = "test"
    TASK = "task"


def delta_kind_from_string(value: str) -> DeltaKind:
    try:
        return DeltaKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown delta kind: {value}") from exc


def entity_kind_from_string(value: str) -> EntityKind:
    try:
        return EntityKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown entity kind: {value}") from exc


def _validate_actor(actor: ActorKind, field_name: str) -> None:
    if not isinstance(actor, ActorKind):
        raise ValueError(f"{field_name} must be an ActorKind")


def _validate_trust_signal(trust: TrustSignal) -> None:
    if not isinstance(trust, TrustSignal):
        raise ValueError("EntityDelta trust must be a TrustSignal")
    if not isinstance(trust.state, TrustState):
        raise ValueError("EntityDelta trust state must be a TrustState")
    if trust.grounding is not None and not isinstance(trust.grounding, GroundingSource):
        raise ValueError(
            "EntityDelta trust grounding must be a GroundingSource or None"
        )

    has_grounding = trust.grounding is not None
    is_grounded = trust.state == TrustState.GROUNDED
    if is_grounded != has_grounding:
        raise ValueError(
            "TrustSignal grounding must be set iff state is TrustState.GROUNDED"
        )


@dataclass(frozen=True)
class EntityDelta:
    delta_kind: DeltaKind
    entity_kind: EntityKind
    base_id: str | None
    head_id: str | None
    related_ids: tuple[str, ...]
    trust: TrustSignal
    attribution_actor: ActorKind

    def __post_init__(self) -> None:
        if not isinstance(self.delta_kind, DeltaKind):
            raise ValueError("EntityDelta delta_kind must be a DeltaKind")
        if not isinstance(self.entity_kind, EntityKind):
            raise ValueError("EntityDelta entity_kind must be an EntityKind")

        related_ids = tuple(self.related_ids)
        object.__setattr__(self, "related_ids", related_ids)
        for related_id in related_ids:
            if not related_id:
                raise ValueError("EntityDelta related_ids must be non-empty strings")

        _validate_trust_signal(self.trust)
        _validate_actor(self.attribution_actor, "EntityDelta attribution_actor")

        match self.delta_kind:
            case DeltaKind.ADDED:
                self._validate_no_related_ids("ADDED")
                if self.base_id is not None:
                    raise ValueError("ADDED EntityDelta base_id must be None")
                if self.head_id is None:
                    raise ValueError("ADDED EntityDelta head_id must be set")
            case DeltaKind.REMOVED:
                self._validate_no_related_ids("REMOVED")
                if self.base_id is None:
                    raise ValueError("REMOVED EntityDelta base_id must be set")
                if self.head_id is not None:
                    raise ValueError("REMOVED EntityDelta head_id must be None")
            case DeltaKind.RENAMED:
                self._validate_no_related_ids("RENAMED")
                self._validate_both_ids_set("RENAMED")
                if self.base_id == self.head_id:
                    raise ValueError("RENAMED EntityDelta ids must differ")
            case DeltaKind.RESHAPED:
                self._validate_no_related_ids("RESHAPED")
                self._validate_both_ids_set("RESHAPED")
                if self.base_id != self.head_id:
                    raise ValueError("RESHAPED EntityDelta ids must match")
            case DeltaKind.UNCHANGED:
                self._validate_no_related_ids("UNCHANGED")
                self._validate_both_ids_set("UNCHANGED")
                if self.base_id != self.head_id:
                    raise ValueError("UNCHANGED EntityDelta ids must match")
            case DeltaKind.SPLIT:
                self._validate_both_ids_set("SPLIT")
                if not related_ids:
                    raise ValueError("SPLIT EntityDelta related_ids must be non-empty")
            case DeltaKind.MERGED:
                self._validate_both_ids_set("MERGED")
                if not related_ids:
                    raise ValueError("MERGED EntityDelta related_ids must be non-empty")
            case DeltaKind.UNMATCHED:
                self._validate_no_related_ids("UNMATCHED")
                if self.base_id is None and self.head_id is None:
                    raise ValueError(
                        "UNMATCHED EntityDelta must set base_id or head_id"
                    )

    def _validate_both_ids_set(self, label: str) -> None:
        if self.base_id is None or self.head_id is None:
            raise ValueError(f"{label} EntityDelta base_id and head_id must be set")

    def _validate_no_related_ids(self, label: str) -> None:
        if self.related_ids:
            raise ValueError(f"{label} EntityDelta related_ids must be empty")


@dataclass(frozen=True)
class PRDeltaSet:
    id: str
    base_revision: str
    head_revision: str
    base_branch: str
    head_branch: str
    pr_number: int | None
    task_id: str | None
    deltas: tuple[EntityDelta, ...]
    computed_at_ms: int
    attribution_actor: ActorKind

    def __post_init__(self) -> None:
        if not PR_DELTA_ID_PATTERN.fullmatch(self.id):
            raise ValueError("PRDeltaSet id must match ^prdelta:[a-zA-Z0-9._:-]+$")

        if not self.base_revision:
            raise ValueError("PRDeltaSet base_revision must be non-empty")
        if not self.head_revision:
            raise ValueError("PRDeltaSet head_revision must be non-empty")
        if self.base_revision == self.head_revision:
            raise ValueError("PRDeltaSet base_revision and head_revision must differ")

        if not self.base_branch:
            raise ValueError("PRDeltaSet base_branch must be non-empty")
        if not self.head_branch:
            raise ValueError("PRDeltaSet head_branch must be non-empty")

        has_pr_number = self.pr_number is not None
        has_task_id = self.task_id is not None
        if has_pr_number == has_task_id:
            raise ValueError("PRDeltaSet must set exactly one of pr_number/task_id")

        deltas = tuple(self.deltas)
        object.__setattr__(self, "deltas", deltas)
        for delta in deltas:
            if not isinstance(delta, EntityDelta):
                raise ValueError("PRDeltaSet deltas must contain EntityDelta entries")

        if self.computed_at_ms < 0:
            raise ValueError("PRDeltaSet computed_at_ms must be >= 0")

        _validate_actor(self.attribution_actor, "PRDeltaSet attribution_actor")
