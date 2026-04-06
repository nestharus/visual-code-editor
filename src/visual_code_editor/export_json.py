"""Export diagram data as JSON for the SolidJS app."""

from __future__ import annotations

import json
from pathlib import Path

from visual_code_editor.render.behavioral import build_behavioral_runtime
from visual_code_editor.render.cytoscape import (
    render_cluster_cytoscape,
    render_root_cytoscape,
    render_system_cytoscape,
)
from visual_code_editor.render.mermaid import (
    render_cluster_mermaid,
    render_root_mermaid,
    render_system_mermaid,
)


def _site_component_lookup(site: dict) -> dict[str, dict]:
    """Return site components keyed by id when available."""
    raw_components = site.get("components", {})
    if isinstance(raw_components, dict):
        return {
            component_id: component
            for component_id, component in raw_components.items()
            if isinstance(component, dict)
        }
    if isinstance(raw_components, list):
        return {
            component["id"]: component
            for component in raw_components
            if isinstance(component, dict) and component.get("id")
        }
    return {}


def _matching_paths(node_path: str) -> set[str]:
    if not node_path:
        return set()
    return {
        node_path,
        f"src/{node_path}",
        Path(node_path).name,
    }


def _file_description(
    component_lookup: dict[str, dict], module_data: dict, node_path: str
) -> str:
    component = component_lookup.get(f"file:{node_path}", {})
    if component.get("description"):
        return component["description"]

    matching_paths = _matching_paths(node_path)
    for overview in module_data.get("fileOverviews", []):
        overview_path = overview.get("path", "")
        if overview_path in matching_paths or Path(overview_path).name in matching_paths:
            return overview.get("summary", "")
    return ""


def _file_symbols(module_data: dict, node_path: str) -> list[str]:
    matching_paths = _matching_paths(node_path)
    module_files = set(module_data.get("all_files", []))
    has_single_file = len(module_files) == 1 and node_path in module_files
    formatted_symbols: list[str] = []

    for symbol in module_data.get("symbols", []):
        if not isinstance(symbol, dict):
            continue
        symbol_path = (
            symbol.get("file")
            or symbol.get("path")
            or symbol.get("displayPath")
            or symbol.get("filename")
            or ""
        )
        if symbol_path:
            matches_file = symbol_path in matching_paths or Path(symbol_path).name in matching_paths
        else:
            matches_file = has_single_file
        if not matches_file:
            continue

        symbol_type = symbol.get("type", "symbol")
        symbol_name = symbol.get("name", "").strip()
        if not symbol_name:
            continue
        formatted_symbols.append(f"{symbol_type} {symbol_name}")

    return formatted_symbols


def _diagram_node_labels(site: dict, system_data: dict) -> dict[str, str]:
    labels: dict[str, str] = {}

    for node in system_data.get("diagramNodes", []):
        node_id = node.get("id")
        if node_id:
            labels[node_id] = node.get("label", node_id)

    for module_id in system_data.get("modules", []):
        module_data = site.get("modules", {}).get(module_id, {})
        for node in module_data.get("diagramNodes", []):
            node_id = node.get("id")
            if node_id:
                labels[node_id] = node.get("label", node_id)

    return labels


def _related_file_edges(system_data: dict, node_id: str, node_labels: dict[str, str]) -> tuple[list[str], list[str]]:
    imports: list[str] = []
    imported_by: list[str] = []

    for edge in system_data.get("internalFileEdges", []):
        if edge.get("from") == node_id:
            target_id = edge.get("to", "")
            imports.append(node_labels.get(target_id, target_id))
        elif edge.get("to") == node_id:
            source_id = edge.get("from", "")
            imported_by.append(node_labels.get(source_id, source_id))

    return imports, imported_by


def _extract_system_ids_from_step(step: dict) -> list[str]:
    """Extract organizational system IDs from a step's component_ids."""
    systems = []
    for comp_id in step.get("component_ids", []):
        # component_ids are like ['agent:dispatch:agent-monitor', 'dispatch']
        # The bare system name is the one without a colon prefix
        if ":" not in comp_id:
            systems.append(comp_id)
        elif comp_id.startswith("agent:"):
            # agent:system:name -> extract system
            parts = comp_id.split(":")
            if len(parts) >= 2:
                systems.append(parts[1])
    return list(dict.fromkeys(systems))  # dedupe preserving order


