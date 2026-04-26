import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import (
    ALL_ACTORS,
    ActorFamily,
    ActorKind,
    actor_from_string,
    family_of,
)


CONTRACT_ACTORS = (
    ("YOU_THIS_SESSION", "you-this-session", ActorFamily.YOU),
    ("YOU_OTHER_SESSION", "you-other-session", ActorFamily.YOU),
    ("ANOTHER_USER", "another-user", ActorFamily.ANOTHER_USER),
    ("AGENTS_EDIT", "agents:edit", ActorFamily.AGENTS),
    ("AGENTS_DIRECT", "agents:direct", ActorFamily.AGENTS),
    ("AGENTS_SLICE_CONSTRUCTOR", "agents:slice-constructor", ActorFamily.AGENTS),
    ("AGENTS_RELEVANCE_CLASSIFIER", "agents:relevance-classifier", ActorFamily.AGENTS),
    ("AGENTS_PROVIDER_MAPPER", "agents:provider-mapper", ActorFamily.AGENTS),
    ("GENERATOR", "generator", ActorFamily.GENERATOR),
    ("CI", "ci", ActorFamily.CI),
    ("GIT_OP", "git-op", ActorFamily.GIT_OP),
    ("PROVIDER_GITHUB_SYNC", "provider:github:sync", ActorFamily.PROVIDER),
    ("PROVIDER_GITHUB_PR_MERGE", "provider:github:pr-merge", ActorFamily.PROVIDER),
    ("PRODUCT_AUTO_FOCUS", "product:auto-focus", ActorFamily.PRODUCT),
    ("PRODUCT_DIGEST_SURFACE", "product:digest-surface", ActorFamily.PRODUCT),
    ("PRODUCT_THREAD_OPEN", "product:thread-open", ActorFamily.PRODUCT),
    ("PRODUCT_LINEAGE_CONFIRM", "product:lineage-confirm", ActorFamily.PRODUCT),
    ("UNKNOWN_EXTERNAL", "unknown-external", ActorFamily.UNKNOWN),
)

CONTRACT_VALUES = tuple(actor_value for _, actor_value, _ in CONTRACT_ACTORS)


@pytest.mark.parametrize(("member_name", "actor_value", "_family"), CONTRACT_ACTORS)
def test_actor_enum_contains_each_contract_member(member_name, actor_value, _family):
    assert hasattr(ActorKind, member_name), (
        f"Enum membership invariant violated: ActorKind is missing {member_name}"
    )
    assert getattr(ActorKind, member_name).value == actor_value, (
        f"Stability invariant violated: ActorKind.{member_name}.value must be {actor_value!r}"
    )


@pytest.mark.parametrize(("member_name", "actor_value", "_family"), CONTRACT_ACTORS)
def test_actor_from_string_accepts_every_contract_value(member_name, actor_value, _family):
    assert actor_from_string(actor_value) is getattr(ActorKind, member_name), (
        f"actor_from_string strictness invariant violated: {actor_value!r} must parse "
        f"to ActorKind.{member_name}"
    )


@pytest.mark.parametrize(
    "invalid_value",
    (
        "",
        "not-a-real-actor",
        "provider:hypothetical-test:sync",
        "agents",
        "product:",
        "YOU_THIS_SESSION",
    ),
)
def test_actor_from_string_rejects_unknown_values(invalid_value):
    with pytest.raises(ValueError, match=invalid_value):
        actor_from_string(invalid_value)


def test_all_actors_order_matches_contract_order():
    assert tuple(actor.value for actor in ALL_ACTORS) == CONTRACT_VALUES, (
        "ALL_ACTORS order invariant violated: tuple must match the contract declaration order"
    )


def test_all_actors_contains_exactly_the_contract_members():
    assert len(ALL_ACTORS) == 18, "Enum membership invariant violated: registry must expose 18 actors"
    assert set(actor.value for actor in ALL_ACTORS) == set(CONTRACT_VALUES), (
        "Enum membership invariant violated: ALL_ACTORS must contain exactly the contract actors"
    )


@pytest.mark.parametrize(("member_name", "_actor_value", "expected_family"), CONTRACT_ACTORS)
def test_each_actor_maps_to_exactly_one_contract_family(
    member_name,
    _actor_value,
    expected_family,
):
    actor = getattr(ActorKind, member_name)

    resolved_family = family_of(actor)

    assert isinstance(resolved_family, ActorFamily), (
        f"Family resolution invariant violated: {actor.value!r} must resolve to an ActorFamily"
    )
    assert resolved_family is expected_family, (
        f"Family resolution invariant violated: {actor.value!r} must resolve to "
        f"{expected_family.value!r}"
    )


def test_family_resolution_is_exhaustive_and_no_family_is_empty():
    actors_by_family: dict[ActorFamily, list[ActorKind]] = {family: [] for family in ActorFamily}

    for actor in ALL_ACTORS:
        actors_by_family[family_of(actor)].append(actor)

    empty_families = [family.value for family, actors in actors_by_family.items() if not actors]
    assert empty_families == [], (
        "Family closure invariant violated: every ActorFamily must have at least one actor, "
        f"but these families were empty: {empty_families}"
    )

    assigned_actor_count = sum(len(actors) for actors in actors_by_family.values())
    assert assigned_actor_count == len(ALL_ACTORS), (
        "Family closure invariant violated: every actor must map to exactly one family"
    )


def test_provider_prefix_probe_resolves_without_registering_fixture_actor():
    fixture_actor = "provider:hypothetical-test:sync"

    assert fixture_actor not in CONTRACT_VALUES, (
        "Family prefix probe invariant violated: the hypothetical provider actor must not be "
        "added to the registry"
    )
    assert family_of(fixture_actor) is ActorFamily.PROVIDER, (
        "Family rules invariant violated: provider:* actors must resolve to provider family "
        "by prefix"
    )
