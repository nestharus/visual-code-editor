"""Cytoscape element generation helpers."""

from __future__ import annotations

import json
from pathlib import Path

from visual_code_editor.render.utils import compact_json_dumps


def _system_edge_label(edge: dict) -> str:
    edge_kind = edge.get("kind", "import")
    if edge_kind == "agent":
        return "invokes"

    import_count = edge.get("importCount")
    if not isinstance(import_count, int):
        imports = edge.get("imports")
        import_count = len(imports) if isinstance(imports, list) else 0
    if import_count > 0:
        suffix = "" if import_count == 1 else "s"
        return f"{import_count} import{suffix}"

    description = str(edge.get("description", "")).strip()
    if description:
        return description
    return str(edge.get("label", "")).strip()


def render_root_cytoscape(site: dict) -> tuple[str, dict]:
    """Return root Cytoscape elements JSON and edge click metadata."""
    elements: list[dict] = []
    edge_click_map: dict[str, dict] = {}

    for cluster in site["clusters"]:
        elements.append({
            "data": {
                "id": cluster["id"],
                "label": cluster["label"],
                "kind": "cluster",
                "href": cluster.get("href", f'clusters/{cluster["id"]}.html'),
                "color": cluster["color"],
                "systemCount": len(cluster["systems"]),
            },
            "classes": "cluster",
        })

    for store in site.get("bridgeStores", []):
        node_id = f'store__{store["id"]}'
        elements.append({
            "data": {
                "id": node_id,
                "label": store["label"],
                "kind": "store",
                "storeId": store["id"],
                "href": store.get("href", f'stores/{store["id"]}.html'),
            },
            "classes": "store",
        })

    for edge in site["clusterEdges"]:
        edge_pages = [
            item["href"] for item in site["edges"]
            if item.get("fromCluster") == edge["from"] and item.get("toCluster") == edge["to"]
        ][:10]
        edge_id = f'e_{edge["from"]}_{edge["to"]}'
        elements.append({
            "data": {
                "id": edge_id,
                "source": edge["from"],
                "target": edge["to"],
                "label": edge["label"],
                "kind": "cluster-edge",
                "pages": edge_pages,
            },
            "classes": "cluster-edge",
        })
        edge_click_map[edge_id] = {
            "label": edge["label"],
            "from": edge["from"],
            "to": edge["to"],
            "pages": edge_pages,
        }

    for store in site.get("bridgeStores", []):
        node_id = f'store__{store["id"]}'
        writer_clusters = set(store.get("writerClusters", []))
        for writer_cluster in store.get("writerClusters", []):
            elements.append({
                "data": {
                    "id": f"se_{writer_cluster}_{node_id}",
                    "source": writer_cluster,
                    "target": node_id,
                    "kind": "store-write",
                },
                "classes": "store-edge",
            })
        for reader_cluster in store.get("readerClusters", []):
            if reader_cluster in writer_clusters:
                continue
            elements.append({
                "data": {
                    "id": f"se_{node_id}_{reader_cluster}",
                    "source": node_id,
                    "target": reader_cluster,
                    "kind": "store-read",
                },
                "classes": "store-edge",
            })

    return compact_json_dumps(elements), edge_click_map


