import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.system_mode import (
    DEFAULT_CONFIG,
    ProviderHealthSnapshot,
    SystemMode,
    SystemModeConfig,
    SystemModeDecision,
    SystemModeInput,
    SystemModeTrigger,
    evaluate_system_mode,
)
from visual_code_editor.model.trust import TrustState


def _input(**overrides):
    values = {
        "agents_unreachable_since_ms": None,
        "agents_inflight_requests": 0,
        "rendered_llm_element_count": 0,
        "stale_llm_element_count": 0,
        "active_provider_dependencies": (),
    }
    values.update(overrides)
    return SystemModeInput(**values)


def _provider(provider_id: str, trust: TrustState) -> ProviderHealthSnapshot:
    return ProviderHealthSnapshot(provider_id=provider_id, trust=trust)


def _decision(input_value: SystemModeInput, config=DEFAULT_CONFIG) -> SystemModeDecision:
    return evaluate_system_mode(input_value, config)


def test_default_config_matches_contract_values():
    assert DEFAULT_CONFIG.agents_unavailable_ms == 30000
    assert DEFAULT_CONFIG.stale_element_ratio_threshold == 0.40


@pytest.mark.parametrize("agents_unavailable_ms", (0, -1))
def test_config_rejects_non_positive_agents_unavailable_ms(agents_unavailable_ms):
    with pytest.raises(ValueError):
        SystemModeConfig(agents_unavailable_ms=agents_unavailable_ms)


@pytest.mark.parametrize("threshold", (0.0, -0.1, 1.01))
def test_config_rejects_stale_threshold_outside_contract_range(threshold):
    with pytest.raises(ValueError):
        SystemModeConfig(stale_element_ratio_threshold=threshold)


@pytest.mark.parametrize(
    "overrides",
    (
        {"agents_inflight_requests": -1},
        {"rendered_llm_element_count": -1},
        {"stale_llm_element_count": -1},
        {"rendered_llm_element_count": 3, "stale_llm_element_count": 4},
    ),
)
def test_input_validation_rejects_invalid_count_combinations(overrides):
    with pytest.raises(ValueError):
        _input(**overrides)


def test_decision_invariant_accepts_matching_mode_and_reason_shapes():
    assert SystemModeDecision(mode=SystemMode.NORMAL, reasons=()).mode is SystemMode.NORMAL
    assert SystemModeDecision(
        mode=SystemMode.SYSTEM_MODE,
        reasons=(SystemModeTrigger.RUNTIME_UNREACHABLE,),
    ).mode is SystemMode.SYSTEM_MODE


@pytest.mark.parametrize(
    ("mode", "reasons"),
    (
        (SystemMode.NORMAL, (SystemModeTrigger.RUNTIME_UNREACHABLE,)),
        (SystemMode.SYSTEM_MODE, ()),
    ),
)
def test_decision_invariant_rejects_mismatched_mode_and_reason_shapes(mode, reasons):
    with pytest.raises(ValueError):
        SystemModeDecision(mode=mode, reasons=reasons)


@pytest.mark.parametrize(
    ("unreachable_ms", "inflight", "expected_triggered"),
    (
        (29999, 1, False),
        (30000, 1, True),
        (30001, 0, False),
        (None, 10, False),
    ),
)
def test_runtime_unreachable_rule_matrix(unreachable_ms, inflight, expected_triggered):
    decision = _decision(
        _input(
            agents_unreachable_since_ms=unreachable_ms,
            agents_inflight_requests=inflight,
        ),
    )

    assert (
        SystemModeTrigger.RUNTIME_UNREACHABLE in decision.reasons
    ) is expected_triggered


@pytest.mark.parametrize(
    ("rendered", "stale", "expected_triggered"),
    (
        (10, 4, True),
        (10, 3, False),
        (0, 0, False),
        (10, 10, True),
    ),
)
def test_aggregate_staleness_rule_including_rendered_zero(rendered, stale, expected_triggered):
    decision = _decision(
        _input(
            rendered_llm_element_count=rendered,
            stale_llm_element_count=stale,
        ),
    )

    assert (
        SystemModeTrigger.AGGREGATE_STALENESS in decision.reasons
    ) is expected_triggered


@pytest.mark.parametrize(
    ("dependencies", "expected_triggered"),
    (
        ((_provider("github", TrustState.STALE),), True),
        ((_provider("github", TrustState.CONFLICTING),), True),
        ((_provider("github", TrustState.GROUNDED),), False),
        ((), False),
        (
            (
                _provider("github", TrustState.ORPHANED),
                _provider("linear", TrustState.CANDIDATE),
            ),
            False,
        ),
    ),
)
def test_provider_unavailable_rule_uses_only_stale_or_conflicting(
    dependencies,
    expected_triggered,
):
    decision = _decision(_input(active_provider_dependencies=dependencies))

    assert (
        SystemModeTrigger.PROVIDER_UNAVAILABLE in decision.reasons
    ) is expected_triggered


def test_multi_trigger_composition_lists_reasons_in_declaration_order():
    decision = _decision(
        _input(
            agents_unreachable_since_ms=30000,
            agents_inflight_requests=1,
            rendered_llm_element_count=10,
            stale_llm_element_count=4,
            active_provider_dependencies=(
                _provider("github", TrustState.STALE),
            ),
        ),
    )

    assert decision.reasons == (
        SystemModeTrigger.RUNTIME_UNREACHABLE,
        SystemModeTrigger.AGGREGATE_STALENESS,
        SystemModeTrigger.PROVIDER_UNAVAILABLE,
    )


@pytest.mark.parametrize(
    "input_value",
    (
        _input(agents_unreachable_since_ms=30000, agents_inflight_requests=1),
        _input(rendered_llm_element_count=10, stale_llm_element_count=4),
        _input(active_provider_dependencies=(_provider("github", TrustState.CONFLICTING),)),
    ),
)
def test_mode_resolution_uses_system_mode_when_any_trigger_fires(input_value):
    decision = _decision(input_value)

    assert decision.mode is SystemMode.SYSTEM_MODE
    assert decision.reasons


def test_mode_resolution_uses_normal_when_no_trigger_fires():
    decision = _decision(_input())

    assert decision.mode is SystemMode.NORMAL
    assert decision.reasons == ()
