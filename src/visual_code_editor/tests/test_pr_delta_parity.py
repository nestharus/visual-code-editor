import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.pr_delta import DeltaKind, EntityDelta, EntityKind, PRDeltaSet
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


PARITY_SCENARIOS = (
    {
        "name": "added behavior in pull request",
        "input": {
            "id": "prdelta:repo.42",
            "baseRevision": "abc123",
            "headRevision": "def456",
            "baseBranch": "main",
            "headBranch": "feature/auth",
            "prNumber": 42,
            "taskId": None,
            "deltas": (
                {
                    "deltaKind": "added",
                    "entityKind": "behavior",
                    "baseId": None,
                    "headId": "behavior:auth.validate-token",
                    "relatedIds": (),
                    "trust": {"state": "grounded", "grounding": "lsp-type"},
                    "attributionActor": "generator",
                },
            ),
            "computedAtMs": 1_700_000_000_000,
            "attributionActor": "generator",
        },
    },
    {
        "name": "removed store in pull request",
        "input": {
            "id": "prdelta:repo.43",
            "baseRevision": "abc123",
            "headRevision": "fed456",
            "baseBranch": "main",
            "headBranch": "cleanup/cache-store",
            "prNumber": 43,
            "taskId": None,
            "deltas": (
                {
                    "deltaKind": "removed",
                    "entityKind": "store",
                    "baseId": "store:legacy-cache",
                    "headId": None,
                    "relatedIds": (),
                    "trust": {"state": "grounded", "grounding": "lsp-type"},
                    "attributionActor": "generator",
                },
            ),
            "computedAtMs": 1_700_000_100_000,
            "attributionActor": "generator",
        },
    },
    {
        "name": "renamed task in task delta",
        "input": {
            "id": "prdelta:task.rename-auth",
            "baseRevision": "abc123",
            "headRevision": "aaa111",
            "baseBranch": "main",
            "headBranch": "task/rename-auth",
            "prNumber": None,
            "taskId": "task:rename-auth",
            "deltas": (
                {
                    "deltaKind": "renamed",
                    "entityKind": "task",
                    "baseId": "task:auth-old",
                    "headId": "task:auth-new",
                    "relatedIds": (),
                    "trust": {"state": "grounded", "grounding": "lsp-type"},
                    "attributionActor": "generator",
                },
            ),
            "computedAtMs": 1_700_000_200_000,
            "attributionActor": "generator",
        },
    },
    {
        "name": "reshaped edge in pull request",
        "input": {
            "id": "prdelta:repo.44",
            "baseRevision": "abc123",
            "headRevision": "bbb222",
            "baseBranch": "main",
            "headBranch": "feature/edge-flow",
            "prNumber": 44,
            "taskId": None,
            "deltas": (
                {
                    "deltaKind": "reshaped",
                    "entityKind": "edge",
                    "baseId": "edge:auth-to-store",
                    "headId": "edge:auth-to-store",
                    "relatedIds": (),
                    "trust": {"state": "candidate", "grounding": None},
                    "attributionActor": "generator",
                },
            ),
            "computedAtMs": 1_700_000_300_000,
            "attributionActor": "generator",
        },
    },
    {
        "name": "split behavior lineage in pull request",
        "input": {
            "id": "prdelta:repo.45",
            "baseRevision": "abc123",
            "headRevision": "ccc333",
            "baseBranch": "main",
            "headBranch": "feature/split-auth",
            "prNumber": 45,
            "taskId": None,
            "deltas": (
                {
                    "deltaKind": "split",
                    "entityKind": "behavior",
                    "baseId": "behavior:auth.login",
                    "headId": "behavior:auth.validate-token",
                    "relatedIds": ("behavior:auth.issue-session",),
                    "trust": {"state": "grounded", "grounding": "lsp-type"},
                    "attributionActor": "generator",
                },
            ),
            "computedAtMs": 1_700_000_400_000,
            "attributionActor": "generator",
        },
    },
    {
        "name": "merged container lineage in pull request",
        "input": {
            "id": "prdelta:repo.46",
            "baseRevision": "abc123",
            "headRevision": "ddd444",
            "baseBranch": "main",
            "headBranch": "feature/merge-panels",
            "prNumber": 46,
            "taskId": None,
            "deltas": (
                {
                    "deltaKind": "merged",
                    "entityKind": "container",
                    "baseId": "container:panel-primary",
                    "headId": "container:panel-unified",
                    "relatedIds": ("container:panel-secondary",),
                    "trust": {"state": "grounded", "grounding": "lsp-type"},
                    "attributionActor": "generator",
                },
            ),
            "computedAtMs": 1_700_000_500_000,
            "attributionActor": "generator",
        },
    },
    {
        "name": "unchanged and unmatched mixed delta",
        "input": {
            "id": "prdelta:repo.47",
            "baseRevision": "abc123",
            "headRevision": "eee555",
            "baseBranch": "main",
            "headBranch": "feature/mixed",
            "prNumber": 47,
            "taskId": None,
            "deltas": (
                {
                    "deltaKind": "unchanged",
                    "entityKind": "artifact",
                    "baseId": "artifact:readme",
                    "headId": "artifact:readme",
                    "relatedIds": (),
                    "trust": {"state": "grounded", "grounding": "lsp-type"},
                    "attributionActor": "generator",
                },
                {
                    "deltaKind": "unmatched",
                    "entityKind": "test",
                    "baseId": "test:legacy-export",
                    "headId": None,
                    "relatedIds": (),
                    "trust": {"state": "candidate", "grounding": None},
                    "attributionActor": "generator",
                },
            ),
            "computedAtMs": 1_700_000_600_000,
            "attributionActor": "generator",
        },
    },
    {
        "name": "empty no-op pull request delta",
        "input": {
            "id": "prdelta:repo.48",
            "baseRevision": "abc123",
            "headRevision": "fff666",
            "baseBranch": "main",
            "headBranch": "docs/no-op",
            "prNumber": 48,
            "taskId": None,
            "deltas": (),
            "computedAtMs": 1_700_000_700_000,
            "attributionActor": "generator",
        },
    },
)


