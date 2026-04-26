"""Canonical actor registry for workspace state changes.

New actors must be added through proposal cycles, not ad hoc.
"""

from enum import Enum


class ActorKind(str, Enum):
    YOU_THIS_SESSION = "you-this-session"
    YOU_OTHER_SESSION = "you-other-session"
    ANOTHER_USER = "another-user"
    AGENTS_EDIT = "agents:edit"
    AGENTS_DIRECT = "agents:direct"
    AGENTS_SLICE_CONSTRUCTOR = "agents:slice-constructor"
    AGENTS_RELEVANCE_CLASSIFIER = "agents:relevance-classifier"
    AGENTS_PROVIDER_MAPPER = "agents:provider-mapper"
    GENERATOR = "generator"
    CI = "ci"
    GIT_OP = "git-op"
    PROVIDER_GITHUB_SYNC = "provider:github:sync"
    PROVIDER_GITHUB_PR_MERGE = "provider:github:pr-merge"
    PRODUCT_AUTO_FOCUS = "product:auto-focus"
    PRODUCT_DIGEST_SURFACE = "product:digest-surface"
    PRODUCT_THREAD_OPEN = "product:thread-open"
    PRODUCT_LINEAGE_CONFIRM = "product:lineage-confirm"
    UNKNOWN_EXTERNAL = "unknown-external"


class ActorFamily(str, Enum):
    YOU = "you"
    ANOTHER_USER = "another-user"
    AGENTS = "agents"
    GENERATOR = "generator"
    CI = "ci"
    GIT_OP = "git-op"
    PROVIDER = "provider"
    PRODUCT = "product"
    UNKNOWN = "unknown"


ALL_ACTORS: tuple[ActorKind, ...] = tuple(ActorKind)


def family_of(actor: ActorKind) -> ActorFamily:
    actor_value = actor.value if isinstance(actor, ActorKind) else str(actor)

    if actor_value.startswith("you-"):
        return ActorFamily.YOU
    if actor_value == "another-user":
        return ActorFamily.ANOTHER_USER
    if actor_value.startswith("agents:"):
        return ActorFamily.AGENTS
    if actor_value == "generator":
        return ActorFamily.GENERATOR
    if actor_value == "ci":
        return ActorFamily.CI
    if actor_value == "git-op":
        return ActorFamily.GIT_OP
    if actor_value.startswith("provider:"):
        return ActorFamily.PROVIDER
    if actor_value.startswith("product:"):
        return ActorFamily.PRODUCT
    if actor_value == "unknown-external":
        return ActorFamily.UNKNOWN

    raise ValueError(f"Unknown actor kind: {actor_value}")


def actor_from_string(value: str) -> ActorKind:
    try:
        return ActorKind(value)
    except ValueError as exc:
        raise ValueError(f"Unknown actor kind: {value}") from exc
