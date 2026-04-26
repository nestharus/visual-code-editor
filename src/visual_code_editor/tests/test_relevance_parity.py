import json
import math
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.relevance import DEFAULT_CONFIG, classify
from visual_code_editor.model.user_context import (
    ChangeEvent,
    ChangeEventKind,
    ChangeEventTier,
    OpenedSurface,
    OpenedSurfaceKind,
    UserContext,
)


PARITY_SCENARIOS = (
    {
        "name": "always immediate rename",
        "nowMs": 1_700_000_000_000,
        "config": {},
        "userContext": {
            "id": "user-context:relevance",
            "openedSurfaces": (),
            "recentPrompts": (),
            "activeTaskIds": (),
            "activeSliceIds": (),
            "autoMotionDisabled": False,
            "computedAtMs": 1_700_000_000_000,
        },
        "changeEvent": {
            "id": "change:rename",
            "kind": "entity-renamed",
            "actor": "you-this-session",
            "affectedEntityIds": ("system:auth",),
            "affectedKinds": ("system",),
            "tier": "stashed",
            "blocking": False,
            "timestampMs": 0,
            "contextSummary": "Auth renamed.",
            "detailUrl": None,
        },
    },
    {
        "name": "always stashed provider sync",
        "nowMs": 1_700_000_000_000,
        "config": {"immediateThreshold": 0.0, "stashedThreshold": 0.0},
        "userContext": {
            "id": "user-context:relevance",
            "openedSurfaces": (
                {
                    "kind": "diagram",
                    "entityId": "system:auth",
                    "openedAtMs": 1_699_999_990_000,
                    "lastFocusedAtMs": 1_699_999_999_000,
                    "totalDwellMs": 9_000,
                },
            ),
            "recentPrompts": (),
            "activeTaskIds": (),
            "activeSliceIds": (),
            "autoMotionDisabled": False,
            "computedAtMs": 1_700_000_000_000,
        },
        "changeEvent": {
            "id": "change:provider-sync",
            "kind": "provider-sync",
            "actor": "provider:github:sync",
            "affectedEntityIds": ("system:auth",),
            "affectedKinds": ("system",),
            "tier": "stashed",
            "blocking": False,
            "timestampMs": 1_700_000_000_000,
            "contextSummary": "Provider sync finished.",
            "detailUrl": None,
        },
    },
    {
        "name": "blocking task update",
        "nowMs": 1_700_000_000_000,
        "config": {"immediateThreshold": 1.0, "stashedThreshold": 1.0},
        "userContext": {
            "id": "user-context:relevance",
            "openedSurfaces": (),
            "recentPrompts": (),
            "activeTaskIds": (),
            "activeSliceIds": (),
            "autoMotionDisabled": False,
            "computedAtMs": 1_700_000_000_000,
        },
        "changeEvent": {
            "id": "change:blocking",
            "kind": "task-state-change",
            "actor": "ci",
            "affectedEntityIds": ("task:t1",),
            "affectedKinds": ("task",),
            "tier": "immediate",
            "blocking": True,
            "timestampMs": 0,
            "contextSummary": "Task is blocked.",
            "detailUrl": None,
        },
    },
    {
        "name": "recent scored event",
        "nowMs": 1_700_000_000_000,
        "config": {},
        "userContext": {
            "id": "user-context:relevance",
            "openedSurfaces": (),
            "recentPrompts": (),
            "activeTaskIds": (),
            "activeSliceIds": (),
            "autoMotionDisabled": False,
            "computedAtMs": 1_700_000_000_000,
        },
        "changeEvent": {
            "id": "change:recent",
            "kind": "entity-added",
            "actor": "agents:direct",
            "affectedEntityIds": ("system:auth",),
            "affectedKinds": ("system",),
            "tier": "stashed",
            "blocking": False,
            "timestampMs": 1_700_000_000_000,
            "contextSummary": "Auth added.",
            "detailUrl": None,
        },
    },
    {
        "name": "old scored event",
        "nowMs": 1_700_000_000_000,
        "config": {},
        "userContext": {
            "id": "user-context:relevance",
            "openedSurfaces": (),
            "recentPrompts": (),
            "activeTaskIds": (),
            "activeSliceIds": (),
            "autoMotionDisabled": False,
            "computedAtMs": 1_700_000_000_000,
        },
        "changeEvent": {
            "id": "change:old",
            "kind": "entity-added",
            "actor": "agents:direct",
            "affectedEntityIds": ("system:auth",),
            "affectedKinds": ("system",),
            "tier": "stashed",
            "blocking": False,
            "timestampMs": 0,
            "contextSummary": "Auth added earlier.",
            "detailUrl": None,
        },
    },
    {
        "name": "on surface match",
        "nowMs": 1_700_000_000_000,
        "config": {},
        "userContext": {
            "id": "user-context:relevance",
            "openedSurfaces": (
                {
                    "kind": "diagram",
                    "entityId": "system:auth",
                    "openedAtMs": 1_699_999_990_000,
                    "lastFocusedAtMs": 1_699_999_999_000,
                    "totalDwellMs": 9_000,
                },
            ),
            "recentPrompts": (),
            "activeTaskIds": (),
            "activeSliceIds": (),
            "autoMotionDisabled": False,
            "computedAtMs": 1_700_000_000_000,
        },
        "changeEvent": {
            "id": "change:on-surface",
            "kind": "entity-added",
            "actor": "agents:direct",
            "affectedEntityIds": ("system:auth",),
            "affectedKinds": ("system",),
            "tier": "stashed",
            "blocking": False,
            "timestampMs": 1_700_000_000_000,
            "contextSummary": "Auth changed on open surface.",
            "detailUrl": None,
        },
    },
    {
        "name": "you this session",
        "nowMs": 1_700_000_000_000,
        "config": {},
        "userContext": {
            "id": "user-context:relevance",
            "openedSurfaces": (),
            "recentPrompts": (),
            "activeTaskIds": (),
            "activeSliceIds": (),
            "autoMotionDisabled": False,
            "computedAtMs": 1_700_000_000_000,
        },
        "changeEvent": {
            "id": "change:this-session",
            "kind": "entity-added",
            "actor": "you-this-session",
            "affectedEntityIds": ("system:auth",),
            "affectedKinds": ("system",),
            "tier": "stashed",
            "blocking": False,
            "timestampMs": 1_700_000_000_000,
            "contextSummary": "Own local change.",
            "detailUrl": None,
        },
    },
    {
        "name": "you other session",
        "nowMs": 1_700_000_000_000,
        "config": {},
        "userContext": {
            "id": "user-context:relevance",
            "openedSurfaces": (),
            "recentPrompts": (),
            "activeTaskIds": (),
            "activeSliceIds": (),
            "autoMotionDisabled": False,
            "computedAtMs": 1_700_000_000_000,
        },
        "changeEvent": {
            "id": "change:other-session",
            "kind": "entity-added",
            "actor": "you-other-session",
            "affectedEntityIds": ("system:auth",),
            "affectedKinds": ("system",),
            "tier": "stashed",
            "blocking": False,
            "timestampMs": 1_700_000_000_000,
            "contextSummary": "Own other session change.",
            "detailUrl": None,
        },
    },
    {
        "name": "threshold stashed",
        "nowMs": 1_000,
        "config": {
            "recencyWindowMs": 100,
            "recencyWeight": 1.0,
            "onSurfaceWeight": 0.0,
            "providerWeight": 0.0,
            "actorWeight": 0.0,
            "contextMatchWeight": 0.0,
            "immediateThreshold": 0.55,
            "stashedThreshold": 0.20,
            "providerTierWeight": {},
        },
        "userContext": {
            "id": "user-context:relevance",
            "openedSurfaces": (),
            "recentPrompts": (),
            "activeTaskIds": (),
            "activeSliceIds": (),
            "autoMotionDisabled": False,
            "computedAtMs": 1_000,
        },
        "changeEvent": {
            "id": "change:threshold-stashed",
            "kind": "entity-added",
            "actor": "generator",
            "affectedEntityIds": ("system:auth",),
            "affectedKinds": ("system",),
            "tier": "stashed",
            "blocking": False,
            "timestampMs": 954,
            "contextSummary": "Threshold stashed.",
            "detailUrl": None,
        },
    },
    {
        "name": "threshold immediate",
        "nowMs": 1_000,
        "config": {
            "recencyWindowMs": 100,
            "recencyWeight": 1.0,
            "onSurfaceWeight": 0.0,
            "providerWeight": 0.0,
            "actorWeight": 0.0,
            "contextMatchWeight": 0.0,
            "immediateThreshold": 0.55,
            "stashedThreshold": 0.20,
            "providerTierWeight": {},
        },
        "userContext": {
            "id": "user-context:relevance",
            "openedSurfaces": (),
            "recentPrompts": (),
            "activeTaskIds": (),
            "activeSliceIds": (),
            "autoMotionDisabled": False,
            "computedAtMs": 1_000,
        },
        "changeEvent": {
            "id": "change:threshold-immediate",
            "kind": "entity-added",
            "actor": "generator",
            "affectedEntityIds": ("system:auth",),
            "affectedKinds": ("system",),
            "tier": "stashed",
            "blocking": False,
            "timestampMs": 955,
            "contextSummary": "Threshold immediate.",
            "detailUrl": None,
        },
    },
    {
        "name": "suppressed below stashed threshold",
        "nowMs": 1_700_000_000_000,
        "config": {},
        "userContext": {
            "id": "user-context:relevance",
            "openedSurfaces": (),
            "recentPrompts": (),
            "activeTaskIds": (),
            "activeSliceIds": (),
            "autoMotionDisabled": False,
            "computedAtMs": 1_700_000_000_000,
        },
        "changeEvent": {
            "id": "change:suppressed",
            "kind": "entity-added",
            "actor": "generator",
            "affectedEntityIds": ("system:auth",),
            "affectedKinds": ("system",),
            "tier": "stashed",
            "blocking": False,
            "timestampMs": 0,
            "contextSummary": "Old generated change.",
            "detailUrl": None,
        },
    },
)


