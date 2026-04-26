"""Deterministic behavior extraction over parse skeletons."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Callable, Sequence

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.behavior import (
    Behavior,
    BehaviorSliceRole,
    BehaviorSourceSlice,
)
from visual_code_editor.model.trust import TrustSignal, TrustState

from .parse import ParseTree, ParseUnit, ParseUnitKind, parse


Categorizer = Callable[[Sequence[ParseTree]], list[Behavior]]


def _relative_path(workspace_root: str, file_path: str) -> Path:
    path = Path(file_path)
    try:
        return path.resolve().relative_to(Path(workspace_root).resolve())
    except ValueError:
        return path


def behavior_id_for_source(workspace_root: str, file_path: str, name: str) -> str:
    relative = _relative_path(workspace_root, file_path)
    without_extension = relative.with_suffix("")
    dotted_path = ".".join(without_extension.parts)
    return f"behavior:{dotted_path}.{name}"


def _humanize_label(name: str) -> str:
    return name.replace("_", " ").capitalize()


def _source_slice(file_path: str, unit: ParseUnit) -> BehaviorSourceSlice:
    return BehaviorSourceSlice(
        file_path=file_path,
        start_line=unit.start_line,
        end_line=unit.end_line,
        start_col=None,
        end_col=None,
        slice_role=BehaviorSliceRole.BODY,
        discovered_by=ActorKind.AGENTS_SLICE_CONSTRUCTOR,
        confirmed_by=None,
    )


def _behavior(
    workspace_root: str,
    file_path: str,
    unit: ParseUnit,
    qualified_name: str,
    label_name: str,
) -> Behavior:
    return Behavior(
        id=behavior_id_for_source(workspace_root, file_path, qualified_name),
        label=_humanize_label(label_name),
        description=None,
        source_slices=(_source_slice(file_path, unit),),
        trust=TrustSignal(state=TrustState.CANDIDATE, grounding=None),
        parent_behavior_id=None,
        attribution_actor=ActorKind.AGENTS_SLICE_CONSTRUCTOR,
    )


def _collect_function_behaviors(
    workspace_root: str,
    file_path: str,
    unit: ParseUnit,
    parent_names: tuple[str, ...],
    behaviors: list[Behavior],
) -> None:
    if unit.kind == ParseUnitKind.FUNCTION and unit.name is not None:
        qualified_parts = (*parent_names, unit.name)
        behaviors.append(
            _behavior(
                workspace_root,
                file_path,
                unit,
                ".".join(qualified_parts),
                unit.name,
            )
        )
        child_parent_names = qualified_parts
    elif unit.name is not None and unit.kind == ParseUnitKind.CLASS:
        child_parent_names = (*parent_names, unit.name)
    else:
        child_parent_names = parent_names

    for child in unit.children:
        _collect_function_behaviors(
            workspace_root,
            file_path,
            child,
            child_parent_names,
            behaviors,
        )


def _rule_based_categorizer(
    parse_trees: Sequence[ParseTree],
    *,
    workspace_root: str,
) -> list[Behavior]:
    behaviors: list[Behavior] = []

    for tree in parse_trees:
        for unit in tree.units:
            if tree.language != "python" and unit.kind == ParseUnitKind.TOP_LEVEL:
                path_name = Path(tree.file_path).with_suffix("").name
                behaviors.append(
                    _behavior(
                        workspace_root,
                        tree.file_path,
                        unit,
                        "top-level",
                        path_name,
                    )
                )
                continue

            _collect_function_behaviors(
                workspace_root,
                tree.file_path,
                unit,
                (),
                behaviors,
            )

    return behaviors


def rule_based_categorizer(parse_trees: Sequence[ParseTree]) -> list[Behavior]:
    return _rule_based_categorizer(parse_trees, workspace_root=str(Path.cwd()))


DEFAULT_CATEGORIZER: Categorizer = rule_based_categorizer


def _with_trust_state(behavior: Behavior, state: TrustState) -> Behavior:
    return replace(behavior, trust=TrustSignal(state=state, grounding=None))


def reconcile(
    new_behaviors: Sequence[Behavior],
    existing_behaviors: Sequence[Behavior],
) -> list[Behavior]:
    existing_by_id = {behavior.id: behavior for behavior in existing_behaviors}
    seen_ids: set[str] = set()
    reconciled: list[Behavior] = []

    for candidate in new_behaviors:
        seen_ids.add(candidate.id)
        existing = existing_by_id.get(candidate.id)

        if existing is None:
            reconciled.append(candidate)
        elif existing.source_slices == candidate.source_slices:
            reconciled.append(existing)
        else:
            trust = (
                TrustSignal(state=TrustState.CANDIDATE, grounding=None)
                if existing.trust.state == TrustState.STALE
                else existing.trust
            )
            reconciled.append(
                replace(
                    candidate,
                    id=existing.id,
                    trust=trust,
                )
            )

    for existing in existing_behaviors:
        if existing.id in seen_ids:
            continue

        file_exists = any(Path(source_slice.file_path).exists() for source_slice in existing.source_slices)
        state = TrustState.STALE if file_exists else TrustState.ORPHANED
        reconciled.append(_with_trust_state(existing, state))

    return reconciled


def extract_behaviors(
    files: Sequence[str],
    *,
    workspace_root: str,
    existing_behaviors: Sequence[Behavior] = (),
    categorizer: Categorizer = DEFAULT_CATEGORIZER,
) -> list[Behavior]:
    parse_trees = [parse(file_path) for file_path in files]

    if categorizer is DEFAULT_CATEGORIZER:
        new_behaviors = _rule_based_categorizer(
            parse_trees,
            workspace_root=workspace_root,
        )
        return reconcile(new_behaviors, existing_behaviors)

    new_behaviors = categorizer(parse_trees)
    return reconcile(new_behaviors, existing_behaviors)
