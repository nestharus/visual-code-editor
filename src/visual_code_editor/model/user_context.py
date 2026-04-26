"""User context and workspace change event schemas."""

from dataclasses import dataclass
from enum import Enum
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.slice import SLICE_ID_PATTERN
from visual_code_editor.model.task import TASK_ID_PATTERN


USER_CONTEXT_ID_PATTERN = re.compile(r"^user-context:[a-zA-Z0-9._-]+$")
CHANGE_EVENT_ID_PATTERN = re.compile(r"^change:[a-zA-Z0-9._-]+$")


class OpenedSurfaceKind(str, Enum):
    DIAGRAM = "diagram"
    PANEL = "panel"
    BEHAVIOUR_CARD = "behaviour-card"
    SLICE = "slice"
    TASK = "task"
    PR_DELTA = "pr-delta"


class ChangeEventKind(str, Enum):
    ENTITY_ADDED = "entity-added"
    ENTITY_REMOVED = "entity-removed"
    ENTITY_RESHAPED = "entity-reshaped"
    ENTITY_RENAMED = "entity-renamed"
    ENTITY_SPLIT = "entity-split"
    ENTITY_MERGED = "entity-merged"
    ENTITY_UNMATCHED = "entity-unmatched"
    PROVIDER_SYNC = "provider-sync"
    TASK_STATE_CHANGE = "task-state-change"
    REVIEW_THREAD_UPDATE = "review-thread-update"
    AGENTS_RUNTIME_HEALTH = "agents-runtime-health"
    CI_RUN_FINISHED = "ci-run-finished"


class ChangeEventTier(str, Enum):
    IMMEDIATE = "immediate"
    STASHED = "stashed"
    SUPPRESSED = "suppressed"


def opened_surface_kind_from_string(value: str) -> OpenedSurfaceKind:
    try:
        return OpenedSurfaceKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown opened surface kind: {value}") from exc


def change_event_kind_from_string(value: str) -> ChangeEventKind:
    try:
        return ChangeEventKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown change event kind: {value}") from exc


def change_event_tier_from_string(value: str) -> ChangeEventTier:
    try:
        return ChangeEventTier(value)
    except ValueError as exc:
        raise ValueError(f"Unknown change event tier: {value}") from exc


@dataclass(frozen=True)
class OpenedSurface:
    kind: OpenedSurfaceKind
    entity_id: str
    opened_at_ms: int
    last_focused_at_ms: int
    total_dwell_ms: int

    def __post_init__(self) -> None:
        if not isinstance(self.kind, OpenedSurfaceKind):
            raise ValueError("OpenedSurface kind must be an OpenedSurfaceKind")
        if not self.entity_id:
            raise ValueError("OpenedSurface entity_id must be non-empty")
        if self.opened_at_ms < 0:
            raise ValueError("OpenedSurface opened_at_ms must be >= 0")
        if self.last_focused_at_ms < self.opened_at_ms:
            raise ValueError(
                "OpenedSurface last_focused_at_ms must be >= opened_at_ms"
            )
        if self.total_dwell_ms < 0:
            raise ValueError("OpenedSurface total_dwell_ms must be >= 0")


@dataclass(frozen=True)
class RecentPromptSummary:
    request_id: str
    mode: str
    surface_anchor: str
    selection_count: int
    issued_at_ms: int


