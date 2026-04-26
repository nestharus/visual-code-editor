import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.user_context import (
    ChangeEvent,
    ChangeEventKind,
    ChangeEventTier,
    OpenedSurface,
    OpenedSurfaceKind,
    RecentPromptSummary,
    UserContext,
)


PARITY_SCENARIOS = (
    {
        "name": "active diagram context with stashed change",
        "userContext": {
            "id": "user-context:session-1",
            "openedSurfaces": (
                {
                    "kind": "diagram",
                    "entityId": "system:auth",
                    "openedAtMs": 1_700_000_000_000,
                    "lastFocusedAtMs": 1_700_000_000_500,
                    "totalDwellMs": 500,
                },
                {
                    "kind": "panel",
                    "entityId": "module:auth.session",
                    "openedAtMs": 1_700_000_001_000,
                    "lastFocusedAtMs": 1_700_000_001_300,
                    "totalDwellMs": 300,
                },
            ),
            "recentPrompts": (
                {
                    "requestId": "req-001",
                    "mode": "ask",
                    "surfaceAnchor": "node",
                    "selectionCount": 1,
                    "issuedAtMs": 1_700_000_002_000,
                },
            ),
            "activeTaskIds": ("task:t1",),
            "activeSliceIds": ("slice:s1",),
            "autoMotionDisabled": False,
            "computedAtMs": 1_700_000_003_000,
        },
        "changeEvent": {
            "id": "change:c1",
            "kind": "entity-added",
            "actor": "agents:direct",
            "affectedEntityIds": ("system:auth",),
            "affectedKinds": ("system",),
            "tier": "stashed",
            "blocking": False,
            "timestampMs": 1_700_000_004_000,
            "contextSummary": "Auth system was added.",
            "detailUrl": None,
        },
    },
    {
        "name": "deduped context with blocking immediate change",
        "userContext": {
            "id": "user-context:session-2",
            "openedSurfaces": (
                {
                    "kind": "task",
                    "entityId": "task:t1",
                    "openedAtMs": 1_700_000_100_000,
                    "lastFocusedAtMs": 1_700_000_100_200,
                    "totalDwellMs": 200,
                },
                {
                    "kind": "task",
                    "entityId": "task:t1",
                    "openedAtMs": 1_700_000_100_000,
                    "lastFocusedAtMs": 1_700_000_101_000,
                    "totalDwellMs": 1_000,
                },
                {
                    "kind": "slice",
                    "entityId": "slice:s2",
                    "openedAtMs": 1_700_000_102_000,
                    "lastFocusedAtMs": 1_700_000_102_400,
                    "totalDwellMs": 400,
                },
            ),
            "recentPrompts": (
                {
                    "requestId": "req-002",
                    "mode": "edit",
                    "surfaceAnchor": "task",
                    "selectionCount": 2,
                    "issuedAtMs": 1_700_000_103_000,
                },
                {
                    "requestId": "req-002",
                    "mode": "edit",
                    "surfaceAnchor": "task",
                    "selectionCount": 3,
                    "issuedAtMs": 1_700_000_104_000,
                },
            ),
            "activeTaskIds": ("task:t1", "task:t1", "task:t2"),
            "activeSliceIds": ("slice:s1", "slice:s1", "slice:s2"),
            "autoMotionDisabled": True,
            "computedAtMs": 1_700_000_105_000,
        },
        "changeEvent": {
            "id": "change:blocking-ci",
            "kind": "ci-run-finished",
            "actor": "ci",
            "affectedEntityIds": ("task:t2", "slice:s2"),
            "affectedKinds": ("task", "slice"),
            "tier": "immediate",
            "blocking": True,
            "timestampMs": 1_700_000_106_000,
            "contextSummary": "CI failed for active work.",
            "detailUrl": "/tasks/t2/ci",
        },
    },
)


