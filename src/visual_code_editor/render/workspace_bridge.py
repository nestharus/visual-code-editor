"""Bridge helpers from the canonical workspace model to the legacy site model."""

from __future__ import annotations

from dataclasses import asdict, is_dataclass

from visual_code_editor.model import WorkspaceModel


def _copy_mapping(value: object, default: dict | None = None) -> dict:
    if isinstance(value, dict):
        return dict(value)
    return dict(default or {})


def _copy_sequence(value: object) -> list:
    if isinstance(value, list):
        return list(value)
    if isinstance(value, tuple):
        return list(value)
    return []


def _site_record(kind: str, entity_id: str, label: str, description: str, payload: object) -> dict:
    record = _copy_mapping(payload)
    record.setdefault("id", entity_id)
    record.setdefault("label", label)
    if description:
        record.setdefault("description", description)
    if kind == "cluster":
        record.setdefault("href", f"clusters/{entity_id}.html")
        record.setdefault("systems", [])
        record.setdefault("color", "#888")
    elif kind == "system":
        record.setdefault("href", f"systems/{entity_id}.html")
        record.setdefault("agents", [])
        record.setdefault("agentIds", [])
        record.setdefault("files", [])
        record.setdefault("modules", [])
        record.setdefault("internalEdges", [])
        record.setdefault("diagramNodes", [])
        record.setdefault("diagramNodeTargetMap", {})
        record.setdefault("internalFileEdges", [])
        record.setdefault("cluster", "")
        record.setdefault("hasDiagram", False)
    elif kind == "module":
        record.setdefault("href", "")
        record.setdefault("all_files", [])
        record.setdefault("diagramNodes", [])
    elif kind == "agent":
        record.setdefault("href", "")
        record.setdefault("inputs", [])
        record.setdefault("outputs", [])
        record.setdefault("stores", [])
        record.setdefault("connectsTo", [])
        record.setdefault("routes", [])
        record.setdefault("invocations", [])
    elif kind == "store":
        record.setdefault("href", f"stores/{entity_id}.html")
        record.setdefault("tables", [])
        record.setdefault("readers", [])
        record.setdefault("writers", [])
        record.setdefault("readerClusters", [])
        record.setdefault("writerClusters", [])
    record.setdefault("refs", [])
    record.setdefault("sectionRefs", {})
    record.setdefault("symbolCoverage", {"referenced": 0, "total": 0})
    return record


def _fallback_edge_records(workspace: WorkspaceModel) -> list[dict]:
    records: list[dict] = []
    for index, edge in enumerate(workspace.organizational_edges, start=1):
        if edge.kind != "import":
            continue
        record = _copy_mapping(edge.metadata.get("site"))
        record.setdefault("id", f"{edge.source_id}-to-{edge.target_id}-{index}")
        record.setdefault("href", f"edges/{record['id']}.html")
        record.setdefault("from", edge.source_id)
        record.setdefault("to", edge.target_id)
        record.setdefault("label", edge.label)
        record.setdefault("mechanism", edge.metadata.get("mechanism", ""))
        record.setdefault("imports", _copy_sequence(edge.metadata.get("imports")))
        record.setdefault("importCount", len(record["imports"]))
        record.setdefault("agentCalls", [])
        record.setdefault("agentFlows", [])
        record.setdefault("agentIds", [])
        record.setdefault("stores", _copy_sequence(edge.metadata.get("stores")))
        record.setdefault("refs", [])
        record.setdefault("sectionRefs", {})
        record.setdefault("symbolCoverage", {"referenced": 0, "total": 0})
        record.setdefault("sourceHash", edge.metadata.get("sourceHash", ""))
        records.append(record)
    return records


def _serialize_behavioral_collection(collection: dict[str, object]) -> dict[str, object]:
    serialized: dict[str, object] = {}
    for key, value in collection.items():
        if is_dataclass(value):
            serialized[key] = asdict(value)
        else:
            serialized[key] = value
    return serialized


def _serialize_crossrefs(crossrefs: list[object]) -> list[object]:
    serialized: list[object] = []
    for item in crossrefs:
        if is_dataclass(item):
            serialized.append(asdict(item))
        else:
            serialized.append(item)
    return serialized


