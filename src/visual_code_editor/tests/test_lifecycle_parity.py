import json
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.lifecycle import (
    DEFAULT_CONFIG,
    ArtifactSnapshot,
    evaluate,
)
from visual_code_editor.model.slice import SliceLifecycleState


NOW_MS = 1_700_000_000_000

PARITY_SCENARIOS = (
    {
        "name": "dismissed terminal",
        "nowMs": NOW_MS,
        "config": {},
        "snapshot": {
            "artifactId": "slice:dismissed",
            "currentState": "dismissed",
            "createdAtMs": NOW_MS - 60_000,
            "ttlMs": NOW_MS - 1,
            "tombstonedAtMs": None,
        },
    },
    {
        "name": "pinned preserved",
        "nowMs": NOW_MS,
        "config": {},
        "snapshot": {
            "artifactId": "slice:pinned",
            "currentState": "pinned",
            "createdAtMs": NOW_MS - 60_000,
            "ttlMs": None,
            "tombstonedAtMs": None,
        },
    },
    {
        "name": "old tombstone purgeable",
        "nowMs": NOW_MS,
        "config": {},
        "snapshot": {
            "artifactId": "slice:old-tombstone",
            "currentState": "tombstoned",
            "createdAtMs": NOW_MS - 86_500_000,
            "ttlMs": NOW_MS - 86_400_000,
            "tombstonedAtMs": NOW_MS - 86_400_000,
        },
    },
    {
        "name": "recent tombstone retained",
        "nowMs": NOW_MS,
        "config": {},
        "snapshot": {
            "artifactId": "slice:recent-tombstone",
            "currentState": "tombstoned",
            "createdAtMs": NOW_MS - 60_000,
            "ttlMs": NOW_MS - 30_000,
            "tombstonedAtMs": NOW_MS - 30_000,
        },
    },
    {
        "name": "ttl elapsed",
        "nowMs": NOW_MS,
        "config": {},
        "snapshot": {
            "artifactId": "slice:elapsed",
            "currentState": "active",
            "createdAtMs": NOW_MS - 60_000,
            "ttlMs": NOW_MS - 1,
            "tombstonedAtMs": None,
        },
    },
    {
        "name": "ttl elapsed after grace",
        "nowMs": NOW_MS,
        "config": {"tombstoneGraceMs": 250},
        "snapshot": {
            "artifactId": "slice:elapsed-grace",
            "currentState": "active",
            "createdAtMs": NOW_MS - 60_000,
            "ttlMs": NOW_MS - 250,
            "tombstonedAtMs": None,
        },
    },
    {
        "name": "warning window",
        "nowMs": NOW_MS,
        "config": {},
        "snapshot": {
            "artifactId": "slice:warning-window",
            "currentState": "active",
            "createdAtMs": NOW_MS - 60_000,
            "ttlMs": NOW_MS + 60_000,
            "tombstonedAtMs": None,
        },
    },
    {
        "name": "plenty remaining",
        "nowMs": NOW_MS,
        "config": {},
        "snapshot": {
            "artifactId": "slice:plenty-remaining",
            "currentState": "active",
            "createdAtMs": NOW_MS - 60_000,
            "ttlMs": NOW_MS + 300_001,
            "tombstonedAtMs": None,
        },
    },
    {
        "name": "recovered remaining",
        "nowMs": NOW_MS,
        "config": {},
        "snapshot": {
            "artifactId": "slice:recovered",
            "currentState": "recovered",
            "createdAtMs": NOW_MS - 60_000,
            "ttlMs": NOW_MS + 300_001,
            "tombstonedAtMs": None,
        },
    },
    {
        "name": "ttl boundary",
        "nowMs": NOW_MS,
        "config": {},
        "snapshot": {
            "artifactId": "slice:ttl-boundary",
            "currentState": "active",
            "createdAtMs": NOW_MS - 60_000,
            "ttlMs": NOW_MS,
            "tombstonedAtMs": None,
        },
    },
    {
        "name": "warning boundary",
        "nowMs": NOW_MS,
        "config": {},
        "snapshot": {
            "artifactId": "slice:warning-boundary",
            "currentState": "active",
            "createdAtMs": NOW_MS - 60_000,
            "ttlMs": NOW_MS + 300_000,
            "tombstonedAtMs": None,
        },
    },
)


CONFIG_KEY_MAP = {
    "expiringWarningMs": "expiring_warning_ms",
    "tombstoneGraceMs": "tombstone_grace_ms",
    "tombstoneRetentionMs": "tombstone_retention_ms",
}


def _config(value: dict):
    return replace(
        DEFAULT_CONFIG,
        **{CONFIG_KEY_MAP[key]: config_value for key, config_value in value.items()},
    )


def _snapshot(value: dict) -> ArtifactSnapshot:
    return ArtifactSnapshot(
        artifact_id=value["artifactId"],
        current_state=SliceLifecycleState(value["currentState"]),
        created_at_ms=value["createdAtMs"],
        ttl_ms=value["ttlMs"],
        tombstoned_at_ms=value["tombstonedAtMs"],
    )


def _enum_value(value):
    return value.value if hasattr(value, "value") else value


def _serialize_decision(decision) -> dict:
    return {
        "nextState": _enum_value(decision.next_state),
        "changed": decision.changed,
        "reason": _enum_value(decision.reason),
    }


def test_python_and_typescript_lifecycle_decisions_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-lifecycle.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_records = json.loads(result.stdout)
    py_records = [
        {
            "name": scenario["name"],
            "decision": _serialize_decision(
                evaluate(
                    _snapshot(scenario["snapshot"]),
                    scenario["nowMs"],
                    _config(scenario["config"]),
                )
            ),
        }
        for scenario in PARITY_SCENARIOS
    ]

    assert ts_records == py_records