def render_cluster_cytoscape(site: dict, cluster: dict) -> tuple[str, dict]:
    elements = []
    edge_click_map = {}
    cluster_systems = set(cluster["systems"])
    cluster_target_map = cluster.setdefault("clusterNodeTargetMap", {})

    for system_id in cluster["systems"]:
        system = site["systems"][system_id]
        elements.append({
            "data": {
                "id": system_id,
                "label": system["label"],
                "kind": "system",
                "href": system["href"],
                "color": cluster["color"],
                "fileCount": system.get("fileCount", 0),
                "agentCount": len(system.get("agents", [])),
                "hasDiagram": system.get("hasDiagram", False),
            },
            "classes": "system",
        })
        cluster_target_map[system_id] = {"kind": "system", "id": system_id}

    external_nodes = set()
    for edge in site["edges"]:
        source_id = edge["from"]
        target_id = edge["to"]
        source_in_cluster = source_id in cluster_systems
        target_in_cluster = target_id in cluster_systems
        if not source_in_cluster and not target_in_cluster:
            continue
        if not source_in_cluster:
            external_nodes.add(source_id)
        if not target_in_cluster:
            external_nodes.add(target_id)

        edge_id = f"e_{source_id}_{target_id}"
        elements.append({
            "data": {
                "id": edge_id,
                "source": source_id,
                "target": target_id,
                "label": edge.get("label", ""),
                "kind": "system-edge",
                "href": edge.get("href", ""),
            },
            "classes": "system-edge",
        })
        edge_click_map[edge_id] = {
            "label": edge.get("label", ""),
            "from": source_id,
            "to": target_id,
            "pages": [edge["href"]] if edge.get("href") else [],
        }

    for ext_id in sorted(external_nodes):
        external_system = site["systems"].get(ext_id, {})
        elements.append({
            "data": {
                "id": ext_id,
                "label": external_system.get("label", ext_id),
                "kind": "external",
            },
            "classes": "external",
        })
        cluster_target_map[ext_id] = {"kind": "system", "id": ext_id}

    for store in cluster.get("clusterStores", []):
        node_id = f'store__{store["id"]}'
        elements.append({
            "data": {
                "id": node_id,
                "label": store["label"],
                "kind": "store",
                "storeId": store["id"],
                "href": store.get("href", f'stores/{store["id"]}.html'),
            },
            "classes": "store",
        })
        cluster_target_map[node_id] = {"kind": "store", "id": store["id"]}

        for writer in store.get("writers", []):
            if writer in cluster_systems or writer in external_nodes:
                elements.append({
                    "data": {
                        "id": f"se_{writer}_{node_id}",
                        "source": writer,
                        "target": node_id,
                        "kind": "store-write",
                    },
                    "classes": "store-edge",
                })
        writer_ids = set(store.get("writers", []))
        for reader in store.get("readers", []):
            if (reader in cluster_systems or reader in external_nodes) and reader not in writer_ids:
                elements.append({
                    "data": {
                        "id": f"se_{node_id}_{reader}",
                        "source": node_id,
                        "target": reader,
                        "kind": "store-read",
                    },
                    "classes": "store-edge",
                })

    return compact_json_dumps(elements), edge_click_map


def render_system_cytoscape(site: dict, system: dict) -> str:
    elements: list[dict] = []
    cluster_color = system.get("clusterColor", "#888")

    module_entries = [
        site["modules"][module_id]
        for module_id in system.get("modules", [])
        if site["modules"][module_id].get("diagramNodes")
    ]

    for module in module_entries:
        elements.append({
            "data": {
                "id": f'mod_{module["id"]}',
                "label": module["label"],
                "kind": "module-group",
            },
            "classes": "module-group",
        })

    for module in module_entries:
        for node in module.get("diagramNodes", []):
            node_kind = node.get("kind", "file")
            elements.append({
                "data": {
                    "id": node["id"],
                    "label": Path(node["path"]).name,
                    "kind": node_kind,
                    "parent": f'mod_{module["id"]}',
                    "moduleId": module["id"],
                    "path": node["path"],
                    "color": "#9D7BEE" if node_kind == "agent" else cluster_color,
                },
                "classes": "agent-node" if node_kind == "agent" else "file-node",
            })

    for edge in system.get("internalFileEdges", []):
        edge_kind = edge.get("kind", "import")
        imports = edge.get("imports")
        import_count = edge.get("importCount")
        if not isinstance(import_count, int):
            import_count = len(imports) if isinstance(imports, list) else 0
        elements.append({
            "data": {
                "id": f'fe_{edge["from"]}_{edge["to"]}',
                "source": edge["from"],
                "target": edge["to"],
                "kind": edge_kind,
                "label": _system_edge_label(edge),
                "description": edge.get("description", ""),
                "imports": imports if isinstance(imports, list) else [],
                "importCount": import_count,
            },
            "classes": "agent-invoke" if edge_kind == "agent" else "file-import",
        })

    return compact_json_dumps(elements)


def render_cytoscape_elements(site: dict) -> list[dict[str, object]]:
    """Render the root Cytoscape elements for a site model."""
    elements_json, _edge_click_map = render_root_cytoscape(site)
    return json.loads(elements_json)
