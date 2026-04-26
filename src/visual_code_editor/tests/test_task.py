import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.task import (
    TASK_ID_PATTERN,
    Task,
    TaskState,
    TaskStateChange,
    TaskWorktree,
    task_state_from_string,
)


CONTRACT_TASK_STATES = (
    ("PENDING", "pending"),
    ("RUNNING", "running"),
    ("PAUSED", "paused"),
    ("READY_FOR_PR", "ready-for-pr"),
    ("IN_PR", "in-pr"),
    ("MERGED", "merged"),
    ("ABANDONED", "abandoned"),
    ("FAILED", "failed"),
)

CONTRACT_TASK_STATE_VALUES = tuple(value for _, value in CONTRACT_TASK_STATES)


def _worktree(**overrides) -> TaskWorktree:
    values = {
        "path": "/workspace/worktrees/task-t1",
        "branch": "task/t1",
        "base_branch": "main",
        "base_revision": "abc123",
        "head_revision": None,
        "created_at_ms": 1_700_000_000_000,
    }
    values.update(overrides)
    return TaskWorktree(**values)


def _state_change(**overrides) -> TaskStateChange:
    values = {
        "from_state": None,
        "to_state": TaskState.PENDING,
        "actor": ActorKind.AGENTS_DIRECT,
        "reason": "Task dispatched.",
        "timestamp_ms": 1_700_000_000_000,
    }
    values.update(overrides)
    return TaskStateChange(**values)


def _task(**overrides) -> Task:
    state = overrides.get("state", TaskState.PENDING)
    values = {
        "id": "task:t1",
        "label": "Update login behavior",
        "description": "Revise the login flow implementation.",
        "state": state,
        "worktree": _worktree(),
        "origin_actor": ActorKind.YOU_THIS_SESSION,
        "agent_actor": ActorKind.AGENTS_DIRECT,
        "related_behavior_ids": ("behavior:auth.login",),
        "prompt": "Update the login behavior.",
        "request_id": "req-123",
        "state_history": (_state_change(to_state=state),),
        "pr_url": None,
        "created_at_ms": 1_700_000_000_000,
    }
    values.update(overrides)
    return Task(**values)


@pytest.mark.parametrize(("member_name", "state_value"), CONTRACT_TASK_STATES)
def test_task_state_enum_contains_each_contract_member(member_name, state_value):
    assert hasattr(TaskState, member_name), (
        f"Enum membership invariant violated: TaskState is missing {member_name}"
    )
    assert getattr(TaskState, member_name).value == state_value, (
        "String stability invariant violated: "
        f"TaskState.{member_name}.value must be {state_value!r}"
    )


def test_task_state_enum_contains_exactly_the_contract_members():
    assert len(TaskState) == 8, (
        "Enum membership invariant violated: TaskState must expose 8 states"
    )
    assert tuple(state.value for state in TaskState) == CONTRACT_TASK_STATE_VALUES, (
        "Enum membership invariant violated: TaskState must contain exactly the "
        "contract states"
    )


@pytest.mark.parametrize(("member_name", "state_value"), CONTRACT_TASK_STATES)
def test_task_state_from_string_accepts_every_contract_value(
    member_name,
    state_value,
):
    assert task_state_from_string(state_value) is getattr(TaskState, member_name)


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "ready_for_pr",
        "READY_FOR_PR",
        "ready-for-pr ",
        "complete",
        "in_pr",
    ),
)
def test_task_state_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        task_state_from_string(invalid_value)


@pytest.mark.parametrize(
    "overrides",
    (
        {"path": ""},
        {"branch": ""},
        {"base_branch": ""},
        {"base_revision": ""},
        {"created_at_ms": -1},
    ),
)
def test_task_worktree_validation_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _worktree(**overrides)


@pytest.mark.parametrize(
    "overrides",
    (
        {"from_state": TaskState.RUNNING, "to_state": TaskState.RUNNING},
        {"reason": ""},
        {"from_state": None, "to_state": None},
        {"actor": "agents:direct"},
    ),
)
def test_task_state_change_validation_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _state_change(**overrides)


@pytest.mark.parametrize(
    "overrides",
    (
        {"id": ""},
        {"id": "t1"},
        {"id": "task:"},
        {"id": "task:has spaces"},
        {"label": ""},
        {"prompt": ""},
        {"request_id": ""},
        {"state_history": ()},
        {
            "state": TaskState.RUNNING,
            "state_history": (_state_change(to_state=TaskState.PENDING),),
        },
        {
            "state_history": (
                _state_change(
                    from_state=TaskState.RUNNING,
                    to_state=TaskState.PENDING,
                ),
            ),
        },
        {"state": TaskState.READY_FOR_PR, "pr_url": "https://example.com/pr/1"},
        {"related_behavior_ids": ("behavior:auth.login", "behavior:auth.login")},
        {"related_behavior_ids": ("auth.login",)},
        {"related_behavior_ids": ("behavior:",)},
        {"created_at_ms": -1},
    ),
)
def test_task_validation_matrix_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _task(**overrides)


@pytest.mark.parametrize(
    ("state", "pr_url"),
    (
        (TaskState.IN_PR, "https://github.com/example/repo/pull/1"),
        (TaskState.MERGED, "https://github.com/example/repo/pull/1"),
    ),
)
def test_task_validation_accepts_pr_urls_for_pr_states(state, pr_url):
    task = _task(
        state=state,
        state_history=(_state_change(to_state=state),),
        pr_url=pr_url,
    )

    assert task.state is state
    assert task.pr_url == pr_url


@pytest.mark.parametrize(
    "task_id",
    (
        "task:t1",
        "task:my-task.123_alpha",
    ),
)
def test_task_id_pattern_accepts_contract_values(task_id):
    assert TASK_ID_PATTERN.fullmatch(task_id)
    assert _task(id=task_id).id == task_id


@pytest.mark.parametrize(
    "task_id",
    (
        "t1",
        "task:",
        "task:has spaces",
    ),
)
def test_task_id_pattern_rejects_contract_values(task_id):
    assert not TASK_ID_PATTERN.fullmatch(task_id)
    with pytest.raises(ValueError):
        _task(id=task_id)
