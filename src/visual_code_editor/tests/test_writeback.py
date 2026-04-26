import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.behavior import BehaviorSliceRole
from visual_code_editor.model.writeback import (
    BEHAVIOR_DRAFT_ID_PATTERN,
    BehaviorDraft,
    ChangeIntent,
    ChangeOrigin,
    ConflictKind,
    ConflictState,
    ConflictingFile,
    ProposedSlice,
    WritebackPlan,
    change_intent_from_string,
    conflict_kind_from_string,
)


CONTRACT_CHANGE_INTENTS = (
    ("USER_EDIT", "user-edit"),
    ("AGENT_EDIT", "agent-edit"),
    ("PROMOTE_TO_TEST", "promote-to-test"),
    ("RECONCILE", "reconcile"),
    ("REVERT", "revert"),
)

CONTRACT_CONFLICT_KINDS = (
    ("FILE_DELETED", "file-deleted"),
    ("LINES_CHANGED", "lines-changed"),
    ("FILE_MOVED", "file-moved"),
    ("WHITESPACE_ONLY", "whitespace-only"),
)

CONTRACT_CHANGE_INTENT_VALUES = tuple(value for _, value in CONTRACT_CHANGE_INTENTS)
CONTRACT_CONFLICT_KIND_VALUES = tuple(value for _, value in CONTRACT_CONFLICT_KINDS)


def _origin(**overrides) -> ChangeOrigin:
    values = {
        "actor": ActorKind.YOU_THIS_SESSION,
        "intent": ChangeIntent.USER_EDIT,
        "timestamp_ms": 1_700_000_000_000,
        "request_id": None,
    }
    values.update(overrides)
    return ChangeOrigin(**values)


def _proposed_slice(**overrides) -> ProposedSlice:
    values = {
        "file_path": "app/auth/session.ts",
        "start_line": 10,
        "end_line": 14,
        "new_text": "return validateToken(request);\n",
        "intent_role": BehaviorSliceRole.BODY,
    }
    values.update(overrides)
    return ProposedSlice(**values)


def _draft(**overrides) -> BehaviorDraft:
    values = {
        "id": "draft:behavior:auth.validate-token:1700000000000",
        "behavior_id": "behavior:auth.validate-token",
        "proposed_slices": (_proposed_slice(),),
        "origin": _origin(),
        "parent_revision": "abc123",
        "created_at_ms": 1_700_000_000_000,
    }
    values.update(overrides)
    return BehaviorDraft(**values)


def _plan(**overrides) -> WritebackPlan:
    draft = overrides.pop("draft", _draft())
    values = {
        "draft": draft,
        "effective_diff": (
            "--- a/app/auth/session.ts\n"
            "+++ b/app/auth/session.ts\n"
            "@@ -10,5 +10,1 @@\n"
            "+return validateToken(request);\n"
        ),
        "applies_against_revision": draft.parent_revision,
        "validated_at_ms": draft.created_at_ms,
    }
    values.update(overrides)
    return WritebackPlan(**values)


def _conflicting_file(**overrides) -> ConflictingFile:
    values = {
        "file_path": "app/auth/session.ts",
        "conflict_kind": ConflictKind.LINES_CHANGED,
        "source_unchanged": False,
    }
    values.update(overrides)
    return ConflictingFile(**values)


def _conflict(**overrides) -> ConflictState:
    values = {
        "draft_id": "draft:behavior:auth.validate-token:1700000000000",
        "conflicting_files": (_conflicting_file(),),
        "observed_revision": "def456",
        "expected_revision": "abc123",
    }
    values.update(overrides)
    return ConflictState(**values)


@pytest.mark.parametrize(("member_name", "intent_value"), CONTRACT_CHANGE_INTENTS)
def test_change_intent_enum_contains_each_contract_member(member_name, intent_value):
    assert hasattr(ChangeIntent, member_name), (
        f"Enum membership invariant violated: ChangeIntent is missing {member_name}"
    )
    assert getattr(ChangeIntent, member_name).value == intent_value, (
        "String stability invariant violated: "
        f"ChangeIntent.{member_name}.value must be {intent_value!r}"
    )


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_CONFLICT_KINDS)
def test_conflict_kind_enum_contains_each_contract_member(member_name, kind_value):
    assert hasattr(ConflictKind, member_name), (
        f"Enum membership invariant violated: ConflictKind is missing {member_name}"
    )
    assert getattr(ConflictKind, member_name).value == kind_value, (
        "String stability invariant violated: "
        f"ConflictKind.{member_name}.value must be {kind_value!r}"
    )


def test_change_intent_enum_contains_exactly_the_contract_members():
    assert len(ChangeIntent) == 5, (
        "Enum membership invariant violated: ChangeIntent must expose 5 intents"
    )
    assert tuple(intent.value for intent in ChangeIntent) == CONTRACT_CHANGE_INTENT_VALUES


def test_conflict_kind_enum_contains_exactly_the_contract_members():
    assert len(ConflictKind) == 4, (
        "Enum membership invariant violated: ConflictKind must expose 4 conflict kinds"
    )
    assert tuple(kind.value for kind in ConflictKind) == CONTRACT_CONFLICT_KIND_VALUES


@pytest.mark.parametrize(("member_name", "intent_value"), CONTRACT_CHANGE_INTENTS)
def test_change_intent_from_string_accepts_every_contract_value(
    member_name,
    intent_value,
):
    assert change_intent_from_string(intent_value) is getattr(ChangeIntent, member_name)


