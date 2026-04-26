import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.pr_delta import EntityKind
from visual_code_editor.model.review_thread import (
    COMMENT_ID_PATTERN,
    REVIEW_THREAD_ID_PATTERN,
    Comment,
    ReviewThread,
    ReviewVerdict,
    ThreadSide,
    ThreadStatus,
    VerdictDecision,
    thread_side_from_string,
    thread_status_from_string,
    verdict_decision_from_string,
)


CONTRACT_THREAD_STATUSES = (
    ("OPEN", "open"),
    ("RESOLVED", "resolved"),
    ("DISMISSED", "dismissed"),
    ("FROZEN", "frozen"),
)

CONTRACT_THREAD_SIDES = (
    ("BASE", "base"),
    ("HEAD", "head"),
)

CONTRACT_VERDICT_DECISIONS = (
    ("APPROVED", "approved"),
    ("CHANGES_REQUESTED", "changes-requested"),
    ("REJECTED", "rejected"),
)


def _comment(**overrides) -> Comment:
    values = {
        "id": "comment:review-thread.1",
        "thread_id": "review:auth-thread.1",
        "actor": ActorKind.YOU_THIS_SESSION,
        "text": "This needs a reviewer decision.",
        "created_at_ms": 1_700_000_000_000,
    }
    values.update(overrides)
    return Comment(**values)


def _thread(**overrides) -> ReviewThread:
    status = overrides.get("status", ThreadStatus.OPEN)
    values = {
        "id": "review:auth-thread.1",
        "delta_set_id": "prdelta:repo.42",
        "anchor_kind": EntityKind.BEHAVIOR,
        "anchor_id": "behavior:auth.validate-token",
        "anchor_side": ThreadSide.HEAD,
        "status": status,
        "comments": (_comment(),),
        "created_at_ms": 1_700_000_000_000,
        "resolved_at_ms": None,
        "resolved_by": None,
    }
    values.update(overrides)
    return ReviewThread(**values)


def _verdict(**overrides) -> ReviewVerdict:
    values = {
        "delta_set_id": "prdelta:repo.42",
        "decision": VerdictDecision.APPROVED,
        "decided_by": ActorKind.YOU_THIS_SESSION,
        "decided_at_ms": 1_700_000_000_000,
        "rationale": "The reviewed delta is acceptable.",
    }
    values.update(overrides)
    return ReviewVerdict(**values)


@pytest.mark.parametrize(("member_name", "status_value"), CONTRACT_THREAD_STATUSES)
def test_thread_status_enum_contains_each_contract_member(member_name, status_value):
    assert hasattr(ThreadStatus, member_name), (
        f"Enum membership invariant violated: ThreadStatus is missing {member_name}"
    )
    assert getattr(ThreadStatus, member_name).value == status_value, (
        "String stability invariant violated: "
        f"ThreadStatus.{member_name}.value must be {status_value!r}"
    )
    assert thread_status_from_string(status_value) is getattr(ThreadStatus, member_name)


def test_thread_status_enum_contains_exactly_the_contract_members():
    assert tuple(status.value for status in ThreadStatus) == tuple(
        value for _, value in CONTRACT_THREAD_STATUSES
    )


@pytest.mark.parametrize(("member_name", "side_value"), CONTRACT_THREAD_SIDES)
def test_thread_side_enum_contains_each_contract_member(member_name, side_value):
    assert hasattr(ThreadSide, member_name), (
        f"Enum membership invariant violated: ThreadSide is missing {member_name}"
    )
    assert getattr(ThreadSide, member_name).value == side_value, (
        "String stability invariant violated: "
        f"ThreadSide.{member_name}.value must be {side_value!r}"
    )
    assert thread_side_from_string(side_value) is getattr(ThreadSide, member_name)


def test_thread_side_enum_contains_exactly_the_contract_members():
    assert tuple(side.value for side in ThreadSide) == tuple(
        value for _, value in CONTRACT_THREAD_SIDES
    )


@pytest.mark.parametrize(("member_name", "decision_value"), CONTRACT_VERDICT_DECISIONS)
def test_verdict_decision_enum_contains_each_contract_member(
    member_name,
    decision_value,
):
    assert hasattr(VerdictDecision, member_name), (
        f"Enum membership invariant violated: VerdictDecision is missing {member_name}"
    )
    assert getattr(VerdictDecision, member_name).value == decision_value, (
        "String stability invariant violated: "
        f"VerdictDecision.{member_name}.value must be {decision_value!r}"
    )
    assert verdict_decision_from_string(decision_value) is getattr(
        VerdictDecision,
        member_name,
    )


