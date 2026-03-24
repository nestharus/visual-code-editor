"""Mermaid text generation helpers."""

from __future__ import annotations

from html import escape


def mermaid_label(text: str) -> str:
    sanitized = escape(text.replace("\\", "\\\\").replace('"', '\\"'), quote=False)
    return sanitized.replace("\n", "<br/>")


def mermaid_node(node_id: str, label: str, shape: str = "rect") -> str:
    rendered_label = mermaid_label(label)
    if shape == "store":
        return f'    {node_id}{{{{"{rendered_label}"}}}}'
    return f'    {node_id}["{rendered_label}"]'


def render_root_mermaid(site: dict) -> str:
    lines = ["flowchart LR"]
    store_ids: list[str] = []

    for cluster in site["clusters"]:
        lines.append(mermaid_node(cluster["id"], cluster["label"]))
    for store in site.get("bridgeStores", []):
        node_id = f'store__{store["id"]}'
        store_ids.append(node_id)
        lines.append(mermaid_node(node_id, store["label"], "store"))

    for edge in site["clusterEdges"]:
        label = mermaid_label(edge.get("label", ""))
        if label:
            lines.append(f'    {edge["from"]} -->|"{label}"| {edge["to"]}')
        else:
            lines.append(f'    {edge["from"]} --> {edge["to"]}')

    for store in site.get("bridgeStores", []):
        node_id = f'store__{store["id"]}'
        writer_clusters = set(store.get("writerClusters", []))
        for writer_cluster in store.get("writerClusters", []):
            lines.append(f"    {writer_cluster} -.-> {node_id}")
        for reader_cluster in store.get("readerClusters", []):
            if reader_cluster in writer_clusters:
                continue
            lines.append(f"    {node_id} -.-> {reader_cluster}")

    if store_ids:
        lines.append(f'    class {",".join(store_ids)} store')
    lines.append("    classDef store fill:#1a1a10,stroke:#d29922,color:#e6edf3")
    return "\n".join(lines)


def render_cluster_mermaid(site: dict, cluster: dict) -> str:
    lines = ["flowchart TD"]
    cluster_systems = set(cluster["systems"])
    external_nodes: list[str] = []
    relevant_edges: list[dict] = []

    for system_id in cluster["systems"]:
        system = site["systems"][system_id]
        lines.append(mermaid_node(system_id, system["label"]))

    seen_external: set[str] = set()
    for edge in site["edges"]:
        source_id = edge["from"]
        target_id = edge["to"]
        source_in_cluster = source_id in cluster_systems
        target_in_cluster = target_id in cluster_systems
        if not source_in_cluster and not target_in_cluster:
            continue
        relevant_edges.append(edge)
        if not source_in_cluster and source_id not in seen_external:
            seen_external.add(source_id)
            external_nodes.append(source_id)
        if not target_in_cluster and target_id not in seen_external:
            seen_external.add(target_id)
            external_nodes.append(target_id)

    for ext_id in external_nodes:
        external_system = site["systems"].get(ext_id, {})
        lines.append(mermaid_node(ext_id, external_system.get("label", ext_id)))

    store_ids: list[str] = []
    for store in cluster.get("clusterStores", []):
        node_id = f'store__{store["id"]}'
        store_ids.append(node_id)
        lines.append(mermaid_node(node_id, store["label"], "store"))

    for edge in relevant_edges:
        label = mermaid_label(edge.get("label", ""))
        if label:
            lines.append(f'    {edge["from"]} -->|"{label}"| {edge["to"]}')
        else:
            lines.append(f'    {edge["from"]} --> {edge["to"]}')

    for store in cluster.get("clusterStores", []):
        node_id = f'store__{store["id"]}'
        writer_ids = set(store.get("writers", []))
        for writer in store.get("writers", []):
            if writer in cluster_systems or writer in seen_external:
                lines.append(f"    {writer} -.-> {node_id}")
        for reader in store.get("readers", []):
            if (reader in cluster_systems or reader in seen_external) and reader not in writer_ids:
                lines.append(f"    {node_id} -.-> {reader}")

    if external_nodes:
        lines.append(f'    class {",".join(external_nodes)} external')
    if store_ids:
        lines.append(f'    class {",".join(store_ids)} store')
    lines.append("    classDef external fill:#0d1117,stroke:#30363d,stroke-dasharray:5 5,color:#6e7681")
    lines.append("    classDef store fill:#1a1a10,stroke:#d29922,color:#e6edf3")
    return "\n".join(lines)


def render_system_mermaid(site: dict, system: dict) -> str:
    lines = ["flowchart LR"]
    agent_ids: list[str] = []

    for module_id in system.get("modules", []):
        module = site["modules"][module_id]
        if not module.get("diagramNodes"):
            continue
        lines.append(f'    subgraph mod_{module["id"]}["{mermaid_label(module["label"])}"]')
        for node in module.get("diagramNodes", []):
            if node.get("kind") == "agent":
                agent_ids.append(node["id"])
                lines.append(mermaid_node(node["id"], node["label"], "store"))
            else:
                lines.append(mermaid_node(node["id"], node["label"]))
        lines.append("    end")

    for edge in system.get("internalFileEdges", []):
        if edge.get("kind") == "agent":
            lines.append(f'    {edge["from"]} -.-> {edge["to"]}')
        else:
            lines.append(f'    {edge["from"]} --> {edge["to"]}')

    if agent_ids:
        lines.append(f'    class {",".join(agent_ids)} agent')
    lines.append("    classDef agent fill:#1a1525,stroke:#9D7BEE,color:#e6edf3")
    return "\n".join(lines)


def render_mermaid(site: dict) -> str:
    """Render the root Mermaid diagram for a site model."""
    return render_root_mermaid(site)