@dataclass(frozen=True)
class UserContext:
    id: str
    opened_surfaces: tuple[OpenedSurface, ...]
    recent_prompts: tuple[RecentPromptSummary, ...]
    active_task_ids: tuple[str, ...]
    active_slice_ids: tuple[str, ...]
    auto_motion_disabled: bool
    computed_at_ms: int

    def __post_init__(self) -> None:
        if not USER_CONTEXT_ID_PATTERN.fullmatch(self.id):
            raise ValueError(
                "UserContext id must match ^user-context:[a-zA-Z0-9._-]+$"
            )

        opened_surfaces = _dedupe_opened_surfaces(self.opened_surfaces)
        object.__setattr__(self, "opened_surfaces", opened_surfaces)

        recent_prompts = _dedupe_recent_prompts(self.recent_prompts)
        object.__setattr__(self, "recent_prompts", recent_prompts)

        active_task_ids = _dedupe_strings(self.active_task_ids)
        object.__setattr__(self, "active_task_ids", active_task_ids)
        for task_id in active_task_ids:
            if not TASK_ID_PATTERN.fullmatch(task_id):
                raise ValueError(
                    "UserContext active_task_ids must match ^task:[a-zA-Z0-9._-]+$"
                )

        active_slice_ids = _dedupe_strings(self.active_slice_ids)
        object.__setattr__(self, "active_slice_ids", active_slice_ids)
        for slice_id in active_slice_ids:
            if not SLICE_ID_PATTERN.fullmatch(slice_id):
                raise ValueError(
                    "UserContext active_slice_ids must match ^slice:[a-zA-Z0-9._-]+$"
                )

        if self.computed_at_ms < 0:
            raise ValueError("UserContext computed_at_ms must be >= 0")


@dataclass(frozen=True)
class ChangeEvent:
    id: str
    kind: ChangeEventKind
    actor: ActorKind
    affected_entity_ids: tuple[str, ...]
    affected_kinds: tuple[str, ...]
    tier: ChangeEventTier
    blocking: bool
    timestamp_ms: int
    context_summary: str
    detail_url: str | None

    def __post_init__(self) -> None:
        if not CHANGE_EVENT_ID_PATTERN.fullmatch(self.id):
            raise ValueError("ChangeEvent id must match ^change:[a-zA-Z0-9._-]+$")
        if not isinstance(self.kind, ChangeEventKind):
            raise ValueError("ChangeEvent kind must be a ChangeEventKind")
        if not isinstance(self.actor, ActorKind):
            raise ValueError("ChangeEvent actor must be an ActorKind")

        affected_entity_ids = tuple(self.affected_entity_ids)
        object.__setattr__(self, "affected_entity_ids", affected_entity_ids)
        if not affected_entity_ids:
            raise ValueError("ChangeEvent affected_entity_ids must be non-empty")

        affected_kinds = tuple(self.affected_kinds)
        object.__setattr__(self, "affected_kinds", affected_kinds)
        if len(affected_entity_ids) != len(affected_kinds):
            raise ValueError(
                "ChangeEvent affected_entity_ids and affected_kinds must have equal length"
            )

        if not isinstance(self.tier, ChangeEventTier):
            raise ValueError("ChangeEvent tier must be a ChangeEventTier")
        if self.blocking and self.tier is not ChangeEventTier.IMMEDIATE:
            raise ValueError("ChangeEvent blocking events must be immediate")
        if self.timestamp_ms < 0:
            raise ValueError("ChangeEvent timestamp_ms must be >= 0")
        if not self.context_summary:
            raise ValueError("ChangeEvent context_summary must be non-empty")


def _dedupe_opened_surfaces(
    opened_surfaces: tuple[OpenedSurface, ...],
) -> tuple[OpenedSurface, ...]:
    by_key: dict[tuple[OpenedSurfaceKind, str], OpenedSurface] = {}
    for surface in opened_surfaces:
        if not isinstance(surface, OpenedSurface):
            raise ValueError("UserContext opened_surfaces must contain OpenedSurface entries")

        key = (surface.kind, surface.entity_id)
        existing = by_key.get(key)
        if existing is None or surface.last_focused_at_ms >= existing.last_focused_at_ms:
            by_key[key] = surface

    return tuple(by_key.values())


def _dedupe_recent_prompts(
    recent_prompts: tuple[RecentPromptSummary, ...],
) -> tuple[RecentPromptSummary, ...]:
    by_request_id: dict[str, RecentPromptSummary] = {}
    for prompt in recent_prompts:
        if not isinstance(prompt, RecentPromptSummary):
            raise ValueError(
                "UserContext recent_prompts must contain RecentPromptSummary entries"
            )

        existing = by_request_id.get(prompt.request_id)
        if existing is None or prompt.issued_at_ms >= existing.issued_at_ms:
            by_request_id[prompt.request_id] = prompt

    return tuple(by_request_id.values())


def _dedupe_strings(values: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))
