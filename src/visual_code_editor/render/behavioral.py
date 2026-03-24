"""Behavioral runtime generation helpers."""

from __future__ import annotations

from itertools import pairwise

from visual_code_editor.render.mermaid import mermaid_label, mermaid_node
from visual_code_editor.render.utils import compact_json_dumps


ROLE_KEYWORDS = {
    "proposal": ("proposal", "proposer", "plan", "planning", "design", "microstrategy", "strategy"),
    "alignment": ("align", "alignment", "judge", "adjudicat", "readiness", "risk", "review"),
    "research": ("research", "explor", "scan", "discover", "dossier", "question", "substrate"),
    "implementation": ("implement", "implementation", "code change", "execute", "execution", "dispatch", "fix"),
    "verification": ("verify", "verification", "test", "testing", "validate", "validation", "qa", "check"),
    "coordination": ("coordination", "reconciliation", "reconcile", "bridge", "blocker", "resolver", "consequence"),
}

BACK_EDGE_RULES = (
    {
        "id": "alignment-revision",
        "source_roles": {"alignment"},
        "target_roles": {"proposal"},
        "label": "Misaligned -> revise",
        "max_distance": 2,
    },
    {
        "id": "verification-rework",
        "source_roles": {"verification"},
        "target_roles": {"implementation"},
        "label": "Failed verification -> rework",
        "max_distance": 2,
    },
    {
        "id": "verification-reresearch",
        "source_roles": {"verification"},
        "target_roles": {"research"},
        "label": "Unsupported -> re-research",
        "max_distance": 2,
    },
    {
        "id": "coordination-fix",
        "source_roles": {"coordination"},
        "target_roles": {"implementation"},
        "label": "Blocked -> fix",
        "max_distance": 3,
    },
)


def _mermaid_safe_id(node_id: str) -> str:
    """Replace characters invalid in Mermaid IDs."""
    return node_id.replace(":", "_").replace(" ", "_").replace("-", "_")


def _behavioral_root_order(lifecycles: dict[str, dict]) -> list[dict]:
    priority = [
        "lifecycle:problem-framing",
        "lifecycle:philosophy-bootstrap",
        "lifecycle:section-execution",
        "lifecycle:code-change-realization",
    ]
    ordered = []
    seen: set[str] = set()
    for lifecycle_id in priority:
        lifecycle = lifecycles.get(lifecycle_id)
        if lifecycle:
            ordered.append(lifecycle)
            seen.add(lifecycle_id)
    for lifecycle in sorted(lifecycles.values(), key=lambda item: item["id"]):
        if lifecycle["id"] not in seen:
            ordered.append(lifecycle)
    return ordered


def _artifact_lookup(site: dict) -> dict[str, dict]:
    return dict(site.get("behavioral", {}).get("artifacts", {}))


def _component_lookup(site: dict) -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    for collection_name in ("systems", "modules", "agents"):
        collection = site.get(collection_name, {})
        values = collection.values() if isinstance(collection, dict) else collection
        for item in values:
            lookup[item["id"]] = item
    for cluster in site.get("clusters", []):
        lookup[cluster["id"]] = cluster
    for store in site.get("stores", []):
        lookup[store["id"]] = store
    return lookup


def _short_artifact_label(label: str) -> str:
    """Shorten artifact paths to just the filename."""
    # Strip parenthetical descriptions
    if " (" in label:
        label = label.split(" (")[0]
    # Strip path prefix
    if "/" in label:
        label = label.rsplit("/", 1)[-1]
    # Strip file extension
    for ext in (".json", ".md", ".yaml", ".py", ".txt"):
        if label.endswith(ext):
            label = label[:-len(ext)]
            break
    return label.replace("-", " ").replace("_", " ").strip()


def _artifact_labels(artifact_lookup: dict[str, dict], artifact_ids: list[str]) -> list[str]:
    return [
        _short_artifact_label(artifact_lookup[artifact_id]["label"])
        for artifact_id in artifact_ids
        if artifact_id in artifact_lookup
    ]


def _truncate_edge_labels(labels: list[str], limit: int = 2) -> list[str]:
    filtered = [label for label in labels if label]
    if len(filtered) <= limit:
        return filtered
    return filtered[:limit] + ["..."]