CONFIG_KEY_MAP = {
    "recencyWindowMs": "recency_window_ms",
    "recencyWeight": "recency_weight",
    "onSurfaceWeight": "on_surface_weight",
    "providerWeight": "provider_weight",
    "actorWeight": "actor_weight",
    "contextMatchWeight": "context_match_weight",
    "immediateThreshold": "immediate_threshold",
    "stashedThreshold": "stashed_threshold",
    "providerTierWeight": "provider_tier_weight",
}


def _config(value: dict):
    overrides = {}
    for key, config_value in value.items():
        py_key = CONFIG_KEY_MAP[key]
        if key == "providerTierWeight":
            overrides[py_key] = {
                ActorKind(actor): weight for actor, weight in config_value.items()
            }
        else:
            overrides[py_key] = config_value
    return replace(DEFAULT_CONFIG, **overrides)


def _surface(value: dict) -> OpenedSurface:
    return OpenedSurface(
        kind=OpenedSurfaceKind(value["kind"]),
        entity_id=value["entityId"],
        opened_at_ms=value["openedAtMs"],
        last_focused_at_ms=value["lastFocusedAtMs"],
        total_dwell_ms=value["totalDwellMs"],
    )


def _context(value: dict) -> UserContext:
    return UserContext(
        id=value["id"],
        opened_surfaces=tuple(_surface(surface) for surface in value["openedSurfaces"]),
        recent_prompts=(),
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


def _enum_value(value):
    return value.value if hasattr(value, "value") else value


def _serialize_decision(decision) -> dict:
    return {
        "tier": _enum_value(decision.tier),
        "totalScore": decision.total_score,
        "reason": _enum_value(decision.reason),
        "rulesFired": list(decision.rules_fired),
    }


def test_python_and_typescript_relevance_decisions_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-relevance.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_records = json.loads(result.stdout)
    py_records = [
        {
            "name": scenario["name"],
            "decision": _serialize_decision(
                classify(
                    _event(scenario["changeEvent"]),
                    _context(scenario["userContext"]),
                    _config(scenario["config"]),
                    scenario["nowMs"],
                )
            ),
        }
        for scenario in PARITY_SCENARIOS
    ]

    assert [record["name"] for record in ts_records] == [
        record["name"] for record in py_records
    ]
    for ts_record, py_record in zip(ts_records, py_records, strict=True):
        assert ts_record["decision"]["tier"] == py_record["decision"]["tier"]
        assert ts_record["decision"]["reason"] == py_record["decision"]["reason"]
        assert ts_record["decision"]["rulesFired"] == py_record["decision"][
            "rulesFired"
        ]
        assert math.isclose(
            ts_record["decision"]["totalScore"],
            py_record["decision"]["totalScore"],
            rel_tol=0.0,
            abs_tol=1e-12,
        )
