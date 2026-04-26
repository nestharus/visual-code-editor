import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.task import (
    TaskState,
    TaskStateChange,
    TaskWorktree,
    make_task,
)


PARITY_SCENARIOS = (
    {
        "name": "pending greenfield task",
        "input": {
            "id": "task:t1",
            "label": "Create onboarding page",
            "description": None,
            "state": "pending",
            "worktree": {
                "path": "/workspace/worktrees/task-t1",
                "branch": "task/t1",
                "baseBranch": "main",
                "baseRevision": "abc123",
                "headRevision": None,
                "createdAtMs": 1_700_000_000_000,
            },
            "originActor": "you-this-session",
            "agentActor": "agents:direct",
            "relatedBehaviorIds": (),
            "prompt": "Create the onboarding page.",
            "requestId": "req-001",
            "stateHistory": (
                {
                    "fromState": None,
                    "toState": "pending",
                    "actor": "you-this-session",
                    "reason": "User dispatched task.",
                    "timestampMs": 1_700_000_000_000,
                },
            ),
            "prUrl": None,
            "createdAtMs": 1_700_000_000_000,
        },
    },
    {
        "name": "running task with related behaviors",
        "input": {
            "id": "task:auth-flow",
            "label": "Update auth flow",
            "description": "Revise validation and audit behavior.",
            "state": "running",
            "worktree": {
                "path": "/workspace/worktrees/task-auth-flow",
                "branch": "task/auth-flow",
                "baseBranch": "main",
                "baseRevision": "abc123",
                "headRevision": "def456",
                "createdAtMs": 1_700_000_100_000,
            },
            "originActor": "you-this-session",
            "agentActor": "agents:direct",
            "relatedBehaviorIds": (
                "behavior:auth.validate-token",
                "behavior:auth.audit-login",
            ),
            "prompt": "Update auth validation and audit logging.",
            "requestId": "req-002",
            "stateHistory": (
                {
                    "fromState": None,
                    "toState": "pending",
                    "actor": "you-this-session",
                    "reason": "User dispatched task.",
                    "timestampMs": 1_700_000_100_000,
                },
                {
                    "fromState": "pending",
                    "toState": "running",
                    "actor": "agents:direct",
                    "reason": "Agent started work.",
                    "timestampMs": 1_700_000_101_000,
                },
            ),
            "prUrl": None,
            "createdAtMs": 1_700_000_100_000,
        },
    },
    {
        "name": "paused task",
        "input": {
            "id": "task:billing-pause",
            "label": "Adjust billing retry",
            "description": None,
            "state": "paused",
            "worktree": {
                "path": "/workspace/worktrees/task-billing-pause",
                "branch": "task/billing-pause",
                "baseBranch": "main",
                "baseRevision": "abc123",
                "headRevision": "def789",
                "createdAtMs": 1_700_000_200_000,
            },
            "originActor": "you-this-session",
            "agentActor": "agents:direct",
            "relatedBehaviorIds": ("behavior:billing.retry",),
            "prompt": "Adjust billing retry handling.",
            "requestId": "req-003",
            "stateHistory": (
                {
                    "fromState": None,
                    "toState": "pending",
                    "actor": "you-this-session",
                    "reason": "User dispatched task.",
                    "timestampMs": 1_700_000_200_000,
                },
                {
                    "fromState": "pending",
                    "toState": "running",
                    "actor": "agents:direct",
                    "reason": "Agent started work.",
                    "timestampMs": 1_700_000_201_000,
                },
                {
                    "fromState": "running",
                    "toState": "paused",
                    "actor": "you-this-session",
                    "reason": "User paused task.",
                    "timestampMs": 1_700_000_202_000,
                },
            ),
            "prUrl": None,
            "createdAtMs": 1_700_000_200_000,
        },
    },
    {
        "name": "ready for pr task",
        "input": {
            "id": "task:checkout-ready",
            "label": "Finish checkout discount",
            "description": "Agent completed checkout discount changes.",
            "state": "ready-for-pr",
            "worktree": {
                "path": "/workspace/worktrees/task-checkout-ready",
                "branch": "task/checkout-ready",
                "baseBranch": "main",
                "baseRevision": "abc123",
                "headRevision": "fed456",
                "createdAtMs": 1_700_000_300_000,
            },
            "originActor": "you-this-session",
            "agentActor": "agents:direct",
            "relatedBehaviorIds": ("behavior:checkout.apply-discount",),
            "prompt": "Finish checkout discount handling.",
            "requestId": "req-004",
            "stateHistory": (
                {
                    "fromState": None,
                    "toState": "pending",
                    "actor": "you-this-session",
                    "reason": "User dispatched task.",
                    "timestampMs": 1_700_000_300_000,
                },
                {
                    "fromState": "pending",
                    "toState": "running",
                    "actor": "agents:direct",
                    "reason": "Agent started work.",
                    "timestampMs": 1_700_000_301_000,
                },
                {
                    "fromState": "running",
                    "toState": "ready-for-pr",
                    "actor": "agents:direct",
                    "reason": "Agent completed work.",
                    "timestampMs": 1_700_000_302_000,
                },
            ),
            "prUrl": None,
            "createdAtMs": 1_700_000_300_000,
        },
    },
    {
        "name": "in pr task",
        "input": {
            "id": "task:docs-pr",
            "label": "Document legacy export",
            "description": None,
            "state": "in-pr",
            "worktree": {
                "path": "/workspace/worktrees/task-docs-pr",
                "branch": "task/docs-pr",
                "baseBranch": "main",
                "baseRevision": "abc123",
                "headRevision": "aaa111",
                "createdAtMs": 1_700_000_400_000,
            },
            "originActor": "you-this-session",
            "agentActor": "agents:direct",
            "relatedBehaviorIds": ("behavior:docs.legacy-export",),
            "prompt": "Document legacy export behavior.",
            "requestId": "req-005",
            "stateHistory": (
                {
                    "fromState": None,
                    "toState": "pending",
                    "actor": "you-this-session",
                    "reason": "User dispatched task.",
                    "timestampMs": 1_700_000_400_000,
                },
                {
                    "fromState": "pending",
                    "toState": "running",
                    "actor": "agents:direct",
                    "reason": "Agent started work.",
                    "timestampMs": 1_700_000_401_000,
                },
                {
                    "fromState": "running",
                    "toState": "ready-for-pr",
                    "actor": "agents:direct",
                    "reason": "Agent completed work.",
                    "timestampMs": 1_700_000_402_000,
                },
                {
                    "fromState": "ready-for-pr",
                    "toState": "in-pr",
                    "actor": "provider:github:sync",
                    "reason": "Pull request opened.",
                    "timestampMs": 1_700_000_403_000,
                },
            ),
            "prUrl": "https://github.com/example/repo/pull/5",
            "createdAtMs": 1_700_000_400_000,
        },
    },
    {
        "name": "merged task",
        "input": {
            "id": "task:fixtures-merged",
            "label": "Refresh billing fixture",
            "description": "Merged billing fixture update.",
            "state": "merged",
            "worktree": {
                "path": "/workspace/worktrees/task-fixtures-merged",
                "branch": "task/fixtures-merged",
                "baseBranch": "main",
                "baseRevision": "abc123",
                "headRevision": "bbb222",
                "createdAtMs": 1_700_000_500_000,
            },
            "originActor": "you-this-session",
            "agentActor": "agents:direct",
            "relatedBehaviorIds": ("behavior:billing.invoice-fixture",),
            "prompt": "Refresh the billing fixture.",
            "requestId": "req-006",
            "stateHistory": (
                {
                    "fromState": None,
                    "toState": "pending",
                    "actor": "you-this-session",
                    "reason": "User dispatched task.",
                    "timestampMs": 1_700_000_500_000,
                },
                {
                    "fromState": "pending",
                    "toState": "running",
                    "actor": "agents:direct",
                    "reason": "Agent started work.",
                    "timestampMs": 1_700_000_501_000,
                },
                {
                    "fromState": "running",
                    "toState": "ready-for-pr",
                    "actor": "agents:direct",
                    "reason": "Agent completed work.",
                    "timestampMs": 1_700_000_502_000,
                },
                {
                    "fromState": "ready-for-pr",
                    "toState": "in-pr",
                    "actor": "provider:github:sync",
                    "reason": "Pull request opened.",
                    "timestampMs": 1_700_000_503_000,
                },
                {
                    "fromState": "in-pr",
                    "toState": "merged",
                    "actor": "provider:github:pr-merge",
                    "reason": "Pull request merged.",
                    "timestampMs": 1_700_000_504_000,
                },
            ),
            "prUrl": "https://github.com/example/repo/pull/6",
            "createdAtMs": 1_700_000_500_000,
        },
    },
    {
        "name": "failed task",
        "input": {
            "id": "task:failed-agent",
            "label": "Investigate flaky export",
            "description": "Agent failed before completion.",
            "state": "failed",
            "worktree": {
                "path": "/workspace/worktrees/task-failed-agent",
                "branch": "task/failed-agent",
                "baseBranch": "main",
                "baseRevision": "abc123",
                "headRevision": None,
                "createdAtMs": 1_700_000_600_000,
            },
            "originActor": "you-this-session",
            "agentActor": "agents:direct",
            "relatedBehaviorIds": ("behavior:export.flaky",),
            "prompt": "Investigate flaky export behavior.",
            "requestId": "req-007",
            "stateHistory": (
                {
                    "fromState": None,
                    "toState": "pending",
                    "actor": "you-this-session",
                    "reason": "User dispatched task.",
                    "timestampMs": 1_700_000_600_000,
                },
                {
                    "fromState": "pending",
                    "toState": "failed",
                    "actor": "agents:direct",
                    "reason": "Agent failed before completion.",
                    "timestampMs": 1_700_000_601_000,
                },
            ),
            "prUrl": None,
            "createdAtMs": 1_700_000_600_000,
        },
    },
)


