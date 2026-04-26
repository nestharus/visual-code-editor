"""System-mode degradation engine for viewport-level degraded UX."""

from dataclasses import dataclass
from enum import Enum

from visual_code_editor.model.trust import TrustState


class SystemMode(str, Enum):
    NORMAL = "normal"
    SYSTEM_MODE = "system-mode"


class SystemModeTrigger(str, Enum):
    RUNTIME_UNREACHABLE = "runtime-unreachable"
    AGGREGATE_STALENESS = "aggregate-staleness"
    PROVIDER_UNAVAILABLE = "provider-unavailable"


ALL_SYSTEM_MODES: tuple[SystemMode, ...] = tuple(SystemMode)
ALL_SYSTEM_MODE_TRIGGERS: tuple[SystemModeTrigger, ...] = tuple(SystemModeTrigger)


def system_mode_from_string(value: str) -> SystemMode:
    try:
        return SystemMode(value)
    except ValueError as exc:
        raise ValueError(f"Unknown system mode: {value}") from exc


def system_mode_trigger_from_string(value: str) -> SystemModeTrigger:
    try:
        return SystemModeTrigger(value)
    except ValueError as exc:
        raise ValueError(f"Unknown system-mode trigger: {value}") from exc


def _require_int(value: int | None, field_name: str) -> None:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer")


@dataclass(frozen=True)
class SystemModeConfig:
    agents_unavailable_ms: int = 30000
    stale_element_ratio_threshold: float = 0.40

    def __post_init__(self) -> None:
        _require_int(self.agents_unavailable_ms, "agents_unavailable_ms")
        if self.agents_unavailable_ms <= 0:
            raise ValueError("agents_unavailable_ms must be > 0")

        if (
            not isinstance(self.stale_element_ratio_threshold, int | float)
            or isinstance(self.stale_element_ratio_threshold, bool)
        ):
            raise ValueError("stale_element_ratio_threshold must be numeric")
        if not 0.0 < self.stale_element_ratio_threshold <= 1.0:
            raise ValueError("stale_element_ratio_threshold must be in (0.0, 1.0]")


@dataclass(frozen=True)
class ProviderHealthSnapshot:
    provider_id: str
    trust: TrustState

    def __post_init__(self) -> None:
        if not isinstance(self.provider_id, str):
            raise ValueError("provider_id must be a string")
        if not isinstance(self.trust, TrustState):
            raise ValueError("trust must be a TrustState")


@dataclass(frozen=True)
class SystemModeInput:
    agents_unreachable_since_ms: int | None
    agents_inflight_requests: int
    rendered_llm_element_count: int
    stale_llm_element_count: int
    active_provider_dependencies: tuple[ProviderHealthSnapshot, ...]

    def __post_init__(self) -> None:
        if self.agents_unreachable_since_ms is not None:
            _require_int(
                self.agents_unreachable_since_ms,
                "agents_unreachable_since_ms",
            )
            if self.agents_unreachable_since_ms < 0:
                raise ValueError("agents_unreachable_since_ms must be >= 0")

        _require_int(self.agents_inflight_requests, "agents_inflight_requests")
        _require_int(self.rendered_llm_element_count, "rendered_llm_element_count")
        _require_int(self.stale_llm_element_count, "stale_llm_element_count")

        if self.agents_inflight_requests < 0:
            raise ValueError("agents_inflight_requests must be >= 0")
        if self.rendered_llm_element_count < 0:
            raise ValueError("rendered_llm_element_count must be >= 0")
        if self.stale_llm_element_count < 0:
            raise ValueError("stale_llm_element_count must be >= 0")
        if self.stale_llm_element_count > self.rendered_llm_element_count:
            raise ValueError(
                "stale_llm_element_count must be <= rendered_llm_element_count"
            )

        dependencies = tuple(self.active_provider_dependencies)
        for dependency in dependencies:
            if not isinstance(dependency, ProviderHealthSnapshot):
                raise ValueError(
                    "active_provider_dependencies must contain "
                    "ProviderHealthSnapshot values"
                )
        object.__setattr__(self, "active_provider_dependencies", dependencies)


@dataclass(frozen=True)
class SystemModeDecision:
    mode: SystemMode
    reasons: tuple[SystemModeTrigger, ...]

    def __post_init__(self) -> None:
        if not isinstance(self.mode, SystemMode):
            raise ValueError("mode must be a SystemMode")

        reasons = tuple(self.reasons)
        for reason in reasons:
            if not isinstance(reason, SystemModeTrigger):
                raise ValueError("reasons must contain SystemModeTrigger values")
        object.__setattr__(self, "reasons", reasons)

        if not reasons and self.mode is not SystemMode.NORMAL:
            raise ValueError("SystemModeDecision with empty reasons must be NORMAL")
        if reasons and self.mode is not SystemMode.SYSTEM_MODE:
            raise ValueError("SystemModeDecision with reasons must be SYSTEM_MODE")


DEFAULT_CONFIG: SystemModeConfig = SystemModeConfig()


def evaluate_system_mode(
    input: SystemModeInput,
    config: SystemModeConfig,
) -> SystemModeDecision:
    reasons: list[SystemModeTrigger] = []

    if (
        input.agents_unreachable_since_ms is not None
        and input.agents_unreachable_since_ms >= config.agents_unavailable_ms
        and input.agents_inflight_requests >= 1
    ):
        reasons.append(SystemModeTrigger.RUNTIME_UNREACHABLE)

    if input.rendered_llm_element_count > 0:
        stale_ratio = input.stale_llm_element_count / input.rendered_llm_element_count
        if stale_ratio >= config.stale_element_ratio_threshold:
            reasons.append(SystemModeTrigger.AGGREGATE_STALENESS)

    if any(
        dependency.trust in (TrustState.STALE, TrustState.CONFLICTING)
        for dependency in input.active_provider_dependencies
    ):
        reasons.append(SystemModeTrigger.PROVIDER_UNAVAILABLE)

    reason_tuple = tuple(reasons)
    mode = SystemMode.SYSTEM_MODE if reason_tuple else SystemMode.NORMAL
    return SystemModeDecision(mode=mode, reasons=reason_tuple)