@pytest.mark.parametrize(("member_name", "kind_value"), CONTRACT_CONFLICT_KINDS)
def test_conflict_kind_from_string_accepts_every_contract_value(member_name, kind_value):
    assert conflict_kind_from_string(kind_value) is getattr(ConflictKind, member_name)


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "user_edit",
        "USER_EDIT",
        "user-edit ",
        "apply",
        "merge",
    ),
)
def test_change_intent_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        change_intent_from_string(invalid_value)


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "file_deleted",
        "FILE_DELETED",
        "lines-changed ",
        "deleted",
        "content-changed",
    ),
)
def test_conflict_kind_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError):
        conflict_kind_from_string(invalid_value)


@pytest.mark.parametrize(
    "overrides",
    (
        {"actor": "you-this-session"},
        {"intent": "user-edit"},
        {"timestamp_ms": -1},
    ),
)
def test_change_origin_validation_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _origin(**overrides)


@pytest.mark.parametrize(
    "overrides",
    (
        {"id": ""},
        {"id": "behavior:auth.validate-token:1700000000000"},
        {"id": "draft:"},
        {"id": "draft:has spaces"},
        {"id": "draft:has/slash"},
        {"behavior_id": ""},
        {"behavior_id": "auth.validate-token"},
        {"behavior_id": "behavior:"},
        {"behavior_id": "behavior:has spaces"},
        {"behavior_id": "behavior:has/slash"},
        {"proposed_slices": ()},
        {"parent_revision": ""},
        {"created_at_ms": -1},
    ),
)
def test_behavior_draft_validation_matrix_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _draft(**overrides)


@pytest.mark.parametrize(
    "line_values",
    (
        {"start_line": 0, "end_line": 1},
        {"start_line": 8, "end_line": 7},
    ),
)
def test_behavior_draft_revalidates_proposed_slice_line_ranges(line_values):
    invalid_slice = object.__new__(ProposedSlice)
    object.__setattr__(invalid_slice, "file_path", "app/auth/session.ts")
    object.__setattr__(invalid_slice, "start_line", line_values["start_line"])
    object.__setattr__(invalid_slice, "end_line", line_values["end_line"])
    object.__setattr__(invalid_slice, "new_text", "return validateToken(request);\n")
    object.__setattr__(invalid_slice, "intent_role", BehaviorSliceRole.BODY)

    with pytest.raises(ValueError):
        _draft(proposed_slices=(invalid_slice,))


@pytest.mark.parametrize(
    "draft_id",
    (
        "draft:behavior:auth.validate-token:1700000000000",
        "draft:Foo_Bar",
        "draft:a",
        "draft:agent:edit:request-123",
    ),
)
def test_behavior_draft_id_pattern_accepts_contract_values(draft_id):
    assert BEHAVIOR_DRAFT_ID_PATTERN.fullmatch(draft_id)
    assert _draft(id=draft_id).id == draft_id


@pytest.mark.parametrize(
    "draft_id",
    (
        "",
        "behavior:auth.validate-token",
        "draft:",
        "draft:has spaces",
        "draft:has/slash",
    ),
)
def test_behavior_draft_id_pattern_rejects_contract_values(draft_id):
    assert not BEHAVIOR_DRAFT_ID_PATTERN.fullmatch(draft_id)
    with pytest.raises(ValueError):
        _draft(id=draft_id)


@pytest.mark.parametrize(
    "overrides",
    (
        {"start_line": 0},
        {"start_line": -1},
        {"start_line": 8, "end_line": 7},
    ),
)
def test_proposed_slice_validation_rejects_invalid_line_ranges(overrides):
    with pytest.raises(ValueError):
        _proposed_slice(**overrides)


@pytest.mark.parametrize(
    "overrides",
    (
        {"start_line": 1, "end_line": 1},
        {"start_line": 4, "end_line": 9},
    ),
)
def test_proposed_slice_validation_accepts_valid_line_ranges(overrides):
    proposed_slice = _proposed_slice(**overrides)

    assert proposed_slice.start_line == overrides["start_line"]
    assert proposed_slice.end_line == overrides["end_line"]


@pytest.mark.parametrize(
    "overrides",
    (
        {"applies_against_revision": "def456"},
        {"effective_diff": ""},
        {"validated_at_ms": 1_699_999_999_999},
    ),
)
def test_writeback_plan_validation_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _plan(**overrides)


def test_writeback_plan_validation_accepts_matching_revision_and_later_validation():
    draft = _draft(parent_revision="revision-1", created_at_ms=10)

    plan = _plan(draft=draft, applies_against_revision="revision-1", validated_at_ms=11)

    assert plan.draft is draft
    assert plan.applies_against_revision == "revision-1"
    assert plan.validated_at_ms == 11


@pytest.mark.parametrize(
    "overrides",
    (
        {"conflicting_files": ()},
        {"observed_revision": "abc123", "expected_revision": "abc123"},
    ),
)
def test_conflict_state_validation_rejects_invalid_values(overrides):
    with pytest.raises(ValueError):
        _conflict(**overrides)


def test_conflict_state_validation_accepts_non_empty_conflicts_and_revision_divergence():
    conflict = _conflict(observed_revision="observed", expected_revision="expected")

    assert conflict.conflicting_files == (_conflicting_file(),)
    assert conflict.observed_revision != conflict.expected_revision