def test_verdict_decision_enum_contains_exactly_the_contract_members():
    assert tuple(decision.value for decision in VerdictDecision) == tuple(
        value for _, value in CONTRACT_VERDICT_DECISIONS
    )


@pytest.mark.parametrize(
    "invalid_value",
    ("", "OPEN", "resolved ", "changes-requested", "unknown"),
)
def test_thread_status_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        thread_status_from_string(invalid_value)


@pytest.mark.parametrize(
    "thread_id",
    ("review:auth-thread.1", "review:owner.repo_42", "review:a-b_c.123"),
)
def test_review_thread_id_pattern_accepts_contract_values(thread_id):
    assert REVIEW_THREAD_ID_PATTERN.fullmatch(thread_id)
    assert _thread(id=thread_id, comments=(_comment(thread_id=thread_id),)).id == thread_id


@pytest.mark.parametrize(
    "thread_id",
    ("", "thread:auth", "review:", "review:has spaces", "review:has/slash"),
)
def test_review_thread_id_pattern_rejects_contract_values(thread_id):
    assert not REVIEW_THREAD_ID_PATTERN.fullmatch(thread_id)
    with pytest.raises(ValueError):
        _thread(id=thread_id)


@pytest.mark.parametrize(
    "comment_id",
    ("comment:auth-thread.1", "comment:owner.repo_42", "comment:a-b_c.123"),
)
def test_comment_id_pattern_accepts_contract_values(comment_id):
    assert COMMENT_ID_PATTERN.fullmatch(comment_id)
    assert _comment(id=comment_id).id == comment_id


@pytest.mark.parametrize(
    "comment_id",
    ("", "reply:auth", "comment:", "comment:has spaces", "comment:has/slash"),
)
def test_comment_id_pattern_rejects_contract_values(comment_id):
    assert not COMMENT_ID_PATTERN.fullmatch(comment_id)
    with pytest.raises(ValueError):
        _comment(id=comment_id)


def test_review_thread_rejects_empty_comments():
    with pytest.raises(ValueError):
        _thread(comments=())


@pytest.mark.parametrize("text", ("", "   ", "\n\t"))
def test_comment_rejects_empty_text(text):
    with pytest.raises(ValueError):
        _comment(text=text)


@pytest.mark.parametrize("status", (ThreadStatus.RESOLVED, ThreadStatus.DISMISSED))
def test_terminal_status_requires_resolution_metadata(status):
    with pytest.raises(ValueError):
        _thread(status=status, resolved_at_ms=None, resolved_by=ActorKind.YOU_THIS_SESSION)

    with pytest.raises(ValueError):
        _thread(status=status, resolved_at_ms=1_700_000_000_100, resolved_by=None)

    thread = _thread(
        status=status,
        resolved_at_ms=1_700_000_000_100,
        resolved_by=ActorKind.YOU_THIS_SESSION,
    )

    assert thread.resolved_at_ms == 1_700_000_000_100
    assert thread.resolved_by is ActorKind.YOU_THIS_SESSION


@pytest.mark.parametrize("status", (ThreadStatus.OPEN, ThreadStatus.FROZEN))
def test_non_terminal_status_rejects_resolution_metadata(status):
    with pytest.raises(ValueError):
        _thread(status=status, resolved_at_ms=1_700_000_000_100)

    with pytest.raises(ValueError):
        _thread(status=status, resolved_by=ActorKind.YOU_THIS_SESSION)

    thread = _thread(status=status, resolved_at_ms=None, resolved_by=None)
    assert thread.resolved_at_ms is None
    assert thread.resolved_by is None


@pytest.mark.parametrize("anchor_id", ("", "   ", "\n\t"))
def test_review_thread_rejects_empty_anchor_id(anchor_id):
    with pytest.raises(ValueError):
        _thread(anchor_id=anchor_id)


@pytest.mark.parametrize("rationale", ("", "   ", "\n\t"))
def test_review_verdict_rejects_empty_rationale(rationale):
    with pytest.raises(ValueError):
        _verdict(rationale=rationale)
