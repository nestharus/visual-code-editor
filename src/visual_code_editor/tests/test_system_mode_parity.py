import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.system_mode import (
    DEFAULT_CONFIG,
    ProviderHealthSnapshot,
    SystemModeInput,
    evaluate_system_mode,
)
from visual_code_editor.model.trust import TrustState


PARITY_SCENARIOS = (
    {
        "name": "all-zero baseline",
        "input": {
            "agents_unreachable_since_ms": None,
            "agents_inflight_requests": 0,
            "rendered_llm_element_count": 0,
            "stale_llm_element_count": 0,
            "active_provider_dependencies": (),
        },
    },
    {
        "name": "runtime below threshold with inflight request",
        "input": {
            "agents_unreachable_since_ms": 29999,
            "agents_inflight_requests": 1,
            "rendered_llm_element_count": 0,
            "stale_llm_element_count": 0,
            "active_provider_dependencies": (),
        },
    },
    {
        "name": "runtime at threshold with inflight request",
        "input": {
            "agents_unreachable_since_ms": 30000,
            "agents_inflight_requests": 1,
            "rendered_llm_element_count": 0,
            "stale_llm_element_count": 0,
            "active_provider_dependencies": (),
        },
    },
    {
        "name": "runtime above threshold without inflight request",
        "input": {
            "agents_unreachable_since_ms": 30001,
            "agents_inflight_requests": 0,
            "rendered_llm_element_count": 0,
            "stale_llm_element_count": 0,
            "active_provider_dependencies": (),
        },
    },
    {
        "name": "stale ratio thirty percent",
        "input": {
            "agents_unreachable_since_ms": None,
            "agents_inflight_requests": 0,
            "rendered_llm_element_count": 10,
            "stale_llm_element_count": 3,
            "active_provider_dependencies": (),
        },
    },
    {
        "name": "stale ratio forty percent",
        "input": {
            "agents_unreachable_since_ms": None,
            "agents_inflight_requests": 0,
            "rendered_llm_element_count": 10,
            "stale_llm_element_count": 4,
            "active_provider_dependencies": (),
        },
    },
    {
        "name": "stale ratio forty one percent",
        "input": {
            "agents_unreachable_since_ms": None,
            "agents_inflight_requests": 0,
            "rendered_llm_element_count": 100,
            "stale_llm_element_count": 41,
            "active_provider_dependencies": (),
        },
    },
    {
        "name": "providers all grounded",
        "input": {
            "agents_unreachable_since_ms": None,
            "agents_inflight_requests": 0,
            "rendered_llm_element_count": 0,
            "stale_llm_element_count": 0,
            "active_provider_dependencies": (
                {"provider_id": "github", "trust": "grounded"},
                {"provider_id": "linear", "trust": "grounded"},
            ),
        },
    },
    {
        "name": "one provider stale",
        "input": {
            "agents_unreachable_since_ms": None,
            "agents_inflight_requests": 0,
            "rendered_llm_element_count": 0,
            "stale_llm_element_count": 0,
            "active_provider_dependencies": (
                {"provider_id": "github", "trust": "stale"},
            ),
        },
    },
    {
        "name": "one provider conflicting",
        "input": {
            "agents_unreachable_since_ms": None,
            "agents_inflight_requests": 0,
            "rendered_llm_element_count": 0,
            "stale_llm_element_count": 0,
            "active_provider_dependencies": (
                {"provider_id": "github", "trust": "conflicting"},
            ),
        },
    },
    {
        "name": "one provider orphaned",
        "input": {
            "agents_unreachable_since_ms": None,
            "agents_inflight_requests": 0,
            "rendered_llm_element_count": 0,
            "stale_llm_element_count": 0,
            "active_provider_dependencies": (
                {"provider_id": "github", "trust": "orphaned"},
            ),
        },
    },
    {
        "name": "all three triggers active",
        "input": {
            "agents_unreachable_since_ms": 30000,
            "agents_inflight_requests": 1,
            "rendered_llm_element_count": 10,
            "stale_llm_element_count": 4,
            "active_provider_dependencies": (
                {"provider_id": "github", "trust": "stale"},
            ),
        },
    },
)


def _provider(snapshot: dict[str, str]) -> ProviderHealthSnapshot:
    return ProviderHealthSnapshot(
        provider_id=snapshot["provider_id"],
        trust=TrustState(snapshot["trust"]),
    )


def _input(values: dict) -> SystemModeInput:
    return SystemModeInput(
        agents_unreachable_since_ms=values["agents_unreachable_since_ms"],
        agents_inflight_requests=values["agents_inflight_requests"],
        rendered_llm_element_count=values["rendered_llm_element_count"],
        stale_llm_element_count=values["stale_llm_element_count"],
        active_provider_dependencies=tuple(
            _provider(snapshot) for snapshot in values["active_provider_dependencies"]
        ),
    )


def test_python_and_typescript_system_mode_decisions_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-system-mode.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_decisions = json.loads(result.stdout)
    py_decisions = [
        {
            "name": scenario["name"],
            "decision": {
                "mode": decision.mode.value,
                "reasons": [reason.value for reason in decision.reasons],
            },
        }
        for scenario in PARITY_SCENARIOS
        for decision in (
            evaluate_system_mode(_input(scenario["input"]), DEFAULT_CONFIG),
        )
    ]

    assert ts_decisions == py_decisions, (
        "Cross-language parity invariant violated: Python and TypeScript system-mode "
        "engines must produce the same decisions for representative inputs"
    )
