import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.behavior import BehaviorSliceRole
from visual_code_editor.model.writeback import (
    BehaviorDraft,
    ChangeIntent,
    ChangeOrigin,
    ConflictKind,
    ConflictState,
    ConflictingFile,
    ProposedSlice,
    WritebackPlan,
)


PARITY_SCENARIOS = (
    {
        "name": "user edit draft",
        "input": {
            "draft": {
                "id": "draft:behavior:auth.validate-token:1700000000000",
                "behaviorId": "behavior:auth.validate-token",
                "proposedSlices": (
                    {
                        "filePath": "app/auth/session.ts",
                        "startLine": 10,
                        "endLine": 14,
                        "newText": "return validateToken(request);\n",
                        "intentRole": "body",
                    },
                ),
                "origin": {
                    "actor": "you-this-session",
                    "intent": "user-edit",
                    "timestampMs": 1_700_000_000_000,
                    "requestId": None,
                },
                "parentRevision": "abc123",
                "createdAtMs": 1_700_000_000_000,
            },
            "plan": None,
            "conflict": None,
        },
    },
    {
        "name": "agent edit multi slice plan",
        "input": {
            "draft": {
                "id": "draft:behavior:checkout.apply-discount:1700000000100",
                "behaviorId": "behavior:checkout.apply-discount",
                "proposedSlices": (
                    {
                        "filePath": "app/checkout/discounts.ts",
                        "startLine": 12,
                        "endLine": 13,
                        "newText": "if (!discount.isEligible) return total;\n",
                        "intentRole": "guard",
                    },
                    {
                        "filePath": "app/checkout/discounts.ts",
                        "startLine": 18,
                        "endLine": 24,
                        "newText": "throw new DiscountError(reason);\n",
                        "intentRole": "error-path",
                    },
                ),
                "origin": {
                    "actor": "agents:edit",
                    "intent": "agent-edit",
                    "timestampMs": 1_700_000_000_100,
                    "requestId": "req_123",
                },
                "parentRevision": "base-rev-1",
                "createdAtMs": 1_700_000_000_100,
            },
            "plan": {
                "effectiveDiff": (
                    "--- a/app/checkout/discounts.ts\n"
                    "+++ b/app/checkout/discounts.ts\n"
                    "@@ -12,13 +12,7 @@\n"
                    "+if (!discount.isEligible) return total;\n"
                    "+throw new DiscountError(reason);\n"
                ),
                "appliesAgainstRevision": "base-rev-1",
                "validatedAtMs": 1_700_000_000_150,
            },
            "conflict": None,
        },
    },
    {
        "name": "promote to test plan",
        "input": {
            "draft": {
                "id": "draft:behavior:billing.invoice-fixture:1700000000200",
                "behaviorId": "behavior:billing.invoice-fixture",
                "proposedSlices": (
                    {
                        "filePath": "tests/billing/invoice.test.ts",
                        "startLine": 21,
                        "endLine": 29,
                        "newText": "expect(invoice.total).toBe(4200);\n",
                        "intentRole": "test",
                    },
                ),
                "origin": {
                    "actor": "ci",
                    "intent": "promote-to-test",
                    "timestampMs": 1_700_000_000_200,
                    "requestId": None,
                },
                "parentRevision": "test-rev-1",
                "createdAtMs": 1_700_000_000_200,
            },
            "plan": {
                "effectiveDiff": (
                    "--- a/tests/billing/invoice.test.ts\n"
                    "+++ b/tests/billing/invoice.test.ts\n"
                    "@@ -21,9 +21,1 @@\n"
                    "+expect(invoice.total).toBe(4200);\n"
                ),
                "appliesAgainstRevision": "test-rev-1",
                "validatedAtMs": 1_700_000_000_200,
            },
            "conflict": None,
        },
    },
    {
        "name": "lines changed conflict",
        "input": {
            "draft": {
                "id": "draft:behavior:auth.login-flow:1700000000300",
                "behaviorId": "behavior:auth.login-flow",
                "proposedSlices": (
                    {
                        "filePath": "app/auth/controller.ts",
                        "startLine": 4,
                        "endLine": 4,
                        "newText": "return login(request);\n",
                        "intentRole": "entry-point",
                    },
                ),
                "origin": {
                    "actor": "you-other-session",
                    "intent": "user-edit",
                    "timestampMs": 1_700_000_000_300,
                    "requestId": None,
                },
                "parentRevision": "login-rev-1",
                "createdAtMs": 1_700_000_000_300,
            },
            "plan": None,
            "conflict": {
                "draftId": "draft:behavior:auth.login-flow:1700000000300",
                "conflictingFiles": (
                    {
                        "filePath": "app/auth/controller.ts",
                        "conflictKind": "lines-changed",
                        "sourceUnchanged": False,
                    },
                ),
                "observedRevision": "login-rev-2",
                "expectedRevision": "login-rev-1",
            },
        },
    },
    {
        "name": "whitespace only reconcile conflict",
        "input": {
            "draft": {
                "id": "draft:behavior:docs.legacy-export:1700000000400",
                "behaviorId": "behavior:docs.legacy-export",
                "proposedSlices": (
                    {
                        "filePath": "app/export/legacy.ts",
                        "startLine": 2,
                        "endLine": 6,
                        "newText": "/* legacy export retained */\n",
                        "intentRole": "annotation",
                    },
                ),
                "origin": {
                    "actor": "product:lineage-confirm",
                    "intent": "reconcile",
                    "timestampMs": 1_700_000_000_400,
                    "requestId": None,
                },
                "parentRevision": "docs-rev-1",
                "createdAtMs": 1_700_000_000_400,
            },
            "plan": None,
            "conflict": {
                "draftId": "draft:behavior:docs.legacy-export:1700000000400",
                "conflictingFiles": (
                    {
                        "filePath": "app/export/legacy.ts",
                        "conflictKind": "whitespace-only",
                        "sourceUnchanged": True,
                    },
                ),
                "observedRevision": "docs-rev-2",
                "expectedRevision": "docs-rev-1",
            },
        },
    },
    {
        "name": "file deleted revert conflict",
        "input": {
            "draft": {
                "id": "draft:behavior:cleanup.removed-flow:1700000000500",
                "behaviorId": "behavior:cleanup.removed-flow",
                "proposedSlices": (
                    {
                        "filePath": "app/cleanup/removed.ts",
                        "startLine": 1,
                        "endLine": 8,
                        "newText": "",
                        "intentRole": "body",
                    },
                ),
                "origin": {
                    "actor": "git-op",
                    "intent": "revert",
                    "timestampMs": 1_700_000_000_500,
                    "requestId": None,
                },
                "parentRevision": "cleanup-rev-1",
                "createdAtMs": 1_700_000_000_500,
            },
            "plan": None,
            "conflict": {
                "draftId": "draft:behavior:cleanup.removed-flow:1700000000500",
                "conflictingFiles": (
                    {
                        "filePath": "app/cleanup/removed.ts",
                        "conflictKind": "file-deleted",
                        "sourceUnchanged": False,
                    },
                    {
                        "filePath": "app/cleanup/archive.ts",
                        "conflictKind": "file-moved",
                        "sourceUnchanged": True,
                    },
                ),
                "observedRevision": "cleanup-rev-2",
                "expectedRevision": "cleanup-rev-1",
            },
        },
    },
)


