"""Schema for workspace-native PR review threads."""

from dataclasses import dataclass
from enum import Enum
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.pr_delta import EntityKind


REVIEW_THREAD_ID_PATTERN = re.compile(r"^review:[a-zA-Z0-9._-]+$")
COMMENT_ID_PATTERN = re.compile(r"^comment:[a-zA-Z0-9._-]+$")


class ThreadStatus(str, Enum):
    OPEN = "open"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"
    FROZEN = "frozen"


class ThreadSide(str, Enum):
    BASE = "base"
    HEAD = "head"


class VerdictDecision(str, Enum):
    APPROVED = "approved"
    CHANGES_REQUESTED = "changes-requested"
    REJECTED = "rejected"


def thread_status_from_string(value: str) -> ThreadStatus:
    try:
        return ThreadStatus(value)
    except ValueError as exc:
        raise ValueError(f"Unknown thread status: {value}") from exc


def thread_side_from_string(value: str) -> ThreadSide:
    try:
        return ThreadSide(value)
    except ValueError as exc:
        raise ValueError(f"Unknown thread side: {value}") from exc


def verdict_decision_from_string(value: str) -> VerdictDecision:
    try:
        return VerdictDecision(value)
    except ValueError as exc:
        raise ValueError(f"Unknown verdict decision: {value}") from exc


def _validate_actor(actor: ActorKind, field_name: str) -> None:
    if not isinstance(actor, ActorKind):
        raise ValueError(f"{field_name} must be an ActorKind")


@dataclass(frozen=True)
class Comment:
    id: str
    thread_id: str
    actor: ActorKind
    text: str
    created_at_ms: int

    def __post_init__(self) -> None:
        if not COMMENT_ID_PATTERN.fullmatch(self.id):
            raise ValueError("Comment id must match ^comment:[a-zA-Z0-9._-]+$")
        if not REVIEW_THREAD_ID_PATTERN.fullmatch(self.thread_id):
            raise ValueError("Comment thread_id must match ^review:[a-zA-Z0-9._-]+$")
        _validate_actor(self.actor, "Comment actor")
        if not self.text.strip():
            raise ValueError("Comment text must be non-empty")
        if self.created_at_ms < 0:
            raise ValueError("Comment created_at_ms must be >= 0")


@dataclass(frozen=True)
class ReviewThread:
    id: str
    delta_set_id: str
    anchor_kind: EntityKind
    anchor_id: str
    anchor_side: ThreadSide
    status: ThreadStatus
    comments: tuple[Comment, ...]
    created_at_ms: int
    resolved_at_ms: int | None
    resolved_by: ActorKind | None

    def __post_init__(self) -> None:
        if not REVIEW_THREAD_ID_PATTERN.fullmatch(self.id):
            raise ValueError("ReviewThread id must match ^review:[a-zA-Z0-9._-]+$")
        if not self.delta_set_id:
            raise ValueError("ReviewThread delta_set_id must be non-empty")
        if not isinstance(self.anchor_kind, EntityKind):
            raise ValueError("ReviewThread anchor_kind must be an EntityKind")
        if not self.anchor_id.strip():
            raise ValueError("ReviewThread anchor_id must be non-empty")
        if not isinstance(self.anchor_side, ThreadSide):
            raise ValueError("ReviewThread anchor_side must be a ThreadSide")
        if not isinstance(self.status, ThreadStatus):
            raise ValueError("ReviewThread status must be a ThreadStatus")

        comments = tuple(self.comments)
        object.__setattr__(self, "comments", comments)
        if not comments:
            raise ValueError("ReviewThread comments must be non-empty")
        for comment in comments:
            if not isinstance(comment, Comment):
                raise ValueError("ReviewThread comments must contain Comment entries")

        if self.created_at_ms < 0:
            raise ValueError("ReviewThread created_at_ms must be >= 0")

        terminal = self.status in (ThreadStatus.RESOLVED, ThreadStatus.DISMISSED)
        has_resolution = self.resolved_at_ms is not None or self.resolved_by is not None
        if terminal:
            if self.resolved_at_ms is None or self.resolved_by is None:
                raise ValueError(
                    "Resolved or dismissed ReviewThread requires resolution metadata"
                )
            _validate_actor(self.resolved_by, "ReviewThread resolved_by")
            if self.resolved_at_ms < 0:
                raise ValueError("ReviewThread resolved_at_ms must be >= 0")
        elif has_resolution:
            raise ValueError("Open or frozen ReviewThread must not set resolution metadata")


@dataclass(frozen=True)
class ReviewVerdict:
    delta_set_id: str
    decision: VerdictDecision
    decided_by: ActorKind
    decided_at_ms: int
    rationale: str

    def __post_init__(self) -> None:
        if not self.delta_set_id:
            raise ValueError("ReviewVerdict delta_set_id must be non-empty")
        if not isinstance(self.decision, VerdictDecision):
            raise ValueError("ReviewVerdict decision must be a VerdictDecision")
        _validate_actor(self.decided_by, "ReviewVerdict decided_by")
        if self.decided_at_ms < 0:
            raise ValueError("ReviewVerdict decided_at_ms must be >= 0")
        if not self.rationale.strip():
            raise ValueError("ReviewVerdict rationale must be non-empty")