def _trust(value: dict) -> TrustSignal:
    grounding = value["grounding"]
    return TrustSignal(
        state=TrustState(value["state"]),
        grounding=GroundingSource(grounding) if grounding is not None else None,
    )


def _actor(value: str) -> ActorKind:
    return ActorKind(value)


def _entity_delta(value: dict) -> EntityDelta:
    return EntityDelta(
        delta_kind=DeltaKind(value["deltaKind"]),
        entity_kind=EntityKind(value["entityKind"]),
        base_id=value["baseId"],
        head_id=value["headId"],
        related_ids=tuple(value["relatedIds"]),
        trust=_trust(value["trust"]),
        attribution_actor=_actor(value["attributionActor"]),
    )


def _pr_delta_set(value: dict) -> PRDeltaSet:
    return PRDeltaSet(
        id=value["id"],
        base_revision=value["baseRevision"],
        head_revision=value["headRevision"],
        base_branch=value["baseBranch"],
        head_branch=value["headBranch"],
        pr_number=value["prNumber"],
        task_id=value["taskId"],
        deltas=tuple(_entity_delta(delta) for delta in value["deltas"]),
        computed_at_ms=value["computedAtMs"],
        attribution_actor=_actor(value["attributionActor"]),
    )


def _serialize_trust(trust: TrustSignal) -> dict:
    return {
        "state": trust.state.value,
        "grounding": trust.grounding.value if trust.grounding is not None else None,
    }


def _serialize_entity_delta(delta: EntityDelta) -> dict:
    return {
        "deltaKind": delta.delta_kind.value,
        "entityKind": delta.entity_kind.value,
        "baseId": delta.base_id,
        "headId": delta.head_id,
        "relatedIds": list(delta.related_ids),
        "trust": _serialize_trust(delta.trust),
        "attributionActor": delta.attribution_actor.value,
    }


def _serialize_pr_delta_set(delta_set: PRDeltaSet) -> dict:
    return {
        "id": delta_set.id,
        "baseRevision": delta_set.base_revision,
        "headRevision": delta_set.head_revision,
        "baseBranch": delta_set.base_branch,
        "headBranch": delta_set.head_branch,
        "prNumber": delta_set.pr_number,
        "taskId": delta_set.task_id,
        "deltas": [_serialize_entity_delta(delta) for delta in delta_set.deltas],
        "computedAtMs": delta_set.computed_at_ms,
        "attributionActor": delta_set.attribution_actor.value,
    }


def test_python_and_typescript_pr_delta_records_match_for_representative_inputs():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-pr-delta.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_records = json.loads(result.stdout)
    py_records = [
        {
            "name": scenario["name"],
            "prDelta": _serialize_pr_delta_set(_pr_delta_set(scenario["input"])),
        }
        for scenario in PARITY_SCENARIOS
    ]

    assert ts_records == py_records, (
        "Cross-language parity invariant violated: Python and TypeScript PRDeltaSet "
        "constructors must produce equivalent records for representative inputs"
    )