def _origin(value: dict) -> ChangeOrigin:
    return ChangeOrigin(
        actor=ActorKind(value["actor"]),
        intent=ChangeIntent(value["intent"]),
        timestamp_ms=value["timestampMs"],
        request_id=value["requestId"],
    )


def _proposed_slice(value: dict) -> ProposedSlice:
    return ProposedSlice(
        file_path=value["filePath"],
        start_line=value["startLine"],
        end_line=value["endLine"],
        new_text=value["newText"],
        intent_role=BehaviorSliceRole(value["intentRole"]),
    )


def _draft(value: dict) -> BehaviorDraft:
    return BehaviorDraft(
        id=value["id"],
        behavior_id=value["behaviorId"],
        proposed_slices=tuple(
            _proposed_slice(proposed_slice)
            for proposed_slice in value["proposedSlices"]
        ),
        origin=_origin(value["origin"]),
        parent_revision=value["parentRevision"],
        created_at_ms=value["createdAtMs"],
    )


def _plan(value: dict | None, draft: BehaviorDraft) -> WritebackPlan | None:
    if value is None:
        return None

    return WritebackPlan(
        draft=draft,
        effective_diff=value["effectiveDiff"],
        applies_against_revision=value["appliesAgainstRevision"],
        validated_at_ms=value["validatedAtMs"],
    )