def _find_connecting_edge_id(
    elements: list[dict], from_node: str, to_node: str,
) -> str | None:
    """Find an edge ID in root elements connecting two nodes."""
    for el in elements:
        data = el.get("data", {})
        src = data.get("source")
        tgt = data.get("target")
        if src and tgt:
            if (src == from_node and tgt == to_node) or (src == to_node and tgt == from_node):
                return data.get("id", f"e_{src}_{tgt}")
    return None


def _build_combined_scenarios(site: dict, root_elements: list[dict]) -> dict:
    """Build CombinedScenario data from workspace behavioral+organizational data."""
    ws = site.get("_workspace", {})
    lifecycles = ws.get("lifecycles", {})
    all_stages = ws.get("stages", {})
    all_steps = ws.get("steps", {})

    if not lifecycles:
        return {"scenarios": {}, "bindings": {}}

    scenarios: dict[str, dict] = {}
    bindings: dict[str, list[str]] = {}

    # Build edge lookup for root organizational diagram
    edge_lookup: dict[tuple[str, str], str] = {}
    for el in root_elements:
        data = el.get("data", {})
        src = data.get("source")
        tgt = data.get("target")
        if src and tgt:
            edge_id = data.get("id", f"e_{src}_{tgt}")
            edge_lookup[(src, tgt)] = edge_id
            edge_lookup[(tgt, src)] = edge_id

    # Build set of known org node IDs (root level = clusters + stores)
    org_node_ids = set()
    for el in root_elements:
        data = el.get("data", {})
        if data.get("id") and not data.get("source"):
            org_node_ids.add(data["id"])

    # Map system IDs to their parent cluster IDs
    system_to_cluster: dict[str, str] = {}
    for cluster in site.get("clusters", []):
        cluster_id = cluster["id"]
        for sys_id in cluster.get("systems", []):
            system_to_cluster[sys_id] = cluster_id

    for lc_id, lifecycle in lifecycles.items():
        scenario_id = f"scenario:{lc_id.replace('lifecycle:', '')}"
        beats: list[dict] = []
        all_participants: set[str] = set()
        beat_index = 0

        stage_ids = lifecycle.get("stage_ids", [])

        for stage_id in stage_ids:
            stage = all_stages.get(stage_id)
            if not stage:
                continue

            step_ids = stage.get("step_ids", [])
            # Track the system sequence for this stage
            prev_system = None

            for step_id in step_ids:
                step = all_steps.get(step_id)
                if not step:
                    continue

                systems = _extract_system_ids_from_step(step)
                # Resolve to root-level nodes: systems → clusters, or keep if already a cluster
                resolved = []
                for s in systems:
                    if s in org_node_ids:
                        resolved.append(s)
                    elif s in system_to_cluster:
                        resolved.append(system_to_cluster[s])
                resolved = list(dict.fromkeys(resolved))  # dedupe
                if not resolved:
                    continue

                current_system = resolved[0]
                all_participants.update(resolved)

                if prev_system and prev_system != current_system:
                    # Create a path beat: flow from prev_system to current_system
                    edge_ids = []
                    edge_key = (prev_system, current_system)
                    if edge_key in edge_lookup:
                        edge_ids.append(edge_lookup[edge_key])

                    beat_id = f"beat-{scenario_id}-{beat_index}"
                    beats.append({
                        "id": beat_id,
                        "kind": "path",
                        "caption": f"{step.get('label', step_id)}",
                        "fromNodeId": prev_system,
                        "toNodeId": current_system,
                        "edgeIds": edge_ids,
                        "participantNodeIds": [prev_system, current_system],
                    })
                    beat_index += 1

                prev_system = current_system

        if beats:
            scenarios[scenario_id] = {
                "id": scenario_id,
                "behaviorId": lc_id,
                "title": lifecycle.get("label", lc_id),
                "caption": lifecycle.get("description", ""),
                "participants": sorted(all_participants),
                "beats": beats,
            }
            bindings[lc_id] = [scenario_id]

            # Also bind stages to the same scenario for now
            for stage_id in stage_ids:
                bindings[stage_id] = [scenario_id]

    return {"scenarios": scenarios, "bindings": bindings}


