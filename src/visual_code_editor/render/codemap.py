"""Codemap generation helpers."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from visual_code_editor.model import WorkspaceModel
from visual_code_editor.render.utils import (
    SRC_DIR,
    collect_symbols_for_files,
    file_hash,
    module_display_label,
    module_sort_key,
    write_text,
)
from visual_code_editor.render.workspace_bridge import workspace_to_site_model


def _coerce_site(site_or_workspace: dict | WorkspaceModel) -> dict:
    if isinstance(site_or_workspace, WorkspaceModel):
        return workspace_to_site_model(site_or_workspace)
    return site_or_workspace


def _source_root(site: dict) -> Path:
    source_root = site.get("sourceRootPath")
    if source_root:
        return Path(source_root)
    return SRC_DIR


def source_line_count(rel_path: str, source_root: Path | None = None) -> int:
    root = source_root or SRC_DIR
    try:
        return len((root / rel_path).read_text(encoding="utf-8", errors="replace").splitlines())
    except OSError:
        return 0


def dsl_quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def dsl_csv(values: list[object]) -> str:
    items = [str(value) for value in values if str(value).strip()]
    return ", ".join(items) if items else "-"


def module_sort_tuple(module_name: str) -> tuple[int, str]:
    return module_sort_key(module_name)


def module_file_symbols(symbols: list[dict], rel_path: str, limit: int = 4) -> list[str]:
    selected = [
        symbol["name"]
        for symbol in sorted(
            (symbol for symbol in symbols if symbol.get("file") == rel_path),
            key=lambda symbol: (symbol.get("line", 0), symbol.get("name", "")),
        )
    ]
    return selected[:limit]


def classify_edge_kind(edge: dict) -> str:
    active_kinds = [
        kind
        for kind, entries in (
            ("import", edge.get("imports", [])),
            ("agent-call", edge.get("agentCalls", [])),
            ("agent-flow", edge.get("agentFlows", [])),
        )
        if entries
    ]
    if len(active_kinds) > 1:
        return "mixed"
    return active_kinds[0] if active_kinds else "import"


def derive_boundary_maps(site: dict) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    boundary_out: defaultdict[str, set[str]] = defaultdict(set)
    boundary_in: defaultdict[str, set[str]] = defaultdict(set)

    for edge in site.get("edges", []):
        from_system = edge.get("from")
        to_system = edge.get("to")
        if from_system:
            boundary_out[from_system].add(to_system)
        if to_system:
            boundary_in[to_system].add(from_system)

    system_ids = sorted(site.get("systems", {}).keys())
    return (
        {sid: sorted(target for target in boundary_out.get(sid, set()) if target) for sid in system_ids},
        {sid: sorted(source for source in boundary_in.get(sid, set()) if source) for sid in system_ids},
    )


def infer_codemap_modules(system: dict, *, source_root: Path | None = None) -> list[dict]:
    inferred: dict[str, dict] = {}
    system_id = system["id"]
    root = source_root or SRC_DIR

    for rel_path in sorted(system.get("files", [])):
        path = Path(rel_path)
        module_name = None
        kind = "module"
        if len(path.parts) == 2 and path.suffix == ".py":
            module_name = "core"
            kind = "core"
        elif len(path.parts) >= 3 and path.parts[1] == "agents" and path.suffix == ".md":
            module_name = "agents"
            kind = "agents"
        elif len(path.parts) >= 3 and path.suffix == ".py":
            module_name = path.parts[1]
            kind = "module"
        if not module_name:
            continue
        inferred.setdefault(
            module_name,
            {
                "systemId": system_id,
                "moduleId": module_name,
                "kind": kind,
                "label": module_display_label(module_name),
                "all_files": [],
                "symbols": [],
                "sourceHash": "",
            },
        )
        inferred[module_name]["all_files"].append(rel_path)

    for module in inferred.values():
        module["all_files"] = sorted(module["all_files"])
        module["symbols"] = collect_symbols_for_files(module["all_files"])
        module["sourceHash"] = file_hash([root / file_path for file_path in module["all_files"]])

    return [inferred[module_name] for module_name in sorted(inferred.keys(), key=module_sort_tuple)]


def modules_for_codemap(site: dict, system: dict) -> list[dict]:
    explicit = sorted(
        (
            module
            for module in site.get("modules", {}).values()
            if module.get("systemId") == system["id"]
        ),
        key=lambda module: module_sort_tuple(module.get("moduleId", "")),
    )
    return explicit or infer_codemap_modules(system, source_root=_source_root(site))


def codemap_global_hash(site: dict) -> str:
    if site.get("workspaceSourceHash"):
        return site["workspaceSourceHash"]
    all_rel_paths = sorted({
        *site.get("rootFiles", []),
        *[
            file_path
            for system in site.get("systems", {}).values()
            for file_path in system.get("files", [])
        ],
    })
    source_root = _source_root(site)
    return file_hash([source_root / rel_path for rel_path in all_rel_paths])


def render_codemap(site_or_workspace: dict | WorkspaceModel) -> str:
    site = _coerce_site(site_or_workspace)
    boundary_out, boundary_in = derive_boundary_maps(site)
    source_root = _source_root(site)
    lines = [
        f"map codemap/v1 build={site['buildId']} root=src hash={codemap_global_hash(site)}",
        "",
    ]

    for cluster in sorted(site.get("clusters", []), key=lambda item: item["id"]):
        lines.append(f'cluster {cluster["id"]} {dsl_quote(cluster.get("description", cluster["label"]))}')
        lines.append(f'  systems: {dsl_csv(sorted(cluster.get("systems", [])))}')
        lines.append(f'  hash: {cluster.get("sourceHash", "")}')
        lines.append("  anchors:")
        for system_id in sorted(cluster.get("systems", [])):
            lines.append(f"    - scope: src/{system_id}/**")
        lines.append("")

    for system_id in sorted(site.get("systems", {}).keys()):
        system = site["systems"][system_id]
        system_modules = modules_for_codemap(site, system)
        agent_ids = sorted(agent["id"] for agent in system.get("agents", []))
        lines.append(f'system {system_id} {dsl_quote(system.get("description", system.get("label", system_id)))}')
        lines.append(f'  cluster: {system.get("cluster", "")}')
        lines.append(f'  modules: {dsl_csv([module.get("moduleId", "") for module in system_modules])}')
        lines.append(f"  agents: {dsl_csv(agent_ids)}")
        lines.append(f'  boundary.out: {dsl_csv(boundary_out.get(system_id, []))}')
        lines.append(f'  boundary.in: {dsl_csv(boundary_in.get(system_id, []))}')
        lines.append(f'  hash: {system.get("sourceHash", "")}')
        lines.append("  anchors:")
        lines.append(f"    - scope: src/{system_id}/**")
        lines.append("")

        for module in system_modules:
            module_id = module.get("moduleId", module.get("id", "module"))
            module_files = sorted(module.get("all_files", []))
            lines.append(f'module {system_id}.{module_id} {dsl_quote(module.get("label", module_display_label(module_id)))}')
            lines.append(f'  kind: {module.get("kind", "module")}')
            lines.append("  files:")
            for rel_path in module_files:
                top_symbols = module_file_symbols(module.get("symbols", []), rel_path)
                lines.append(
                    f"    - src/{rel_path}:{source_line_count(rel_path, source_root)} [{dsl_csv(top_symbols) if top_symbols else ''}]"
                )
            lines.append(f'  hash: {module.get("sourceHash", "")}')
            lines.append("")

    for agent_id in sorted(site.get("agents", {}).keys()):
        agent = site["agents"][agent_id]
        connects_to = sorted(
            agent.get("connectsTo", []),
            key=lambda conn: (conn.get("direction", ""), conn.get("system", ""), conn.get("label", "")),
        )
        lines.append(f'agent {agent_id} {dsl_quote(agent.get("description", agent.get("label", agent_id)))}')
        lines.append(f'  system: {agent.get("systemId", "")}')
        lines.append(f'  model: {agent.get("model", "") or "-"}')
        lines.append(f'  routes: {agent.get("routeCount", 0)}')
        lines.append(f'  invocations: {agent.get("invocationCount", 0)}')
        lines.append(f'  inputs: {dsl_csv(sorted(agent.get("inputs", [])))}')
        lines.append(f'  outputs: {dsl_csv(sorted(agent.get("outputs", [])))}')
        lines.append("  connects_to:")
        for conn in connects_to:
            lines.append(
                f'    - {conn.get("direction", "out")} {conn.get("system", "")} '
                f'{dsl_quote(conn.get("label", conn.get("data", "")))}'
            )
        lines.append("  anchors:")
        lines.append(f'    - file: src/{agent.get("path", "")}')
        lines.append(f'  hash: {agent.get("sourceHash", "")}')
        lines.append("")

    for edge in sorted(site.get("edges", []), key=lambda item: (item["from"], item["to"], item["label"])):
        lines.append(f'edge {edge["from"]} -> {edge["to"]} {dsl_quote(edge.get("label", ""))}')
        lines.append(f'  kind: {classify_edge_kind(edge)}')
        lines.append(f'  weight: {edge.get("weight", 0)}')
        lines.append(f'  mechanism: {dsl_quote(edge.get("mechanism", ""))}')
        lines.append(f'  stores: {dsl_csv(sorted(edge.get("stores", [])))}')
        lines.append("  imports:")
        for imported in sorted(
            edge.get("imports", []),
            key=lambda item: (item.get("file", ""), item.get("line", 0), item.get("module", "")),
        ):
            imported_names = dsl_csv(imported.get("names", []))
            lines.append(
                f'    - {imported.get("file", "")}:{imported.get("line", 0)} '
                f'from {imported.get("module", "")} import {imported_names}'
            )
        lines.append("  agent_calls:")
        for agent_call in sorted(
            edge.get("agentCalls", []),
            key=lambda item: (item.get("callerFile", ""), item.get("line", 0), item.get("taskType", "")),
        ):
            task_type = agent_call.get("taskType", "")
            if task_type:
                lines.append(
                    f'    - {agent_call.get("callerFile", "")}:{agent_call.get("line", 0)} '
                    f'agent_for({dsl_quote(task_type)})'
                )
        lines.append("  anchors:")
        anchor_lines = {
            f"src/{imported.get('file', '')}:{imported.get('line', 0)}"
            for imported in edge.get("imports", [])
            if imported.get("file") and imported.get("line")
        }
        anchor_lines.update(
            f"src/{agent_call.get('callerFile', '')}:{agent_call.get('line', 0)}"
            for agent_call in edge.get("agentCalls", [])
            if agent_call.get("callerFile") and agent_call.get("line")
        )
        if anchor_lines:
            for anchor in sorted(anchor_lines):
                lines.append(f"    - source: {anchor}")
        else:
            fallback_edge_anchors = sorted({
                f"src/{site['agents'][flow['agentId']]['path']}"
                for flow in edge.get("agentFlows", [])
                if flow.get("agentId") in site.get("agents", {})
            })
            for anchor in fallback_edge_anchors:
                lines.append(f"    - source: {anchor}")
        lines.append(f'  hash: {edge.get("sourceHash", "")}')
        lines.append("")

    for store in sorted(site.get("stores", []), key=lambda item: item["id"]):
        reader_ids = sorted(system_id for system_id in store.get("readers", []) if system_id in site.get("systems", {}))
        writer_ids = sorted(system_id for system_id in store.get("writers", []) if system_id in site.get("systems", {}))
        lines.append(f'store {store["id"]} {dsl_quote(store.get("label", store["id"]))}')
        lines.append(f'  location: {store.get("location", "-")}')
        lines.append(f'  tables: {dsl_csv(store.get("tables", []))}')
        lines.append(f'  writers: {dsl_csv(writer_ids)}')
        lines.append(f'  readers: {dsl_csv(reader_ids)}')
        lines.append(f'  hash: {store.get("sourceHash", "")}')
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def write_codemap(site_or_workspace: dict | WorkspaceModel, output_dir: Path) -> Path:
    codemap_path = output_dir / "codemap.map"
    write_text(codemap_path, render_codemap(site_or_workspace))
    return codemap_path