def _state(value: str | None) -> TaskState | None:
    return TaskState(value) if value is not None else None


def _actor(value: str) -> ActorKind:
    return ActorKind(value)


def _worktree(value: dict) -> TaskWorktree:
    return TaskWorktree(
        path=value["path"],
        branch=value["branch"],
        base_branch=value["baseBranch"],
        base_revision=value["baseRevision"],
        head_revision=value["headRevision"],
        created_at_ms=value["createdAtMs"],
    )


def _state_change(value: dict) -> TaskStateChange:
    return TaskStateChange(
        from_state=_state(value["fromState"]),
        to_state=TaskState(value["toState"]),
        actor=_actor(value["actor"]),
        reason=value["reason"],
        timestamp_ms=value["timestampMs"],
    )


def _task(value: dict):
    return make_task(
        id=value["id"],
        label=value["label"],
        description=value["description"],
        state=TaskState(value["state"]),
        worktree=_worktree(value["worktree"]),
        origin_actor=_actor(value["originActor"]),
        agent_actor=_actor(value["agentActor"]),
        related_behavior_ids=tuple(value["relatedBehaviorIds"]),
        prompt=value["prompt"],
        request_id=value["requestId"],
        state_history=tuple(
            _state_change(state_change) for state_change in value["stateHistory"]
        ),
        pr_url=value["prUrl"],
        created_at_ms=value["createdAtMs"],
    )