def workspace_to_site_model(workspace: WorkspaceModel) -> dict:
    """Convert a workspace model into the legacy render site dictionary."""
    metadata = _copy_mapping(workspace.metadata)

    clusters = [
        _site_record(
            "cluster",
            component.id,
            component.label,
            component.description,
            component.metadata.get("site"),
        )
        for component in workspace.components.values()
        if component.kind == "cluster"
    ]
    clusters.sort(key=lambda item: item["id"])

    systems = {
        component.id: _site_record(
            "system",
            component.id,
            component.label,
            component.description,
            component.metadata.get("site"),
        )
        for component in workspace.components.values()
        if component.kind == "system"
    }

    modules: dict[str, dict] = {}
    agents: dict[str, dict] = {}
    for component in workspace.components.values():
        if component.kind == "module":
            record = _site_record(
                "module",
                component.id,
                component.label,
                component.description,
                component.metadata.get("site"),
            )
            modules[record["id"]] = record
        elif component.kind == "agent":
            record = _site_record(
                "agent",
                component.id,
                component.label,
                component.description,
                component.metadata.get("site"),
            )
            agents[record["id"]] = record

    stores = [
        _site_record(
            "store",
            store.id,
            store.label,
            store.description,
            store.metadata.get("site"),
        )
        for store in workspace.stores.values()
    ]
    stores.sort(key=lambda item: item["id"])
    store_lookup = {store["id"]: store for store in stores}

    edge_records = _copy_sequence(metadata.get("edgeSiteRecords"))
    if not edge_records:
        edge_records = _fallback_edge_records(workspace)

    bridge_store_ids = _copy_sequence(metadata.get("bridgeStoreIds"))
    bridge_stores = [store_lookup[store_id] for store_id in bridge_store_ids if store_id in store_lookup]

    default_coverage = {
        "coveredFiles": 0,
        "totalFiles": 0,
        "percentage": 0.0,
        "referencedSymbols": 0,
        "totalSymbols": 0,
        "symbolPercentage": 0.0,
        "bySystem": {},
    }

    behavioral = {
        "artifacts": _serialize_behavioral_collection(workspace.artifacts),
        "lifecycles": _serialize_behavioral_collection(workspace.lifecycles),
        "stages": _serialize_behavioral_collection(workspace.stages),
        "steps": _serialize_behavioral_collection(workspace.steps),
        "codeBlocks": _serialize_behavioral_collection(workspace.code_blocks),
    }

    return {
        "buildId": workspace.build_id,
        "clusters": clusters,
        "clusterPositions": _copy_mapping(metadata.get("clusterPositions")),
        "clusterEdges": _copy_sequence(metadata.get("clusterEdges")),
        "bridgeStores": bridge_stores,
        "rootNodeTargetMap": _copy_mapping(metadata.get("rootNodeTargetMap")),
        "canvas": _copy_mapping(metadata.get("canvas")),
        "systems": systems,
        "modules": modules,
        "agents": agents,
        "edges": edge_records,
        "stores": stores,
        "coverage": _copy_mapping(metadata.get("coverage"), default_coverage),
        "rootFiles": _copy_sequence(metadata.get("rootFiles")),
        "rootRefs": _copy_sequence(metadata.get("rootRefs")),
        "rootSectionRefs": _copy_mapping(metadata.get("rootSectionRefs"), {"overview": []}),
        "rootSourceHash": metadata.get("rootSourceHash", workspace.source_hash),
        "manifest": _copy_mapping(metadata.get("manifest")),
        "sourceRoot": workspace.source_root,
        "sourceRootPath": metadata.get("sourceRootPath", workspace.source_root),
        "workspaceSourceHash": workspace.source_hash,
        "views": _copy_mapping(
            metadata.get("views"),
            {
                "organizational": {"available": True},
                "behavioral": {"available": bool(workspace.lifecycles)},
            },
        ),
        "behavioral": behavioral,
        "crossrefs": _serialize_crossrefs(workspace.crossrefs),
    }


__all__ = ["workspace_to_site_model"]
