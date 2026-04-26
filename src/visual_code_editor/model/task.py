"""Task schema for long-running agent work units."""

from dataclasses import dataclass
from enum import Enum
from typing import Iterable
import os
import re

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.behavior import BEHAVIOR_ID_PATTERN


TASK_ID_PATTERN = re.compile(r"^task:[a-zA-Z0-9._-]+$")


class TaskState(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    READY_FOR_PR = "ready-for-pr"
    IN_PR = "in-pr"
    MERGED = "merged"
    ABANDONED = "abandoned"
    FAILED = "failed"


def task_state_from_string(value: str) -> TaskState:
    try:
        return TaskState(value)
    except ValueError as exc:
        raise ValueError(f"Unknown task state: {value}") from exc


def _validate_actor(actor: ActorKind, field_name: str) -> None:
    if not isinstance(actor, ActorKind):
        raise ValueError(f"{field_name} must be an ActorKind")


def _validate_task_state(state: TaskState | None, field_name: str) -> None:
    if state is not None and not isinstance(state, TaskState):
        raise ValueError(f"{field_name} must be a TaskState or None")


@dataclass(frozen=True)
class TaskWorktree:
    path: str
    branch: str
    base_branch: str
    base_revision: str
    head_revision: str | None
    created_at_ms: int

    def __post_init__(self) -> None:
        if not self.path:
            raise ValueError("TaskWorktree path must be non-empty")
        if not os.path.isabs(self.path):
            raise ValueError("TaskWorktree path must be absolute")

        if not self.branch:
            raise ValueError("TaskWorktree branch must be non-empty")
        if not self.base_branch:
            raise ValueError("TaskWorktree base_branch must be non-empty")
        if not self.base_revision:
            raise ValueError("TaskWorktree base_revision must be non-empty")
        if self.head_revision is not None and not self.head_revision:
            raise ValueError("TaskWorktree head_revision must be non-empty or None")
        if self.created_at_ms < 0:
            raise ValueError("TaskWorktree created_at_ms must be >= 0")


@dataclass(frozen=True)
class TaskStateChange:
    from_state: TaskState | None
    to_state: TaskState
    actor: ActorKind
    reason: str
    timestamp_ms: int

    def __post_init__(self) -> None:
        _validate_task_state(self.from_state, "TaskStateChange from_state")
        if not isinstance(self.to_state, TaskState):
            raise ValueError("TaskStateChange to_state must be a TaskState")
        if self.from_state is None and self.to_state is None:
            raise ValueError("TaskStateChange to_state must be set")
        if self.from_state == self.to_state:
            raise ValueError("TaskStateChange cannot record a same-state change")

        _validate_actor(self.actor, "TaskStateChange actor")
        if not self.reason:
            raise ValueError("TaskStateChange reason must be non-empty")
        if self.timestamp_ms < 0:
            raise ValueError("TaskStateChange timestamp_ms must be >= 0")


@dataclass(frozen=True)
class Task:
    id: str
    label: str
    description: str | None
    state: TaskState
    worktree: TaskWorktree
    origin_actor: ActorKind
    agent_actor: ActorKind
    related_behavior_ids: tuple[str, ...]
    prompt: str
    request_id: str
    state_history: tuple[TaskStateChange, ...]
    pr_url: str | None
    created_at_ms: int

    def __post_init__(self) -> None:
        if not TASK_ID_PATTERN.fullmatch(self.id):
            raise ValueError("Task id must match ^task:[a-zA-Z0-9._-]+$")
        if not self.label:
            raise ValueError("Task label must be non-empty")
        if not isinstance(self.state, TaskState):
            raise ValueError("Task state must be a TaskState")
        if not isinstance(self.worktree, TaskWorktree):
            raise ValueError("Task worktree must be a TaskWorktree")

        _validate_actor(self.origin_actor, "Task origin_actor")
        _validate_actor(self.agent_actor, "Task agent_actor")

        related_behavior_ids = tuple(self.related_behavior_ids)
        object.__setattr__(self, "related_behavior_ids", related_behavior_ids)
        if len(set(related_behavior_ids)) != len(related_behavior_ids):
            raise ValueError("Task related_behavior_ids must be unique")
        for behavior_id in related_behavior_ids:
            if not BEHAVIOR_ID_PATTERN.fullmatch(behavior_id):
                raise ValueError(
                    "Task related_behavior_ids must match ^behavior:[a-zA-Z0-9._-]+$"
                )

        if not self.prompt:
            raise ValueError("Task prompt must be non-empty")
        if not self.request_id:
            raise ValueError("Task request_id must be non-empty")

        state_history = tuple(self.state_history)
        object.__setattr__(self, "state_history", state_history)
        if not state_history:
            raise ValueError("Task state_history must be non-empty")
        for state_change in state_history:
            if not isinstance(state_change, TaskStateChange):
                raise ValueError(
                    "Task state_history must contain TaskStateChange entries"
                )
        if state_history[-1].to_state != self.state:
            raise ValueError("Task state must match the last state_history to_state")
        if state_history[0].from_state is not None:
            raise ValueError("Task initial state_history entry must have no from_state")

        if self.pr_url is not None and self.state not in (
            TaskState.IN_PR,
            TaskState.MERGED,
        ):
            raise ValueError("Task pr_url is only allowed for in-pr or merged tasks")
        if self.created_at_ms < 0:
            raise ValueError("Task created_at_ms must be >= 0")


def make_task(
    *,
    id: str,
    label: str,
    description: str | None,
    state: TaskState,
    worktree: TaskWorktree,
    origin_actor: ActorKind,
    agent_actor: ActorKind,
    related_behavior_ids: Iterable[str],
    prompt: str,
    request_id: str,
    state_history: Iterable[TaskStateChange],
    pr_url: str | None,
    created_at_ms: int,
) -> Task:
    return Task(
        id=id,
        label=label,
        description=description,
        state=state,
        worktree=worktree,
        origin_actor=origin_actor,
        agent_actor=agent_actor,
        related_behavior_ids=tuple(related_behavior_ids),
        prompt=prompt,
        request_id=request_id,
        state_history=tuple(state_history),
        pr_url=pr_url,
        created_at_ms=created_at_ms,
    )