def export_diagram_json(site: dict) -> dict:
    """Build a complete JSON export of all diagram data for the SolidJS app.

    Returns a dict with all organizational and behavioral diagram data
    at every drill-down level, keyed for easy lookup by route params.
    """
    # --- Organizational ---
    root_elements_json, root_edge_click_map = render_root_cytoscape(site)
    root_elements = json.loads(root_elements_json)

    # Add labels to store edges (the renderer doesn't include them)
    for element in root_elements:
        kind = element.get("data", {}).get("kind", "")
        if kind == "store-write" and not element.get("data", {}).get("label"):
            element["data"]["label"] = "write"
        elif kind == "store-read" and not element.get("data", {}).get("label"):
            element["data"]["label"] = "read"

    clusters: dict[str, dict] = {}
    for cluster in site.get("clusters", []):
        cluster_id = cluster["id"]
        cluster_elements_json, cluster_edge_click_map = render_cluster_cytoscape(
            site, cluster
        )
        cluster_elements = json.loads(cluster_elements_json)
        clusters[cluster_id] = {
            "id": cluster_id,
            "label": cluster.get("label", cluster_id),
            "color": cluster.get("color", "#888"),
            "elements": cluster_elements,
            "edgeClickMap": cluster_edge_click_map,
            "nodeTargetMap": cluster.get("clusterNodeTargetMap", {}),
        }

    systems: dict[str, dict] = {}
    for system_id, system in site.get("systems", {}).items():
        system_elements_json = render_system_cytoscape(site, system)
        system_elements = json.loads(system_elements_json)

        # Ensure file-import edges have labels (fallback to "imports")
        for element in system_elements:
            data = element.get("data", {})
            if data.get("source") and not data.get("label"):
                kind = data.get("kind", "import")
                if kind == "agent":
                    data["label"] = "invokes"
                else:
                    data["label"] = "imports"
        systems[system_id] = {
            "id": system_id,
            "label": system.get("label", system_id),
            "clusterId": system.get("clusterId", ""),
            "clusterColor": system.get("clusterColor", "#888"),
            "elements": system_elements,
            "fileCount": system.get("fileCount", 0),
            "agentCount": len(system.get("agents", [])),
        }

    # --- Behavioral ---
    behavioral = build_behavioral_runtime(site)

    # Flatten behavioral data for route-based lookup
    behavioral_root_elements = []
    behavioral_root_edge_click_map: dict = {}
    behavioral_root_mermaid = ""
    lifecycles: dict[str, dict] = {}
    stages: dict[str, dict] = {}

    if behavioral.get("available"):
        root_data = behavioral.get("root", {})
        behavioral_root_elements = json.loads(root_data.get("elements", "[]"))
        behavioral_root_edge_click_map = root_data.get("edgeClickMap", {})
        behavioral_root_mermaid = root_data.get("mermaid", "")

        for lc_id, lc_data in behavioral.get("lifecycles", {}).items():
            lifecycles[lc_id] = {
                **lc_data,
                "elements": json.loads(lc_data.get("elements", "[]")),
            }

        for stage_id, stage_data in behavioral.get("stages", {}).items():
            stages[stage_id] = {
                **stage_data,
                "elements": json.loads(stage_data.get("elements", "[]")),
            }

    # --- Detail records for panels ---
    # Flatten all entities into a lookup for the detail panel
    details: dict[str, dict] = {}
    component_lookup = _site_component_lookup(site)

    for cluster in site.get("clusters", []):
        details[cluster["id"]] = {
            "kind": "cluster",
            "id": cluster["id"],
            "label": cluster.get("label", ""),
            "href": cluster.get("href", ""),
            "color": cluster.get("color", ""),
            "systemCount": len(cluster.get("systems", [])),
            "systems": cluster.get("systems", []),
        }

    for sys_id, sys_data in site.get("systems", {}).items():
        details[sys_id] = {
            "kind": "system",
            "id": sys_id,
            "label": sys_data.get("label", ""),
            "href": sys_data.get("href", ""),
            "fileCount": sys_data.get("fileCount", 0),
            "modules": list(sys_data.get("modules", [])),
            "agents": [a if isinstance(a, str) else a.get("label", a.get("id", "")) for a in sys_data.get("agents", [])],
        }

    for mod_id, mod_data in site.get("modules", {}).items():
        details[mod_id] = {
            "kind": "module",
            "id": mod_id,
            "label": mod_data.get("label", ""),
            "href": mod_data.get("href", ""),
            "path": mod_data.get("path", ""),
            "fileCount": mod_data.get("fileCount", 0),
        }

    for system_id, system_data in site.get("systems", {}).items():
        node_labels = _diagram_node_labels(site, system_data)
        diagram_node_target_map = system_data.get("diagramNodeTargetMap", {})
        for module_id in system_data.get("modules", []):
            module_data = site.get("modules", {}).get(module_id)
            if not module_data:
                continue
            for node in module_data.get("diagramNodes", []):
                # Resolve agent record through diagramNodeTargetMap
                _node_target = diagram_node_target_map.get(node["id"], {})
                _agent_key = _node_target.get("id", node["id"]) if _node_target.get("kind") == "agent" else node["id"]
                node_detail = {
                    **site.get("agents", {}).get(_agent_key, {}),
                    "kind": node.get("kind", "file"),
                    "id": node["id"],
                    "label": node.get("label", ""),
                    "path": node.get("path", ""),
                    "moduleId": module_id,
                    "systemId": system_id,
                }

                node_path = node.get("path", "")
                description = _file_description(component_lookup, module_data, node_path)
                if description and not node_detail.get("description"):
                    node_detail["description"] = description

                symbols = _file_symbols(module_data, node_path)
                if symbols:
                    node_detail["symbols"] = symbols

                imports, imported_by = _related_file_edges(
                    system_data, node["id"], node_labels
                )
                if imports:
                    node_detail["imports"] = imports
                if imported_by:
                    node_detail["importedBy"] = imported_by

                node_target = diagram_node_target_map.get(node["id"], {})
                if not node_detail.get("href") and node_target.get("kind") == "module":
                    target_module = site.get("modules", {}).get(node_target.get("id"), {})
                    href = target_module.get("href", "")
                    if href:
                        node_detail["href"] = href

                details[node["id"]] = node_detail

        # System-level file/agent edge details (fe_ prefix)
        for edge in system_data.get("internalFileEdges", []):
            edge_kind = edge.get("kind", "import")
            edge_id = f'fe_{edge["from"]}_{edge["to"]}'
            source_label = node_labels.get(edge["from"], edge["from"])
            target_label = node_labels.get(edge["to"], edge["to"])
            edge_detail: dict = {
                "kind": "edge",
                "id": edge_id,
                "label": edge.get("label", "imports" if edge_kind != "agent" else "invokes"),
                "from": edge["from"],
                "to": edge["to"],
                "fromLabel": source_label,
                "toLabel": target_label,
                "mechanism": edge_kind,
                "systemId": system_id,
            }
            edge_imports = edge.get("imports")
            if isinstance(edge_imports, list) and edge_imports:
                edge_detail["imports"] = edge_imports
            edge_desc = edge.get("description")
            if edge_desc:
                edge_detail["description"] = edge_desc
            details[edge_id] = edge_detail

    if behavioral.get("available"):
        for lc_id, lc_data in behavioral.get("lifecycles", {}).items():
            details[lc_id] = {
                "kind": "lifecycle",
                "id": lc_id,
                "label": lc_data.get("label", ""),
                "description": lc_data.get("description", ""),
                "entryArtifacts": lc_data.get("entryArtifacts", []),
                "exitArtifacts": lc_data.get("exitArtifacts", []),
                "stageIds": lc_data.get("stageIds", []),
            }

        for stage_id, stage_data in behavioral.get("stages", {}).items():
            details[stage_id] = {
                "kind": "stage",
                "id": stage_id,
                "label": stage_data.get("label", ""),
                "description": stage_data.get("description", ""),
                "lifecycleId": stage_data.get("lifecycleId", ""),
                "inputArtifacts": stage_data.get("inputArtifacts", []),
                "outputArtifacts": stage_data.get("outputArtifacts", []),
                "stepIds": stage_data.get("stepIds", []),
            }

        for step_id, step_data in behavioral.get("steps", {}).items():
            details[step_id] = {
                "kind": "step",
                "id": step_id,
                "label": step_data.get("label", ""),
                "description": step_data.get("description", ""),
            }

        # Behavioral edge details (lifecycle→stage and stage→step edges)
        # Use the already-parsed lifecycle/stage elements dicts
        for collection in [lifecycles, stages]:
            for _parent_id, parent_data in collection.items():
                for element in parent_data.get("elements", []):
                    if not isinstance(element, dict):
                        continue
                    edge_data = element.get("data", {})
                    if not edge_data.get("source"):
                        continue
                    edge_id = edge_data.get("id", "")
                    if not edge_id or edge_id in details:
                        continue
                    source_label = details.get(edge_data["source"], {}).get("label", edge_data["source"])
                    target_label = details.get(edge_data["target"], {}).get("label", edge_data["target"])
                    details[edge_id] = {
                        "kind": "edge",
                        "id": edge_id,
                        "label": edge_data.get("label", ""),
                        "from": edge_data["source"],
                        "to": edge_data["target"],
                        "fromLabel": source_label,
                        "toLabel": target_label,
                        "mechanism": "artifact flow" if not edge_data.get("loop") else "feedback loop",
                    }

    for edge in site.get("edges", []):
        edge_id = f'e_{edge["from"]}_{edge["to"]}'
        details[edge_id] = {
            "kind": "edge",
            "id": edge_id,
            "label": edge.get("label", ""),
            "href": edge.get("href", ""),
            "from": edge["from"],
            "to": edge["to"],
            "mechanism": edge.get("mechanism", ""),
        }

    for store in site.get("stores", []):
        details[store["id"]] = {
            "kind": "store",
            "id": store["id"],
            "label": store.get("label", ""),
            "href": store.get("href", ""),
        }

    # --- Root and cluster edge details (aggregated edges not in site["edges"]) ---
    cluster_labels = {c["id"]: c.get("label", c["id"]) for c in site.get("clusters", [])}
    system_labels = {s_id: s.get("label", s_id) for s_id, s in site.get("systems", {}).items()}

    # Root-level edges (cluster-to-cluster)
    for element in root_elements:
        edge_data = element.get("data", {})
        if not edge_data.get("source"):
            continue
        edge_id = edge_data.get("id", "")
        if not edge_id or edge_id in details:
            continue
        click_info = root_edge_click_map.get(edge_id, {})
        details[edge_id] = {
            "kind": "edge",
            "id": edge_id,
            "label": edge_data.get("label", click_info.get("label", "")),
            "from": edge_data["source"],
            "to": edge_data["target"],
            "fromLabel": cluster_labels.get(edge_data["source"], edge_data["source"]),
            "toLabel": cluster_labels.get(edge_data["target"], edge_data["target"]),
            "mechanism": edge_data.get("kind", ""),
        }

    # Cluster-level edges (system-to-system within a cluster)
    for cluster_id, cluster_data in clusters.items():
        cluster_click_map = cluster_data.get("edgeClickMap", {})
        for element in cluster_data.get("elements", []):
            edge_data = element.get("data", {})
            if not edge_data.get("source"):
                continue
            edge_id = edge_data.get("id", "")
            if not edge_id or edge_id in details:
                continue
            click_info = cluster_click_map.get(edge_id, {})
            details[edge_id] = {
                "kind": "edge",
                "id": edge_id,
                "label": edge_data.get("label", click_info.get("label", "")),
                "from": edge_data["source"],
                "to": edge_data["target"],
                "fromLabel": system_labels.get(edge_data["source"], edge_data["source"]),
                "toLabel": system_labels.get(edge_data["target"], edge_data["target"]),
                "mechanism": edge_data.get("kind", ""),
            }

    # --- Mermaid text for organizational ---
    org_root_mermaid = render_root_mermaid(site)

    # Add mermaid to clusters
    for cluster in site.get("clusters", []):
        cid = cluster["id"]
        if cid in clusters:
            clusters[cid]["mermaid"] = render_cluster_mermaid(site, cluster)

    # Add mermaid to systems
    for sys_id, sys_data in site.get("systems", {}).items():
        if sys_id in systems:
            systems[sys_id]["mermaid"] = render_system_mermaid(site, sys_data)

    # --- Combined scenarios ---
    combined = _build_combined_scenarios(site, root_elements)

    return {
        "organizational": {
            "root": {
                "elements": root_elements,
                "edgeClickMap": root_edge_click_map,
                "mermaid": org_root_mermaid,
            },
            "clusters": clusters,
            "systems": systems,
        },
        "behavioral": {
            "available": behavioral.get("available", False),
            "root": {
                "elements": behavioral_root_elements,
                "edgeClickMap": behavioral_root_edge_click_map,
                "mermaid": behavioral_root_mermaid,
            },
            "lifecycles": lifecycles,
            "stages": stages,
        },
        "combined": combined,
        "details": details,
    }


def write_diagram_json(site: dict, output_path: Path) -> None:
    """Write diagram JSON to a file."""
    data = export_diagram_json(site)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(data, separators=(",", ":")))