def _format_edge_label(labels: list[str], fallback: str) -> str:
    truncated = _truncate_edge_labels(labels)
    if truncated:
        return ", ".join(truncated)
    return fallback or "→"


def _component_refs(component_lookup: dict[str, dict], component_ids: list[str]) -> list[dict]:
    refs = []
    for component_id in component_ids:
        component = component_lookup.get(component_id)
        if not component:
            continue
        refs.append({
            "id": component_id,
            "label": component.get("label", component_id),
            "href": component.get("href", ""),
            "kind": component.get("kind", ""),
        })
    return refs


def _store_refs(site: dict, store_ids: list[str]) -> list[dict]:
    lookup = {store["id"]: store for store in site.get("stores", [])}
    refs = []
    for store_id in store_ids:
        store = lookup.get(store_id)
        if not store:
            continue
        refs.append({"id": store_id, "label": store["label"], "href": store["href"]})
    return refs


def _collect_stage_store_ids(site: dict, stage: dict) -> list[str]:
    artifact_lookup = _artifact_lookup(site)
    store_ids: set[str] = set()
    for artifact_id in stage.get("input_artifact_ids", []) + stage.get("output_artifact_ids", []):
        store_ids.update(artifact_lookup.get(artifact_id, {}).get("store_ids", []))
    return sorted(store_ids)


def _lifecycle_edge_labels(site: dict, lifecycle: dict, source_stage_id: str, target_stage_id: str) -> str:
    artifact_lookup = _artifact_lookup(site)
    source_stage = site["behavioral"]["stages"].get(source_stage_id, {})
    target_stage = site["behavioral"]["stages"].get(target_stage_id, {})
    shared = [
        artifact_id
        for artifact_id in source_stage.get("output_artifact_ids", [])
        if artifact_id in set(target_stage.get("input_artifact_ids", []))
    ]
    labels = _artifact_labels(artifact_lookup, shared)
    if not labels:
        labels = _artifact_labels(artifact_lookup, source_stage.get("output_artifact_ids", []))
    fallback = f"{source_stage.get('label', source_stage_id)} → {target_stage.get('label', target_stage_id)}"
    return _format_edge_label(labels, fallback)


def _stage_edge_labels(site: dict, stage: dict, source_step_id: str, target_step_id: str) -> str:
    artifact_lookup = _artifact_lookup(site)
    source_step = site["behavioral"]["steps"].get(source_step_id, {})
    target_step = site["behavioral"]["steps"].get(target_step_id, {})
    shared = [
        artifact_id
        for artifact_id in source_step.get("output_artifact_ids", [])
        if artifact_id in set(target_step.get("input_artifact_ids", []))
    ]
    labels = _artifact_labels(artifact_lookup, shared)
    if not labels:
        labels = _artifact_labels(artifact_lookup, source_step.get("output_artifact_ids", []))
    fallback = f"{source_step.get('label', source_step_id)} → {target_step.get('label', target_step_id)}"
    return _format_edge_label(labels, fallback)


def _record_text(record: dict) -> str:
    parts = [record.get("label", ""), record.get("description", "")]
    return " ".join(str(part).strip().lower() for part in parts if str(part).strip())


def _detect_roles(record: dict) -> set[str]:
    text = _record_text(record)
    roles: set[str] = set()
    for role, keywords in ROLE_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            roles.add(role)
    return roles


def _shared_artifact_ids(source_record: dict, target_record: dict, *, output_key: str, input_key: str) -> list[str]:
    target_inputs = set(target_record.get(input_key, []))
    return [
        artifact_id
        for artifact_id in source_record.get(output_key, [])
        if artifact_id in target_inputs
    ]


def _shared_component_ids(source_record: dict, target_record: dict, *, component_key: str) -> list[str]:
    target_components = set(target_record.get(component_key, []))
    return [
        component_id
        for component_id in source_record.get(component_key, [])
        if component_id in target_components
    ]


def _match_back_edge_rule(source_record: dict, target_record: dict, distance: int) -> dict | None:
    source_roles = _detect_roles(source_record)
    target_roles = _detect_roles(target_record)
    for rule in BACK_EDGE_RULES:
        if distance > rule["max_distance"]:
            continue
        if source_roles & rule["source_roles"] and target_roles & rule["target_roles"]:
            return rule
    return None


