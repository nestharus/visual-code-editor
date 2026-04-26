"""Deterministic fallback relevance classifier."""

from dataclasses import dataclass
from enum import Enum
from types import MappingProxyType
from typing import Mapping

from visual_code_editor.model.actors import ActorFamily, ActorKind, family_of
from visual_code_editor.model.user_context import (
    ChangeEvent,
    ChangeEventKind,
    ChangeEventTier,
    UserContext,
)


ALWAYS_IMMEDIATE_KINDS = frozenset(
    {
        ChangeEventKind.ENTITY_RENAMED,
        ChangeEventKind.ENTITY_SPLIT,
        ChangeEventKind.ENTITY_MERGED,
        ChangeEventKind.ENTITY_UNMATCHED,
        ChangeEventKind.REVIEW_THREAD_UPDATE,
        ChangeEventKind.AGENTS_RUNTIME_HEALTH,
    }
)

ALWAYS_STASHED_KINDS = frozenset(
    {
        ChangeEventKind.PROVIDER_SYNC,
        ChangeEventKind.CI_RUN_FINISHED,
    }
)


def _actor_tier_weight(actor: ActorKind) -> float:
    if actor is ActorKind.YOU_OTHER_SESSION:
        return 1.0
    if actor is ActorKind.YOU_THIS_SESSION:
        return 0.1
    if actor is ActorKind.ANOTHER_USER:
        return 0.9
    if actor is ActorKind.UNKNOWN_EXTERNAL:
        return 0.5

    family = family_of(actor)
    if family is ActorFamily.AGENTS:
        return 0.7
    if family is ActorFamily.PRODUCT:
        return 0.5
    if family is ActorFamily.PROVIDER:
        return 0.4
    if family is ActorFamily.CI:
        return 0.3
    if family is ActorFamily.GIT_OP:
        return 0.3
    if family is ActorFamily.GENERATOR:
        return 0.2

    raise ValueError(f"Unknown actor kind: {actor}")


ACTOR_TIER_WEIGHT = MappingProxyType(
    {actor: _actor_tier_weight(actor) for actor in ActorKind}
)


class ClassifierReason(str, Enum):
    ALWAYS_IMMEDIATE = "always-immediate"
    ALWAYS_STASHED = "always-stashed"
    BLOCKING = "blocking"
    SCORED = "scored"


@dataclass(frozen=True)
class ClassifierConfig:
    recency_window_ms: int = 600_000
    recency_weight: float = 0.30
    on_surface_weight: float = 0.25
    provider_weight: float = 0.10
    actor_weight: float = 0.20
    context_match_weight: float = 0.15
    immediate_threshold: float = 0.55
    stashed_threshold: float = 0.20
    provider_tier_weight: Mapping[ActorKind, float] = MappingProxyType({})

    def __post_init__(self) -> None:
        if self.recency_window_ms <= 0:
            raise ValueError("ClassifierConfig recency_window_ms must be > 0")

        for field_name in (
            "recency_weight",
            "on_surface_weight",
            "provider_weight",
            "actor_weight",
            "context_match_weight",
        ):
            if getattr(self, field_name) < 0:
                raise ValueError(f"ClassifierConfig {field_name} must be >= 0")

        if not 0 <= self.immediate_threshold <= 1:
            raise ValueError(
                "ClassifierConfig immediate_threshold must be between 0 and 1"
            )
        if not 0 <= self.stashed_threshold <= 1:
            raise ValueError(
                "ClassifierConfig stashed_threshold must be between 0 and 1"
            )
        if self.immediate_threshold < self.stashed_threshold:
            raise ValueError(
                "ClassifierConfig immediate_threshold must be >= stashed_threshold"
            )

        provider_tier_weight = dict(self.provider_tier_weight)
        for actor, weight in provider_tier_weight.items():
            if not isinstance(actor, ActorKind):
                raise ValueError(
                    "ClassifierConfig provider_tier_weight keys must be ActorKind"
                )
            if weight < 0:
                raise ValueError(
                    "ClassifierConfig provider_tier_weight values must be >= 0"
                )
            if weight > 1:
                raise ValueError(
                    "ClassifierConfig provider_tier_weight values must be <= 1"
                )

        object.__setattr__(
            self,
            "provider_tier_weight",
            MappingProxyType(provider_tier_weight),
        )