def _surface(value: dict) -> OpenedSurface:
    return OpenedSurface(
        kind=OpenedSurfaceKind(value["kind"]),
        entity_id=value["entityId"],
        opened_at_ms=value["openedAtMs"],
        last_focused_at_ms=value["lastFocusedAtMs"],
        total_dwell_ms=value["totalDwellMs"],
    )


def _prompt(value: dict) -> RecentPromptSummary:
    return RecentPromptSummary(
        request_id=value["requestId"],
        mode=value["mode"],
        surface_anchor=value["surfaceAnchor"],
        selection_count=value["selectionCount"],
        issued_at_ms=value["issuedAtMs"],
    )


def _context(value: dict) -> UserContext:
    return UserContext(
        id=value["id"],
        opened_surfaces=tuple(_surface(surface) for surface in value["openedSurfaces"]),
        recent_prompts=tuple(_prompt(prompt) for prompt in value["recentPrompts"]),
        active_task_ids=tuple(value["activeTaskIds"]),
        active_slice_ids=tuple(value["activeSliceIds"]),
        auto_motion_disabled=value["autoMotionDisabled"],
        computed_at_ms=value["computedAtMs"],
    )


def _event(value: dict) -> ChangeEvent:
    return ChangeEvent(
        id=value["id"],
        kind=ChangeEventKind(value["kind"]),
        actor=ActorKind(value["actor"]),
        affected_entity_ids=tuple(value["affectedEntityIds"]),
        affected_kinds=tuple(value["affectedKinds"]),
        tier=ChangeEventTier(value["tier"]),
        blocking=value["blocking"],
        timestamp_ms=value["timestampMs"],
        context_summary=value["contextSummary"],
        detail_url=value["detailUrl"],
    )


def _serialize_surface(value: OpenedSurface) -> dict:
    return {
        "kind": value.kind.value,
        "entityId": value.entity_id,
        "openedAtMs": value.opened_at_ms,
        "lastFocusedAtMs": value.last_focused_at_ms,
        "totalDwellMs": value.total_dwell_ms,
    }


def _serialize_prompt(value: RecentPromptSummary) -> dict:
    return {
        "requestId": value.request_id,
        "mode": value.mode,
        "surfaceAnchor": value.surface_anchor,
        "selectionCount": value.selection_count,
        "issuedAtMs": value.issued_at_ms,
    }


def _serialize_context(value: UserContext) -> dict:
    return {
        "id": value.id,
        "openedSurfaces": [
            _serialize_surface(surface) for surface in value.opened_surfaces
        ],
        "recentPrompts": [
            _serialize_prompt(prompt) for prompt in value.recent_prompts
        ],
        "activeTaskIds": list(value.active_task_ids),
        "activeSliceIds": list(value.active_slice_ids),
        "autoMotionDisabled": value.auto_motion_disabled,
        "computedAtMs": value.computed_at_ms,
    }


def _serialize_event(value: ChangeEvent) -> dict:
    return {
        "id": value.id,
        "kind": value.kind.value,
        "actor": value.actor.value,
        "affectedEntityIds": list(value.affected_entity_ids),
        "affectedKinds": list(value.affected_kinds),
        "tier": value.tier.value,
        "blocking": value.blocking,
        "timestampMs": value.timestamp_ms,
        "contextSummary": value.context_summary,
        "detailUrl": value.detail_url,
    }


def test_python_and_typescript_user_context_records_match_for_representative_inputs():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-user-context.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_records = json.loads(result.stdout)
    py_records = [
        {
            "name": scenario["name"],
            "userContext": _serialize_context(_context(scenario["userContext"])),
            "changeEvent": _serialize_event(_event(scenario["changeEvent"])),
        }
        for scenario in PARITY_SCENARIOS
    ]

    assert ts_records == py_records, (
        "Cross-language parity invariant violated: Python and TypeScript "
        "UserContext and ChangeEvent constructors must produce equivalent records "
        "for representative inputs"
    )