def _discover_back_edges(
    ordered_ids: list[str],
    records: dict[str, dict],
    *,
    input_key: str,
    output_key: str,
    component_key: str,
) -> list[dict]:
    edges: list[dict] = []
    seen_pairs: set[tuple[str, str, str]] = set()

    for source_index in range(1, len(ordered_ids)):
        source_id = ordered_ids[source_index]
        source_record = records.get(source_id, {})
        for target_index in range(source_index - 1, -1, -1):
            target_id = ordered_ids[target_index]
            target_record = records.get(target_id, {})
            distance = source_index - target_index
            rule = _match_back_edge_rule(source_record, target_record, distance)
            if not rule:
                continue

            shared_artifacts = _shared_artifact_ids(
                target_record,
                source_record,
                output_key=output_key,
                input_key=input_key,
            )
            shared_components = _shared_component_ids(
                source_record,
                target_record,
                component_key=component_key,
            )
            if not shared_artifacts and not shared_components and distance > 1:
                continue

            pair = (source_id, target_id, rule["id"])
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            edges.append({
                "source": source_id,
                "target": target_id,
                "label": rule["label"],
                "shared_artifact_ids": shared_artifacts,
            })
            break

    return edges


def _append_behavioral_edge(
    elements: list[dict],
    edge_click_map: dict[str, dict],
    mermaid_lines: list[str],
    artifact_lookup: dict[str, dict],
    *,
    edge_id: str,
    source_id: str,
    target_id: str,
    label: str,
    source_label: str,
    target_label: str,
    source_kind: str,
    target_kind: str,
    source_artifact_ids: list[str],
    target_artifact_ids: list[str],
    shared_artifact_ids: list[str],
    back_edge: bool = False,
) -> None:
    classes = "behavioral-edge behavioral-back-edge" if back_edge else "behavioral-edge"
    elements.append({
        "data": {
            "id": edge_id,
            "source": source_id,
            "target": target_id,
            "label": label,
            "kind": "behavioral-edge",
            "loop": back_edge,
        },
        "classes": classes,
    })
    edge_click_map[edge_id] = {
        "id": edge_id,
        "label": label,
        "from": source_id,
        "fromLabel": source_label,
        "to": target_id,
        "toLabel": target_label,
        "sourceKind": source_kind,
        "targetKind": target_kind,
        "artifacts": _artifact_labels(artifact_lookup, shared_artifact_ids) or _artifact_labels(artifact_lookup, source_artifact_ids),
        "sharedArtifacts": _artifact_labels(artifact_lookup, shared_artifact_ids),
        "sourceArtifacts": _artifact_labels(artifact_lookup, source_artifact_ids),
        "targetArtifacts": _artifact_labels(artifact_lookup, target_artifact_ids),
        "loop": back_edge,
    }
    arrow = "-.->" if back_edge else "-->"
    if label:
        mermaid_lines.append(
            f'    {_mermaid_safe_id(source_id)} {arrow}|"{mermaid_label(label)}"| {_mermaid_safe_id(target_id)}'
        )
    else:
        mermaid_lines.append(f"    {_mermaid_safe_id(source_id)} {arrow} {_mermaid_safe_id(target_id)}")