def _serialize_state(state: TaskState | None) -> str | None:
    return state.value if state is not None else None


def _serialize_task(task) -> dict:
    return {
        "id": task.id,
        "label": task.label,
        "description": task.description,
        "state": task.state.value,
        "worktree": {
            "path": task.worktree.path,
            "branch": task.worktree.branch,
            "baseBranch": task.worktree.base_branch,
            "baseRevision": task.worktree.base_revision,
            "headRevision": task.worktree.head_revision,
            "createdAtMs": task.worktree.created_at_ms,
        },
        "originActor": task.origin_actor.value,
        "agentActor": task.agent_actor.value,
        "relatedBehaviorIds": list(task.related_behavior_ids),
        "prompt": task.prompt,
        "requestId": task.request_id,
        "stateHistory": [
            {
                "fromState": _serialize_state(state_change.from_state),
                "toState": state_change.to_state.value,
                "actor": state_change.actor.value,
                "reason": state_change.reason,
                "timestampMs": state_change.timestamp_ms,
            }
            for state_change in task.state_history
        ],
        "prUrl": task.pr_url,
        "createdAtMs": task.created_at_ms,
    }


def test_python_and_typescript_task_records_match_for_representative_inputs():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-task.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_records = json.loads(result.stdout)
    py_records = [
        {
            "name": scenario["name"],
            "task": _serialize_task(_task(scenario["input"])),
        }
        for scenario in PARITY_SCENARIOS
    ]

    assert ts_records == py_records, (
        "Cross-language parity invariant violated: Python and TypeScript Task "
        "constructors must produce equivalent records for representative inputs"
    )