@dataclass(frozen=True)
class ClassifierDecision:
    tier: ChangeEventTier
    total_score: float
    reason: ClassifierReason
    rules_fired: tuple[str, ...]


DEFAULT_CONFIG = ClassifierConfig()


def classify(
    event: ChangeEvent,
    context: UserContext,
    config: ClassifierConfig,
    now_ms: int,
) -> ClassifierDecision:
    if event.kind in ALWAYS_IMMEDIATE_KINDS:
        return ClassifierDecision(
            tier=ChangeEventTier.IMMEDIATE,
            total_score=1.0,
            reason=ClassifierReason.ALWAYS_IMMEDIATE,
            rules_fired=("always-immediate",),
        )

    if event.kind in ALWAYS_STASHED_KINDS:
        return ClassifierDecision(
            tier=ChangeEventTier.STASHED,
            total_score=0.0,
            reason=ClassifierReason.ALWAYS_STASHED,
            rules_fired=("always-stashed",),
        )

    if event.blocking:
        return ClassifierDecision(
            tier=ChangeEventTier.IMMEDIATE,
            total_score=1.0,
            reason=ClassifierReason.BLOCKING,
            rules_fired=("blocking",),
        )

    affected_entity_ids = set(event.affected_entity_ids)
    opened_surface_ids = {surface.entity_id for surface in context.opened_surfaces}
    active_context_ids = set(context.active_task_ids) | set(context.active_slice_ids)

    recency_score = _clamp(
        (now_ms - event.timestamp_ms) / config.recency_window_ms,
        0.0,
        1.0,
    )
    on_surface_score = (
        1.0 if affected_entity_ids.intersection(opened_surface_ids) else 0.0
    )
    provider_tier_score = config.provider_tier_weight.get(event.actor, 0.0)
    actor_tier_score = ACTOR_TIER_WEIGHT[event.actor]
    context_match_score = (
        0.5 if affected_entity_ids.intersection(active_context_ids) else 0.0
    )

    raw_score = (
        (1 - recency_score) * config.recency_weight
        + on_surface_score * config.on_surface_weight
        + provider_tier_score * config.provider_weight
        + actor_tier_score * config.actor_weight
        + context_match_score * config.context_match_weight
    )
    weight_sum = (
        config.recency_weight
        + config.on_surface_weight
        + config.provider_weight
        + config.actor_weight
        + config.context_match_weight
    )
    total_score = _clamp(raw_score / weight_sum, 0.0, 1.0) if weight_sum > 0 else 0.0

    if total_score >= config.immediate_threshold:
        tier = ChangeEventTier.IMMEDIATE
    elif total_score >= config.stashed_threshold:
        tier = ChangeEventTier.STASHED
    else:
        tier = ChangeEventTier.SUPPRESSED

    return ClassifierDecision(
        tier=tier,
        total_score=total_score,
        reason=ClassifierReason.SCORED,
        rules_fired=_scored_rules_fired(
            recency_score=recency_score,
            on_surface_score=on_surface_score,
            provider_tier_score=provider_tier_score,
            actor_tier_score=actor_tier_score,
            context_match_score=context_match_score,
            config=config,
        ),
    )


def _scored_rules_fired(
    *,
    recency_score: float,
    on_surface_score: float,
    provider_tier_score: float,
    actor_tier_score: float,
    context_match_score: float,
    config: ClassifierConfig,
) -> tuple[str, ...]:
    rules: list[str] = []
    if config.recency_weight > 0 and (1 - recency_score) > 0:
        rules.append("recency")
    if config.on_surface_weight > 0 and on_surface_score > 0:
        rules.append("on-surface")
    if config.provider_weight > 0 and provider_tier_score > 0:
        rules.append("provider-tier")
    if config.actor_weight > 0 and actor_tier_score > 0:
        rules.append("actor-tier")
    if config.context_match_weight > 0 and context_match_score > 0:
        rules.append("context-match")
    return tuple(rules)


def _clamp(value: float, lower: float, upper: float) -> float:
    return min(max(value, lower), upper)
