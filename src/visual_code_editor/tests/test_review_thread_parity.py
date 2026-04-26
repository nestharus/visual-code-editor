import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.pr_delta import EntityKind
from visual_code_editor.model.review_thread import (
    Comment,
    ReviewThread,
    ReviewVerdict,
    ThreadSide,
    ThreadStatus,
    VerdictDecision,
)


PARITY_SCENARIOS = (
    {
        "name": "open head behavior review thread",
        "thread": {
            "id": "review:auth-thread.1",
            "deltaSetId": "prdelta:repo.42",
            "anchorKind": "behavior",
            "anchorId": "behavior:auth.validate-token",
            "anchorSide": "head",
            "status": "open",
            "comments": (
                {
                    "id": "comment:auth-thread.1",
                    "threadId": "review:auth-thread.1",
                    "actor": "you-this-session",
                    "text": "Please verify the token expiry path.",
                    "createdAtMs": 1_700_000_000_000,
                },
            ),
            "createdAtMs": 1_700_000_000_000,
            "resolvedAtMs": None,
            "resolvedBy": None,
        },
        "verdict": None,
    },
    {
        "name": "resolved base store review thread with verdict",
        "thread": {
            "id": "review:cache-thread.2",
            "deltaSetId": "prdelta:repo.43",
            "anchorKind": "store",
            "anchorId": "store:legacy-cache",
            "anchorSide": "base",
            "status": "resolved",
            "comments": (
                {
                    "id": "comment:cache-thread.1",
                    "threadId": "review:cache-thread.2",
                    "actor": "another-user",
                    "text": "Legacy cache removal needs confirmation.",
                    "createdAtMs": 1_700_000_100_000,
                },
                {
                    "id": "comment:cache-thread.2",
                    "threadId": "review:cache-thread.2",
                    "actor": "you-this-session",
                    "text": "Confirmed by the migration test.",
                    "createdAtMs": 1_700_000_101_000,
                },
            ),
            "createdAtMs": 1_700_000_100_000,
            "resolvedAtMs": 1_700_000_102_000,
            "resolvedBy": "you-this-session",
        },
        "verdict": {
            "deltaSetId": "prdelta:repo.43",
            "decision": "approved",
            "decidedBy": "you-this-session",
            "decidedAtMs": 1_700_000_103_000,
            "rationale": "The removal is covered and the thread is resolved.",
        },
    },
    {
        "name": "frozen task review thread with requested changes verdict",
        "thread": {
            "id": "review:task-thread.3",
            "deltaSetId": "prdelta:task.rename-auth",
            "anchorKind": "task",
            "anchorId": "task:auth-old",
            "anchorSide": "base",
            "status": "frozen",
            "comments": (
                {
                    "id": "comment:task-thread.1",
                    "threadId": "review:task-thread.3",
                    "actor": "agents:direct",
                    "text": "Anchor changed while the task was renamed.",
                    "createdAtMs": 1_700_000_200_000,
                },
            ),
            "createdAtMs": 1_700_000_200_000,
            "resolvedAtMs": None,
            "resolvedBy": None,
        },
        "verdict": {
            "deltaSetId": "prdelta:task.rename-auth",
            "decision": "changes-requested",
            "decidedBy": "another-user",
            "decidedAtMs": 1_700_000_201_000,
            "rationale": "The frozen anchor must be re-anchored before approval.",
        },
    },
)


def _actor(value: str) -> ActorKind:
    return ActorKind(value)


def _comment(value: dict) -> Comment:
    return Comment(
        id=value["id"],
        thread_id=value["threadId"],
        actor=_actor(value["actor"]),
        text=value["text"],
        created_at_ms=value["createdAtMs"],
    )


def _thread(value: dict) -> ReviewThread:
    return ReviewThread(
        id=value["id"],
        delta_set_id=value["deltaSetId"],
        anchor_kind=EntityKind(value["anchorKind"]),
        anchor_id=value["anchorId"],
        anchor_side=ThreadSide(value["anchorSide"]),
        status=ThreadStatus(value["status"]),
        comments=tuple(_comment(comment) for comment in value["comments"]),
        created_at_ms=value["createdAtMs"],
        resolved_at_ms=value["resolvedAtMs"],
        resolved_by=_actor(value["resolvedBy"]) if value["resolvedBy"] is not None else None,
    )


def _verdict(value: dict | None) -> ReviewVerdict | None:
    if value is None:
        return None

    return ReviewVerdict(
        delta_set_id=value["deltaSetId"],
        decision=VerdictDecision(value["decision"]),
        decided_by=_actor(value["decidedBy"]),
        decided_at_ms=value["decidedAtMs"],
        rationale=value["rationale"],
    )


def _serialize_comment(comment: Comment) -> dict:
    return {
        "id": comment.id,
        "threadId": comment.thread_id,
        "actor": comment.actor.value,
        "text": comment.text,
        "createdAtMs": comment.created_at_ms,
    }


def _serialize_thread(thread: ReviewThread) -> dict:
    return {
        "id": thread.id,
        "deltaSetId": thread.delta_set_id,
        "anchorKind": thread.anchor_kind.value,
        "anchorId": thread.anchor_id,
        "anchorSide": thread.anchor_side.value,
        "status": thread.status.value,
        "comments": [_serialize_comment(comment) for comment in thread.comments],
        "createdAtMs": thread.created_at_ms,
        "resolvedAtMs": thread.resolved_at_ms,
        "resolvedBy": thread.resolved_by.value if thread.resolved_by is not None else None,
    }


def _serialize_verdict(verdict: ReviewVerdict | None) -> dict | None:
    if verdict is None:
        return None

    return {
        "deltaSetId": verdict.delta_set_id,
        "decision": verdict.decision.value,
        "decidedBy": verdict.decided_by.value,
        "decidedAtMs": verdict.decided_at_ms,
        "rationale": verdict.rationale,
    }


def test_python_and_typescript_review_thread_records_match_for_representative_inputs():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-review-thread.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_records = json.loads(result.stdout)
    py_records = [
        {
            "name": scenario["name"],
            "thread": _serialize_thread(_thread(scenario["thread"])),
            "verdict": _serialize_verdict(_verdict(scenario["verdict"])),
        }
        for scenario in PARITY_SCENARIOS
    ]

    assert ts_records == py_records, (
        "Cross-language parity invariant violated: Python and TypeScript ReviewThread "
        "constructors must produce equivalent records for representative inputs"
    )