def _conflicting_file(value: dict) -> ConflictingFile:
    return ConflictingFile(
        file_path=value["filePath"],
        conflict_kind=ConflictKind(value["conflictKind"]),
        source_unchanged=value["sourceUnchanged"],
    )


def _conflict(value: dict | None) -> ConflictState | None:
    if value is None:
        return None

    return ConflictState(
        draft_id=value["draftId"],
        conflicting_files=tuple(
            _conflicting_file(conflicting_file)
            for conflicting_file in value["conflictingFiles"]
        ),
        observed_revision=value["observedRevision"],
        expected_revision=value["expectedRevision"],
    )


def _serialize_origin(origin: ChangeOrigin) -> dict:
    return {
        "actor": origin.actor.value,
        "intent": origin.intent.value,
        "timestampMs": origin.timestamp_ms,
        "requestId": origin.request_id,
    }


def _serialize_proposed_slice(proposed_slice: ProposedSlice) -> dict:
    return {
        "filePath": proposed_slice.file_path,
        "startLine": proposed_slice.start_line,
        "endLine": proposed_slice.end_line,
        "newText": proposed_slice.new_text,
        "intentRole": proposed_slice.intent_role.value,
    }


def _serialize_draft(draft: BehaviorDraft) -> dict:
    return {
        "id": draft.id,
        "behaviorId": draft.behavior_id,
        "proposedSlices": [
            _serialize_proposed_slice(proposed_slice)
            for proposed_slice in draft.proposed_slices
        ],
        "origin": _serialize_origin(draft.origin),
        "parentRevision": draft.parent_revision,
        "createdAtMs": draft.created_at_ms,
    }


def _serialize_plan(plan: WritebackPlan | None) -> dict | None:
    if plan is None:
        return None

    return {
        "draft": _serialize_draft(plan.draft),
        "effectiveDiff": plan.effective_diff,
        "appliesAgainstRevision": plan.applies_against_revision,
        "validatedAtMs": plan.validated_at_ms,
    }


def _serialize_conflicting_file(conflicting_file: ConflictingFile) -> dict:
    return {
        "filePath": conflicting_file.file_path,
        "conflictKind": conflicting_file.conflict_kind.value,
        "sourceUnchanged": conflicting_file.source_unchanged,
    }


def _serialize_conflict(conflict: ConflictState | None) -> dict | None:
    if conflict is None:
        return None

    return {
        "draftId": conflict.draft_id,
        "conflictingFiles": [
            _serialize_conflicting_file(conflicting_file)
            for conflicting_file in conflict.conflicting_files
        ],
        "observedRevision": conflict.observed_revision,
        "expectedRevision": conflict.expected_revision,
    }


def test_python_and_typescript_writeback_records_match_for_representative_inputs():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-writeback.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_records = json.loads(result.stdout)
    py_records = []
    for scenario in PARITY_SCENARIOS:
        draft = _draft(scenario["input"]["draft"])
        plan = _plan(scenario["input"]["plan"], draft)
        conflict = _conflict(scenario["input"]["conflict"])
        py_records.append(
            {
                "name": scenario["name"],
                "draft": _serialize_draft(draft),
                "plan": _serialize_plan(plan),
                "conflict": _serialize_conflict(conflict),
            }
        )

    assert ts_records == py_records, (
        "Cross-language parity invariant violated: Python and TypeScript writeback "
        "constructors must produce equivalent records for representative inputs"
    )