def build_behavioral_runtime(site: dict) -> dict:
    behavioral = dict(site.get("behavioral", {}))
    lifecycles = dict(behavioral.get("lifecycles", {}))
    stages = dict(behavioral.get("stages", {}))
    steps = dict(behavioral.get("steps", {}))
    code_blocks = dict(behavioral.get("codeBlocks", {}))
    artifact_lookup = _artifact_lookup(site)
    component_lookup = _component_lookup(site)

    if not lifecycles:
        return {"available": False}

    ordered_lifecycles = _behavioral_root_order(lifecycles)
    root_elements: list[dict] = []
    root_mermaid_lines = ["flowchart LR"]
    root_target_map: dict[str, dict] = {}
    root_edge_click_map: dict[str, dict] = {}

    for lifecycle in ordered_lifecycles:
        label = lifecycle["label"]
        root_elements.append({
            "data": {
                "id": lifecycle["id"],
                "label": label,
                "kind": "lifecycle",
            },
            "classes": "behavioral-lifecycle",
        })
        root_mermaid_lines.append(mermaid_node(_mermaid_safe_id(lifecycle["id"]), label))
        root_target_map[lifecycle["id"]] = {"kind": "lifecycle", "id": lifecycle["id"]}

    for source, target in pairwise(ordered_lifecycles):
        edge_id = f"be_{source['id']}_{target['id']}"
        # Use last stage outputs / first stage inputs for edge label accuracy
        source_stage_ids = source.get("stage_ids", [])
        target_stage_ids = target.get("stage_ids", [])
        last_source_stage = stages.get(source_stage_ids[-1], {}) if source_stage_ids else {}
        first_target_stage = stages.get(target_stage_ids[0], {}) if target_stage_ids else {}
        source_edge_artifacts = last_source_stage.get("output_artifact_ids", []) or source.get("exit_artifact_ids", [])
        target_edge_artifacts = first_target_stage.get("input_artifact_ids", []) or target.get("entry_artifact_ids", [])
        shared_root_artifacts = [
            artifact_id
            for artifact_id in source_edge_artifacts
            if artifact_id in set(target_edge_artifacts)
        ]
        shared_root_labels = _artifact_labels(artifact_lookup, shared_root_artifacts)
        source_root_labels = _artifact_labels(artifact_lookup, source_edge_artifacts)
        root_label = _format_edge_label(
            shared_root_labels or source_root_labels,
            f"{source['label']} → {target['label']}",
        )
        _append_behavioral_edge(
            root_elements,
            root_edge_click_map,
            root_mermaid_lines,
            artifact_lookup,
            edge_id=edge_id,
            source_id=source["id"],
            target_id=target["id"],
            label=root_label,
            source_label=source["label"],
            target_label=target["label"],
            source_kind="lifecycle",
            target_kind="lifecycle",
            source_artifact_ids=source_edge_artifacts,
            target_artifact_ids=target_edge_artifacts,
            shared_artifact_ids=shared_root_artifacts,
            back_edge=False,
        )

    root_record_map = {
        lifecycle["id"]: {
            "label": lifecycle.get("label", ""),
            "description": " ".join(
                [lifecycle.get("description", "")]
                + [
                    stages[stage_id]["label"]
                    for stage_id in lifecycle.get("stage_ids", [])
                    if stage_id in stages
                ]
            ).strip(),
            "entry_artifact_ids": list(lifecycle.get("entry_artifact_ids", [])),
            "exit_artifact_ids": list(lifecycle.get("exit_artifact_ids", [])),
            "component_ids": list(lifecycle.get("component_ids", [])),
        }
        for lifecycle in ordered_lifecycles
    }
    for index, back_edge in enumerate(
        _discover_back_edges(
            [lifecycle["id"] for lifecycle in ordered_lifecycles],
            root_record_map,
            input_key="entry_artifact_ids",
            output_key="exit_artifact_ids",
            component_key="component_ids",
        ),
        start=1,
    ):
        source_record = root_record_map[back_edge["source"]]
        target_record = root_record_map[back_edge["target"]]
        _append_behavioral_edge(
            root_elements,
            root_edge_click_map,
            root_mermaid_lines,
            artifact_lookup,
            edge_id=f"be_loop_root_{index}",
            source_id=back_edge["source"],
            target_id=back_edge["target"],
            label=back_edge["label"],
            source_label=source_record["label"],
            target_label=target_record["label"],
            source_kind="lifecycle",
            target_kind="lifecycle",
            source_artifact_ids=source_record.get("exit_artifact_ids", []),
            target_artifact_ids=target_record.get("entry_artifact_ids", []),
            shared_artifact_ids=back_edge["shared_artifact_ids"],
            back_edge=True,
        )

    lifecycle_runtime: dict[str, dict] = {}
    stage_runtime: dict[str, dict] = {}

    for lifecycle in ordered_lifecycles:
        lifecycle_elements: list[dict] = []
        lifecycle_target_map: dict[str, dict] = {}
        lifecycle_edge_click_map: dict[str, dict] = {}
        lifecycle_mermaid_lines = ["flowchart LR"]
        store_ids: set[str] = set()

        for stage_id in lifecycle.get("stage_ids", []):
            stage = stages.get(stage_id)
            if not stage:
                continue
            lifecycle_elements.append({
                "data": {
                    "id": stage_id,
                    "label": stage["label"],
                    "kind": "stage",
                },
                "classes": "behavioral-stage",
            })
            lifecycle_target_map[stage_id] = {"kind": "stage", "id": stage_id}
            lifecycle_mermaid_lines.append(mermaid_node(_mermaid_safe_id(stage_id), stage["label"]))
            store_ids.update(_collect_stage_store_ids(site, stage))

        for source_stage_id, target_stage_id in pairwise(lifecycle.get("stage_ids", [])):
            source_stage = stages.get(source_stage_id, {})
            target_stage = stages.get(target_stage_id, {})
            shared_stage_artifacts = [
                artifact_id
                for artifact_id in source_stage.get("output_artifact_ids", [])
                if artifact_id in set(target_stage.get("input_artifact_ids", []))
            ]
            label = _lifecycle_edge_labels(site, lifecycle, source_stage_id, target_stage_id)
            edge_id = f"be_{source_stage_id}_{target_stage_id}"
            _append_behavioral_edge(
                lifecycle_elements,
                lifecycle_edge_click_map,
                lifecycle_mermaid_lines,
                artifact_lookup,
                edge_id=edge_id,
                source_id=source_stage_id,
                target_id=target_stage_id,
                label=label,
                source_label=source_stage.get("label", source_stage_id),
                target_label=target_stage.get("label", target_stage_id),
                source_kind="stage",
                target_kind="stage",
                source_artifact_ids=source_stage.get("output_artifact_ids", []),
                target_artifact_ids=target_stage.get("input_artifact_ids", []),
                shared_artifact_ids=shared_stage_artifacts,
                back_edge=False,
            )

        for index, back_edge in enumerate(
            _discover_back_edges(
                list(lifecycle.get("stage_ids", [])),
                stages,
                input_key="input_artifact_ids",
                output_key="output_artifact_ids",
                component_key="executor_component_ids",
            ),
            start=1,
        ):
            source_stage = stages.get(back_edge["source"], {})
            target_stage = stages.get(back_edge["target"], {})
            _append_behavioral_edge(
                lifecycle_elements,
                lifecycle_edge_click_map,
                lifecycle_mermaid_lines,
                artifact_lookup,
                edge_id=f"be_loop_{lifecycle['id']}_{index}",
                source_id=back_edge["source"],
                target_id=back_edge["target"],
                label=back_edge["label"],
                source_label=source_stage.get("label", back_edge["source"]),
                target_label=target_stage.get("label", back_edge["target"]),
                source_kind="stage",
                target_kind="stage",
                source_artifact_ids=source_stage.get("output_artifact_ids", []),
                target_artifact_ids=target_stage.get("input_artifact_ids", []),
                shared_artifact_ids=back_edge["shared_artifact_ids"],
                back_edge=True,
            )

        lifecycle_runtime[lifecycle["id"]] = {
            "id": lifecycle["id"],
            "label": lifecycle["label"],
            "description": lifecycle.get("description", ""),
            "entryArtifacts": _artifact_labels(artifact_lookup, lifecycle.get("entry_artifact_ids", [])),
            "exitArtifacts": _artifact_labels(artifact_lookup, lifecycle.get("exit_artifact_ids", [])),
            "components": _component_refs(component_lookup, lifecycle.get("component_ids", [])),
            "stores": _store_refs(site, sorted(store_ids)),
            "elements": compact_json_dumps(lifecycle_elements),
            "mermaid": "\n".join(lifecycle_mermaid_lines),
            "nodeTargetMap": lifecycle_target_map,
            "edgeClickMap": lifecycle_edge_click_map,
            "stageIds": list(lifecycle.get("stage_ids", [])),
        }

        for stage_id in lifecycle.get("stage_ids", []):
            stage = stages.get(stage_id)
            if not stage:
                continue
            stage_elements: list[dict] = []
            stage_target_map: dict[str, dict] = {}
            stage_edge_click_map: dict[str, dict] = {}
            stage_mermaid_lines = ["flowchart TD"]
            for step_id in stage.get("step_ids", []):
                step = steps.get(step_id)
                if not step:
                    continue
                stage_elements.append({
                    "data": {
                        "id": step_id,
                        "label": step["label"],
                        "kind": "step",
                    },
                    "classes": "behavioral-step",
                })
                stage_target_map[step_id] = {"kind": "step", "id": step_id}
                stage_mermaid_lines.append(mermaid_node(_mermaid_safe_id(step_id), step["label"]))

            for source_step_id, target_step_id in pairwise(stage.get("step_ids", [])):
                source_step = steps.get(source_step_id, {})
                target_step = steps.get(target_step_id, {})
                shared_step_artifacts = [
                    artifact_id
                    for artifact_id in source_step.get("output_artifact_ids", [])
                    if artifact_id in set(target_step.get("input_artifact_ids", []))
                ]
                label = _stage_edge_labels(site, stage, source_step_id, target_step_id)
                edge_id = f"be_{source_step_id}_{target_step_id}"
                _append_behavioral_edge(
                    stage_elements,
                    stage_edge_click_map,
                    stage_mermaid_lines,
                    artifact_lookup,
                    edge_id=edge_id,
                    source_id=source_step_id,
                    target_id=target_step_id,
                    label=label,
                    source_label=source_step.get("label", source_step_id),
                    target_label=target_step.get("label", target_step_id),
                    source_kind="step",
                    target_kind="step",
                    source_artifact_ids=source_step.get("output_artifact_ids", []),
                    target_artifact_ids=target_step.get("input_artifact_ids", []),
                    shared_artifact_ids=shared_step_artifacts,
                    back_edge=False,
                )

            for index, back_edge in enumerate(
                _discover_back_edges(
                    list(stage.get("step_ids", [])),
                    steps,
                    input_key="input_artifact_ids",
                    output_key="output_artifact_ids",
                    component_key="component_ids",
                ),
                start=1,
            ):
                source_step = steps.get(back_edge["source"], {})
                target_step = steps.get(back_edge["target"], {})
                _append_behavioral_edge(
                    stage_elements,
                    stage_edge_click_map,
                    stage_mermaid_lines,
                    artifact_lookup,
                    edge_id=f"be_loop_{stage_id}_{index}",
                    source_id=back_edge["source"],
                    target_id=back_edge["target"],
                    label=back_edge["label"],
                    source_label=source_step.get("label", back_edge["source"]),
                    target_label=target_step.get("label", back_edge["target"]),
                    source_kind="step",
                    target_kind="step",
                    source_artifact_ids=source_step.get("output_artifact_ids", []),
                    target_artifact_ids=target_step.get("input_artifact_ids", []),
                    shared_artifact_ids=back_edge["shared_artifact_ids"],
                    back_edge=True,
                )

            stage_runtime[stage_id] = {
                "id": stage_id,
                "label": stage["label"],
                "description": stage.get("description", ""),
                "lifecycleId": lifecycle["id"],
                "inputArtifacts": _artifact_labels(artifact_lookup, stage.get("input_artifact_ids", [])),
                "outputArtifacts": _artifact_labels(artifact_lookup, stage.get("output_artifact_ids", [])),
                "components": _component_refs(component_lookup, stage.get("executor_component_ids", [])),
                "stores": _store_refs(site, _collect_stage_store_ids(site, stage)),
                "elements": compact_json_dumps(stage_elements),
                "mermaid": "\n".join(stage_mermaid_lines),
                "nodeTargetMap": stage_target_map,
                "edgeClickMap": stage_edge_click_map,
                "stepIds": list(stage.get("step_ids", [])),
            }

    step_runtime: dict[str, dict] = {}
    for step_id, step in steps.items():
        step_runtime[step_id] = {
            "id": step_id,
            "label": step["label"],
            "description": step.get("description", ""),
            "stageId": step["stage_id"],
            "inputArtifacts": _artifact_labels(artifact_lookup, step.get("input_artifact_ids", [])),
            "outputArtifacts": _artifact_labels(artifact_lookup, step.get("output_artifact_ids", [])),
            "components": _component_refs(component_lookup, step.get("component_ids", [])),
            "codeBlocks": [code_blocks[code_id] for code_id in step.get("code_block_ids", []) if code_id in code_blocks],
        }

    return {
        "available": True,
        "defaultView": "behavioral",
        "root": {
            "elements": compact_json_dumps(root_elements),
            "mermaid": "\n".join(root_mermaid_lines),
            "nodeTargetMap": root_target_map,
            "edgeClickMap": root_edge_click_map,
        },
        "lifecycles": lifecycle_runtime,
        "stages": stage_runtime,
        "steps": step_runtime,
        "artifacts": artifact_lookup,
    }
