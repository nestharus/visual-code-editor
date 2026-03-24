"""HTML page renderers for the static site."""

from __future__ import annotations

import json
import textwrap
from html import escape

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
from visual_code_editor.render.utils import (
    breadcrumb_html,
    build_page_reference_summary,
    count_cited_files,
    format_path,
    group_symbols_by_file,
    page_document,
    rel_href,
    render_claim_section,
    render_edge_artifact_flow,
    render_file_overviews,
    render_link_list,
    render_list,
    render_references,
    render_ref_sup,
    render_system_diagram_links,
    render_table,
    resolve_store_reference,
)


def coverage_badge_html(coverage: dict, href: str) -> str:
    percentage = coverage.get("symbolPercentage", 0.0)
    if percentage >= 70:
        color = "var(--success)"
    elif percentage >= 40:
        color = "var(--warning)"
    else:
        color = "var(--danger)"
    return (
        f'<a class="coverage-badge" href="{escape(href)}">'
        f'<span>{coverage.get("referencedSymbols", 0)}/{coverage.get("totalSymbols", 0)} symbols</span>'
        '<span class="coverage-bar"><span class="coverage-bar-fill" '
        f'style="width:{percentage:.1f}%; background:{color};"></span></span>'
        f"<span>{percentage:.1f}%</span>"
        "</a>"
    )


def toolbar_html(
    title: str,
    subtitle: str,
    coverage_href: str,
    *,
    include_toggle: bool = True,
    extra_actions: str = "",
) -> str:
    toggle_button = (
        '<button class="button" type="button" data-action="toggle-details">Collapse All</button>'
        if include_toggle
        else ""
    )
    return textwrap.dedent(
        f"""
        <header class="toolbar">
            <div class="toolbar-title">
                <h1>{escape(title)}</h1>
                <div class="page-subtitle">{escape(subtitle)}</div>
            </div>
            <div class="toolbar-actions">
                {coverage_badge_html(site_coverage_for_toolbar, coverage_href)}
                {extra_actions}
                {toggle_button}
            </div>
        </header>
        """
    ).strip()


site_coverage_for_toolbar = {"referencedSymbols": 0, "totalSymbols": 0, "symbolPercentage": 0.0}


def render_behavioral_crossref_claim(site: dict, component_id: str, ref_lookup: dict[str, dict]) -> str:
    behavioral = site.get("behavioral", {})
    lifecycle_lookup = behavioral.get("lifecycles", {})
    stage_lookup = behavioral.get("stages", {})
    step_lookup = behavioral.get("steps", {})
    crossrefs = site.get("crossrefs", [])
    target_ids = [
        crossref["target_id"]
        for crossref in crossrefs
        if crossref.get("source_id") == component_id and crossref.get("target_view") == "behavioral"
    ]
    if not target_ids:
        return ""

    items: list[str] = []
    for target_id in target_ids:
        if target_id in lifecycle_lookup:
            items.append(f'Lifecycle: {lifecycle_lookup[target_id]["label"]}')
        elif target_id in stage_lookup:
            items.append(f'Stage: {stage_lookup[target_id]["label"]}')
        elif target_id in step_lookup:
            items.append(f'Step: {step_lookup[target_id]["label"]}')
    if not items:
        return ""

    return render_claim_section(
        "behavioral-crossrefs",
        "Behavioral Cross-References",
        render_list(sorted(dict.fromkeys(items))),
        [],
        ref_lookup,
    )


def render_index_page(site: dict) -> str:
    global site_coverage_for_toolbar
    site_coverage_for_toolbar = site["coverage"]
    org_root_elements_json, org_root_edge_click_map = render_root_cytoscape(site)
    org_root_mermaid_text = render_root_mermaid(site)
    behavioral_runtime = build_behavioral_runtime(site)
    behavioral_available = bool(
        site.get("views", {}).get("behavioral", {}).get("available")
        and behavioral_runtime.get("available")
    )
    default_view = "behavioral" if behavioral_available else "organizational"
    org_root_payload = {
        "elements": org_root_elements_json,
        "mermaid": org_root_mermaid_text,
        "nodeTargetMap": site.get("rootNodeTargetMap", {}),
        "edgeClickMap": org_root_edge_click_map,
    }
    behavioral_root_payload = behavioral_runtime.get("root", {}) if behavioral_available else {}
    org_root_target_map_json = json.dumps(org_root_payload.get("nodeTargetMap", {}), separators=(",", ":"))
    org_root_edge_click_map_json = json.dumps(org_root_payload.get("edgeClickMap", {}), separators=(",", ":"))
    behavioral_root_target_map_json = json.dumps(
        behavioral_root_payload.get("nodeTargetMap", {}),
        separators=(",", ":"),
    )
    behavioral_root_edge_click_map_json = json.dumps(
        behavioral_root_payload.get("edgeClickMap", {}),
        separators=(",", ":"),
    )
    manifest_json = json.dumps(site["manifest"], indent=2).replace("</", "<\\/")
    org_root_json = json.dumps(org_root_payload, indent=2).replace("</", "<\\/")
    behavioral_runtime_json = json.dumps(behavioral_runtime, indent=2).replace("</", "<\\/")
    crossrefs_json = json.dumps(site.get("crossrefs", []), indent=2).replace("</", "<\\/")
    toggle_html = ""
    if behavioral_available:
        toggle_html = (
            '<div class="view-toggle" role="group" aria-label="Diagram view toggle">'
            '<button class="button view-toggle-button is-active" type="button" data-view-toggle="behavioral">Behavioral</button>'
            '<button class="button view-toggle-button" type="button" data-view-toggle="organizational">Organizational</button>'
            "</div>"
        )
    body = textwrap.dedent(
        f"""
        {toolbar_html("Artifact Lifecycle", "Interactive execution-philosophy architecture map", "coverage/index.html", include_toggle=False, extra_actions=toggle_html)}
        <nav class="diagram-nav" aria-label="Drill-down navigation">
            <button class="button" id="back-button" type="button" disabled>Back</button>
            <div class="breadcrumb" id="breadcrumb"><span>Overview</span></div>
        </nav>
        <script id="diagram-manifest" type="application/json">{manifest_json}</script>
        <script id="diagram-root-organizational" type="application/json">{org_root_json}</script>
        <script id="diagram-behavioral-runtime" type="application/json">{behavioral_runtime_json}</script>
        <script id="diagram-crossrefs" type="application/json">{crossrefs_json}</script>
        <div class="root-layout">
            <section class="diagram-stage" id="root-stage" data-default-view="{escape(default_view)}" data-behavioral-available="{str(behavioral_available).lower()}">
                <div class="diagram-shell">
                    <div id="root-cy" class="cy-container"
                         data-level="root"
                         data-view="organizational"
                         data-mermaid="{escape(org_root_payload['mermaid'])}"
                         data-elements="{escape(org_root_payload['elements'])}"
                         data-node-target-map="{escape(org_root_target_map_json)}"
                         data-edge-click-map="{escape(org_root_edge_click_map_json)}"></div>
                    <div id="root-behavioral-cy" class="cy-container"
                         data-level="root"
                         data-view="behavioral"
                         data-mermaid="{escape(behavioral_root_payload.get('mermaid', ''))}"
                         data-elements="{escape(behavioral_root_payload.get('elements', '[]'))}"
                         data-node-target-map="{escape(behavioral_root_target_map_json)}"
                         data-edge-click-map="{escape(behavioral_root_edge_click_map_json)}"></div>
                </div>
            </section>
            <div id="diagram-viewport" class="diagram-viewport" aria-live="polite"></div>
            <div id="detail-scrim" class="detail-scrim" aria-hidden="true"></div>
            <aside id="detail-panel" class="detail-panel" aria-hidden="true">
                <div class="detail-panel-header">
                    <div>
                        <div class="eyebrow" id="detail-panel-kind">Detail</div>
                        <h2 id="detail-panel-title">Details</h2>
                    </div>
                    <div class="detail-panel-actions">
                        <button class="button" id="detail-panel-close" type="button">Close</button>
                    </div>
                </div>
                <div id="detail-panel-body" class="detail-panel-body"></div>
            </aside>
        </div>
        """
    ).strip()
    return page_document(
        "Artifact Lifecycle — Overview",
        "index.html",
        site["rootSourceHash"],
        site["buildId"],
        body,
        body_class="diagram-index",
        include_cytoscape=True,
    )


def render_system_page(site: dict, system: dict) -> str:
    ref_lookup = {ref["id"]: ref for ref in system["refs"]}
    module_entries = [site["modules"][module_id] for module_id in system.get("modules", [])]
    diagram_links = render_system_diagram_links(site, [system["id"]])
    outgoing = [
        (
            rel_href(system["href"], edge["href"]),
            f"{site['systems'][edge['to']]['label']}",
            edge["label"],
        )
        for edge in site["edges"]
        if edge["from"] == system["id"]
    ]
    incoming = [
        (
            rel_href(system["href"], edge["href"]),
            f"{site['systems'][edge['from']]['label']}",
            edge["label"],
        )
        for edge in site["edges"]
        if edge["to"] == system["id"]
    ]
    cluster = next(cluster for cluster in site["clusters"] if cluster["id"] == system["cluster"])
    coverage_summary = build_page_reference_summary(system["refs"], system["sectionRefs"], system["symbolCoverage"])
    module_claim = ""
    diagram_section = ""
    agent_items = []
    for agent in system["agents"]:
        connection_labels = sorted({
            site["systems"].get(conn.get("system", ""), {}).get(
                "label",
                conn.get("system", "").replace("_", " ").title(),
            )
            for conn in agent.get("connectsTo", [])
            if conn.get("system")
        })
        connections_html = (
            f"<p>connects to: {escape(', '.join(connection_labels))}</p>"
            if connection_labels
            else ""
        )
        agent_items.append(
            "<li>"
            f"<a href=\"{escape(rel_href(system['href'], agent['href']))}\">{escape(agent['name'])}</a>"
            f"<p>{escape(agent['description'])}</p>"
            "<div class=\"detail-meta\">"
            f"<span class=\"pill\">Model: {escape(agent['model'] or 'Unspecified')}</span>"
            f"<span class=\"pill\">{agent['routeCount']} routes</span>"
            f"<span class=\"pill\">{agent['invocationCount']} invocations</span>"
            "</div>"
            f"{connections_html}"
            "</li>"
        )
    agents_body = (
        '<ul class="link-list">' + "".join(agent_items) + "</ul>"
        if agent_items
        else '<p class="empty">No agents documented.</p>'
    )
    article_attrs = [
        'class="detail-page"',
        f'data-entity-kind="system"',
        f'data-entity-id="{escape(system["id"])}"',
        f'data-cluster="{escape(system["cluster"])}"',
        f'data-entity-key="system:{escape(system["id"])}"',
    ]
    if system.get("hasDiagram"):
        article_attrs.append('data-has-diagram="true"')
        module_claim = render_claim_section(
            "modules",
            f"Modules ({len(module_entries)})",
            render_link_list([
                (
                    rel_href(system["href"], module["href"]),
                    module["label"],
                    f'{module["fileCount"]} files · {module["description"]}',
                )
                for module in module_entries
            ]),
            system["sectionRefs"]["modules"],
            ref_lookup,
        )
        elements_json = render_system_cytoscape(site, system)
        mermaid_text = render_system_mermaid(site, system)
        target_map_json = json.dumps(system.get("diagramNodeTargetMap", {}), separators=(",", ":"))
        system_diagram = (
            '<div class="cy-container" '
            f'data-level="system" '
            f'data-system-id="{escape(system["id"])}" '
            f'data-mermaid="{escape(mermaid_text)}" '
            f'data-elements="{escape(elements_json)}" '
            f'data-node-target-map="{escape(target_map_json)}"></div>'
        )
        diagram_section = textwrap.dedent(
            f"""
            <section class="system-diagram-section">
                <div class="detail-card diagram-summary">
                    <div class="eyebrow">System Diagram</div>
                    <h2 class="section-title">Internal files and agents</h2>
                    <p class="description">This system is large enough to drill into. Subgraphs group files by module directory; arrows show discovered intra-system imports and agent invocations. Click a file node to open its module card, or an agent node to open the agent detail page.</p>
                </div>
                <div class="diagram-shell">
                    {system_diagram}
                </div>
            </section>
            """
        ).strip()
    claims = [
        render_claim_section(
            "what",
            "What it is",
            f"<p>{escape(system['what'] or system['description'])}{render_ref_sup(system['sectionRefs']['what'], ref_lookup)}</p>",
            system["sectionRefs"]["what"],
            ref_lookup,
        ),
        render_claim_section(
            "how",
            "How it works",
            f"<p>{escape(system['how'] or system['description'])}{render_ref_sup(system['sectionRefs']['how'], ref_lookup)}</p>",
            system["sectionRefs"]["how"],
            ref_lookup,
        ),
        module_claim,
        render_claim_section(
            "agents",
            f"Agents ({len(system['agents'])})",
            agents_body,
            system["sectionRefs"]["agents"],
            ref_lookup,
        ),
        render_behavioral_crossref_claim(site, system["id"], ref_lookup),
        render_claim_section(
            "produces",
            "Produces",
            render_list(system["produces"]),
            system["sectionRefs"]["produces"],
            ref_lookup,
        ),
        render_claim_section(
            "consumes",
            "Consumes",
            render_list(system["consumes"]),
            system["sectionRefs"]["consumes"],
            ref_lookup,
        ),
        render_claim_section(
            "governance",
            "Governance",
            render_list(system["governance"]),
            system["sectionRefs"]["governance"],
            ref_lookup,
        ),
        render_claim_section(
            "connections",
            "Connections",
            (
                "<h3 class=\"subsection-title\">Sends to</h3>"
                + render_link_list(outgoing)
                + "<h3 class=\"subsection-title\">Receives from</h3>"
                + render_link_list(incoming)
            ),
            system["sectionRefs"]["connections"],
            ref_lookup,
        ),
        render_claim_section(
            "coverage",
            f"Code Coverage ({count_cited_files(system['refs'], system['sectionRefs'])}/{len(system['refs'])})",
            f"<p>{escape(coverage_summary)}{render_ref_sup(system['sectionRefs']['coverage'], ref_lookup)}</p>",
            system["sectionRefs"]["coverage"],
            ref_lookup,
        ),
    ]
    claims = [claim for claim in claims if claim]
    body = textwrap.dedent(
        f"""
        {toolbar_html(system["label"], system["clusterLabel"], rel_href(system["href"], "coverage/index.html"))}
        <article {" ".join(article_attrs)}>
            {breadcrumb_html([
                (rel_href(system["href"], "index.html"), "Overview"),
                (rel_href(system["href"], cluster["href"]), cluster["label"]),
                (None, system["label"]),
            ])}
            <section class="detail-hero">
                <div>
                    <div class="eyebrow">{escape(system["clusterLabel"])}</div>
                    <h1 class="page-title">{escape(system["label"])}</h1>
                    <p class="lede">{escape(system["description"])}</p>
                </div>
                <div class="detail-meta">
                    <span class="pill">{system["fileCount"]} files</span>
                    <span class="pill">{len(system["agents"])} agents</span>
                    <span class="pill">{system["symbolCoverage"]["referenced"]}/{system["symbolCoverage"]["total"]} symbols cited</span>
                </div>
            </section>
            {diagram_links}
            {diagram_section}
            <div class="claims">
                {"".join(claims)}
            </div>
            {render_references(system["refs"])}
        </article>
        """
    ).strip()
    return page_document(
        f"{system['label']} — Artifact Lifecycle",
        system["href"],
        system["sourceHash"],
        site["buildId"],
        body,
        include_cytoscape=system.get("hasDiagram", False),
    )


def render_module_page(site: dict, module: dict) -> str:
    ref_lookup = {ref["id"]: ref for ref in module["refs"]}
    system = site["systems"][module["systemId"]]
    diagram_links = render_system_diagram_links(site, [module["systemId"]])
    cluster = next(cluster for cluster in site["clusters"] if cluster["id"] == system["cluster"])
    outgoing = [
        edge for edge in system.get("internalEdges", [])
        if edge["fromId"] == module["id"]
    ]
    incoming = [
        edge for edge in system.get("internalEdges", [])
        if edge["toId"] == module["id"]
    ]
    coverage_summary = build_page_reference_summary(module["refs"], module["sectionRefs"], module["symbolCoverage"])
    file_list = render_file_overviews(module.get("fileOverviews", []))
    symbol_groups = group_symbols_by_file(module["symbols"])
    secondary_pill = (
        f'{module["agentCount"]} agents'
        if module["kind"] == "agents"
        else f'{len(module["symbols"])} public symbols'
    )
    public_symbols = [
        f'{format_path(file_path)} — {", ".join(symbols)}'
        for file_path, symbols in sorted(symbol_groups.items())
        if symbols
    ]
    claims = [
        render_claim_section(
            "what",
            "What it is",
            f"<p>{escape(module['description'])}{render_ref_sup(module['sectionRefs']['what'], ref_lookup)}</p>",
            module["sectionRefs"]["what"],
            ref_lookup,
        ),
        render_claim_section(
            "files",
            f"Files ({module['fileCount']})",
            file_list,
            module["sectionRefs"]["files"],
            ref_lookup,
        ),
        render_claim_section(
            "symbols",
            f"Public symbols ({len(module['symbols'])})",
            render_list(public_symbols),
            module["sectionRefs"]["symbols"],
            ref_lookup,
        ),
        render_claim_section(
            "connections",
            "Internal connections",
            (
                "<h3 class=\"subsection-title\">Sends to</h3>"
                + render_link_list([
                    (
                        rel_href(module["href"], site["modules"][edge["toId"]]["href"]),
                        site["modules"][edge["toId"]]["label"],
                        f'{edge["count"]} import{"s" if edge["count"] != 1 else ""}',
                    )
                    for edge in outgoing
                ])
                + "<h3 class=\"subsection-title\">Receives from</h3>"
                + render_link_list([
                    (
                        rel_href(module["href"], site["modules"][edge["fromId"]]["href"]),
                        site["modules"][edge["fromId"]]["label"],
                        f'{edge["count"]} import{"s" if edge["count"] != 1 else ""}',
                    )
                    for edge in incoming
                ])
            ),
            module["sectionRefs"]["connections"],
            ref_lookup,
        ),
        render_claim_section(
            "coverage",
            f"Code Coverage ({count_cited_files(module['refs'], module['sectionRefs'])}/{len(module['refs'])})",
            f"<p>{escape(coverage_summary)}{render_ref_sup(module['sectionRefs']['coverage'], ref_lookup)}</p>",
            module["sectionRefs"]["coverage"],
            ref_lookup,
        ),
    ]
    body = textwrap.dedent(
        f"""
        {toolbar_html(module["title"], system["label"], rel_href(module["href"], "coverage/index.html"))}
        <article class="detail-page" data-entity-kind="module" data-entity-id="{escape(module["id"])}" data-system-id="{escape(system["id"])}" data-module-id="{escape(module["moduleId"])}" data-cluster="{escape(system["cluster"])}" data-entity-key="module:{escape(module["id"])}">
            {breadcrumb_html([
                (rel_href(module["href"], "index.html"), "Overview"),
                (rel_href(module["href"], cluster["href"]), cluster["label"]),
                (rel_href(module["href"], system["href"]), system["label"]),
                (None, module["label"]),
            ])}
            <section class="detail-hero">
                <div>
                    <div class="eyebrow">{escape(system["label"])}</div>
                    <h1 class="page-title">{escape(module["title"])}</h1>
                    <p class="lede">{escape(module["description"])}</p>
                </div>
                <div class="detail-meta">
                    <span class="pill">{module["fileCount"]} files</span>
                    <span class="pill">{secondary_pill}</span>
                    <span class="pill">{module["symbolCoverage"]["referenced"]}/{module["symbolCoverage"]["total"]} symbols cited</span>
                </div>
            </section>
            {diagram_links}
            <div class="claims">
                {"".join(claims)}
            </div>
            {render_references(module["refs"])}
        </article>
        """
    ).strip()
    return page_document(
        f"{module['title']} — Artifact Lifecycle",
        module["href"],
        module["sourceHash"],
        site["buildId"],
        body,
    )


def render_agent_page(site: dict, agent: dict) -> str:
    ref_lookup = {ref["id"]: ref for ref in agent.get("refs", [])}
    system = site["systems"][agent["systemId"]]
    diagram_links = render_system_diagram_links(site, [agent["systemId"]])
    cluster = next(cluster for cluster in site["clusters"] if cluster["id"] == agent["cluster"])
    coverage_summary = build_page_reference_summary(agent.get("refs", []), agent.get("sectionRefs", {}), agent.get("symbolCoverage"))
    route_rows = [
        [
            f"<code>{escape(route.get('task_type', ''))}</code>",
            escape(route.get("model") or "(policy/default)"),
            escape(route.get("system") or ""),
        ]
        for route in agent.get("routes", [])
    ]
    invocation_rows = [
        [
            f"<code>{escape(inv.get('caller_file', ''))}</code>",
            f"<code>{escape(inv.get('task_type', '') or inv.get('invocation_type', ''))}</code>",
            escape("Cross-system" if inv.get("cross_system") else "Local"),
        ]
        for inv in agent.get("invocations", [])
    ]
    connection_items = []
    for conn in agent.get("connectsTo", []):
        target_system_id = conn.get("system", "")
        target_system = site["systems"].get(target_system_id)
        direction = conn.get("direction", "")
        arrow = "&rarr;" if direction == "out" else "&larr;" if direction == "in" else "&harr;"
        target_label = target_system["label"] if target_system else target_system_id.replace("_", " ").title()
        target_href = rel_href(agent["href"], target_system["href"]) if target_system else ""
        target_html = (
            f'<a href="{escape(target_href)}">{escape(target_label)}</a>'
            if target_href
            else escape(target_label)
        )
        meta_bits = [bit for bit in [conn.get("label", ""), conn.get("data", "")] if bit]
        meta_html = f"<p>{escape(' · '.join(meta_bits))}</p>" if meta_bits else ""
        connection_items.append(f"<li>{arrow} {target_html}{meta_html}</li>")
    connections_body = (
        '<ul class="link-list">' + "".join(connection_items) + "</ul>"
        if connection_items
        else '<p class="empty">No cross-system connections documented.</p>'
    )
    store_items = []
    for store_name in agent.get("stores", []):
        store = resolve_store_reference(site, store_name)
        if store:
            store_items.append(
                "<li>"
                f"<a href=\"{escape(rel_href(agent['href'], store['href']))}\">{escape(store['label'])}</a>"
                f"<p>{escape(store_name)}</p>"
                "</li>"
            )
        else:
            store_items.append(f"<li>{escape(store_name)}</li>")
    stores_body = (
        '<ul class="link-list">' + "".join(store_items) + "</ul>"
        if store_items
        else '<p class="empty">No stores documented.</p>'
    )
    claims = [
        render_claim_section("inputs", "Inputs", render_list(agent.get("inputs", [])), agent["sectionRefs"]["inputs"], ref_lookup),
        render_claim_section("outputs", "Outputs", render_list(agent.get("outputs", [])), agent["sectionRefs"]["outputs"], ref_lookup),
        render_claim_section(
            "routes",
            "Route Registrations",
            render_table(["Task type", "Model", "Namespace"], route_rows),
            agent["sectionRefs"]["routes"],
            ref_lookup,
        ),
        render_claim_section(
            "invocations",
            "Invoked By",
            render_table(["Caller file", "Task type", "Scope"], invocation_rows),
            agent["sectionRefs"]["invocations"],
            ref_lookup,
        ),
        render_claim_section(
            "connections",
            "Cross-System Connections",
            connections_body,
            agent["sectionRefs"]["connections"],
            ref_lookup,
        ),
        render_behavioral_crossref_claim(site, agent["id"], ref_lookup),
        render_claim_section("stores", "Stores", stores_body, agent["sectionRefs"]["stores"], ref_lookup),
        render_claim_section(
            "coverage",
            f"Code Coverage ({count_cited_files(agent['refs'], agent['sectionRefs'])}/{len(agent['refs'])})",
            f"<p>{escape(coverage_summary)}{render_ref_sup(agent['sectionRefs']['coverage'], ref_lookup)}</p>",
            agent["sectionRefs"]["coverage"],
            ref_lookup,
        ),
    ]
    body = textwrap.dedent(
        f"""
        {toolbar_html(agent["label"], agent["systemLabel"], rel_href(agent["href"], "coverage/index.html"))}
        <article class="detail-page" data-entity-kind="agent" data-entity-id="{escape(agent["id"])}" data-system-id="{escape(agent["systemId"])}" data-cluster="{escape(agent["cluster"])}" data-entity-key="agent:{escape(agent["id"])}">
            {breadcrumb_html([
                (rel_href(agent["href"], "index.html"), "Overview"),
                (rel_href(agent["href"], cluster["href"]), cluster["label"]),
                (rel_href(agent["href"], system["href"]), system["label"]),
                (None, agent["label"]),
            ])}
            <section class="detail-hero">
                <div>
                    <div class="eyebrow">Agent · {escape(agent["systemLabel"])} · {escape(agent["clusterLabel"])}</div>
                    <h1 class="page-title">{escape(agent["label"])}</h1>
                    <p class="lede">{escape(agent["description"])}</p>
                </div>
                <div class="detail-meta">
                    <span class="pill">Model: {escape(agent["model"] or "Unspecified")}</span>
                    <span class="pill">{agent["routeCount"]} routes</span>
                    <span class="pill">{agent["invocationCount"]} invocations</span>
                </div>
            </section>
            {diagram_links}
            <div class="claims">
                {"".join(claims)}
            </div>
            {render_references(agent["refs"])}
        </article>
        """
    ).strip()
    return page_document(
        f"{agent['label']} — Artifact Lifecycle",
        agent["href"],
        agent["sourceHash"],
        site["buildId"],
        body,
    )


def render_edge_page(site: dict, edge: dict) -> str:
    ref_lookup = {ref["id"]: ref for ref in edge["refs"]}
    source_system = site["systems"][edge["from"]]
    target_system = site["systems"][edge["to"]]
    diagram_links = render_system_diagram_links(site, [edge["from"], edge["to"]])
    coverage_summary = build_page_reference_summary(edge["refs"], edge["sectionRefs"], edge["symbolCoverage"])
    artifact_flow_refs = list(dict.fromkeys(edge["sectionRefs"]["how"] + edge["sectionRefs"]["stores"]))
    claims = [
        render_claim_section(
            "what",
            "What it is",
            f"<p>{escape(edge['label'])} connects {escape(source_system['label'])} to {escape(target_system['label'])}.{render_ref_sup(edge['sectionRefs']['what'], ref_lookup)}</p>",
            edge["sectionRefs"]["what"],
            ref_lookup,
        ),
        render_claim_section(
            "how",
            "How it works",
            f"<p>{escape(edge['mechanism'] or 'Import-based dependency discovered from source code.')}{render_ref_sup(edge['sectionRefs']['how'], ref_lookup)}</p>",
            edge["sectionRefs"]["how"],
            ref_lookup,
        ),
        render_claim_section(
            "artifact-flow",
            "Artifact Flow",
            render_edge_artifact_flow(site, edge),
            artifact_flow_refs,
            ref_lookup,
        ),
        render_claim_section(
            "connections",
            "Connections",
            render_link_list([
                (rel_href(edge["href"], source_system["href"]), f"Source: {source_system['label']}", source_system["description"]),
                (rel_href(edge["href"], target_system["href"]), f"Target: {target_system['label']}", target_system["description"]),
                (rel_href(edge["href"], f"clusters/{edge['fromCluster']}.html"), f"Source cluster: {source_system['clusterLabel']}", None),
                (rel_href(edge["href"], f"clusters/{edge['toCluster']}.html"), f"Target cluster: {source_system['clusterLabel']}", None),
            ]),
            edge["sectionRefs"]["connections"],
            ref_lookup,
        ),
        render_claim_section(
            "coverage",
            f"Code Coverage ({count_cited_files(edge['refs'], edge['sectionRefs'])}/{len(edge['refs'])})",
            f"<p>{escape(coverage_summary)}{render_ref_sup(edge['sectionRefs']['coverage'], ref_lookup)}</p>",
            edge["sectionRefs"]["coverage"],
            ref_lookup,
        ),
    ]
    body = textwrap.dedent(
        f"""
        {toolbar_html(edge["label"], f"{source_system['label']} → {target_system['label']}", rel_href(edge["href"], "coverage/index.html"))}
        <article class="detail-page" data-entity-kind="edge" data-entity-id="{escape(edge["id"])}" data-cluster="{escape(edge["fromCluster"])}" data-source-system="{escape(edge["from"])}" data-target-system="{escape(edge["to"])}" data-entity-key="edge:{escape(edge["id"])}">
            {breadcrumb_html([
                (rel_href(edge["href"], "index.html"), "Overview"),
                (rel_href(edge["href"], source_system["href"]), source_system["label"]),
                (None, edge["label"]),
            ])}
            <section class="detail-hero">
                <div>
                    <div class="eyebrow">Cross-system edge</div>
                    <h1 class="page-title">{escape(edge["label"])}</h1>
                    <p class="lede">{
                        escape(
                            f"{source_system['label']} imports and depends on {target_system['label']}."
                            if edge["imports"]
                            else f"{source_system['label']} exchanges agent-driven work or artifacts with {target_system['label']}."
                        )
                    }</p>
                </div>
                <div class="detail-meta">
                    <span class="pill">{len(edge["files"])} source files</span>
                    <span class="pill">{len(edge["imports"])} imports</span>
                    <span class="pill">{len(edge.get("agentCalls", [])) + len(edge.get("agentFlows", []))} agent signals</span>
                    <span class="pill">{len(edge["stores"])} stores</span>
                </div>
            </section>
            {diagram_links}
            <div class="claims">
                {"".join(claims)}
            </div>
            {render_references(edge["refs"])}
        </article>
        """
    ).strip()
    return page_document(
        f"{edge['label']} — Artifact Lifecycle",
        edge["href"],
        edge["sourceHash"],
        site["buildId"],
        body,
    )


def render_cluster_page(site: dict, cluster: dict) -> str:
    ref_lookup = {ref["id"]: ref for ref in cluster["refs"]}
    systems = [site["systems"][system_id] for system_id in cluster["systems"]]
    outgoing = [
        edge for edge in site["clusterEdges"]
        if edge["from"] == cluster["id"]
    ]
    incoming = [
        edge for edge in site["clusterEdges"]
        if edge["to"] == cluster["id"]
    ]
    coverage_summary = build_page_reference_summary(cluster["refs"], cluster["sectionRefs"], cluster["symbolCoverage"])
    claims = [
        render_claim_section(
            "what",
            "What it is",
            f"<p>{escape(cluster['description'])}{render_ref_sup(cluster['sectionRefs']['what'], ref_lookup)}</p>",
            cluster["sectionRefs"]["what"],
            ref_lookup,
        ),
        render_claim_section(
            "how",
            "How it was grouped",
            f"<p>Cluster membership comes from greedy modularity clustering over the discovered import graph, then mapped onto the named pipeline stages when overlap is strong.{render_ref_sup(cluster['sectionRefs']['how'], ref_lookup)}</p>",
            cluster["sectionRefs"]["how"],
            ref_lookup,
        ),
        render_claim_section(
            "systems",
            f"Systems ({len(systems)})",
            render_link_list([
                (rel_href(cluster["href"], system["href"]), system["label"], system["description"])
                for system in systems
            ]),
            cluster["sectionRefs"]["systems"],
            ref_lookup,
        ),
        render_claim_section(
            "connections",
            "Connections",
            (
                "<h3 class=\"subsection-title\">Sends to</h3>"
                + render_link_list([
                    (rel_href(cluster["href"], f"clusters/{edge['to']}.html"), cluster_label(site, edge["to"]), edge["label"])
                    for edge in outgoing
                ])
                + "<h3 class=\"subsection-title\">Receives from</h3>"
                + render_link_list([
                    (rel_href(cluster["href"], f"clusters/{edge['from']}.html"), cluster_label(site, edge["from"]), edge["label"])
                    for edge in incoming
                ])
            ),
            cluster["sectionRefs"]["connections"],
            ref_lookup,
        ),
        render_claim_section(
            "coverage",
            f"Code Coverage ({count_cited_files(cluster['refs'], cluster['sectionRefs'])}/{len(cluster['refs'])})",
            f"<p>{escape(coverage_summary)}{render_ref_sup(cluster['sectionRefs']['coverage'], ref_lookup)}</p>",
            cluster["sectionRefs"]["coverage"],
            ref_lookup,
        ),
    ]
    cluster_elements_json, cluster_edge_click_map = render_cluster_cytoscape(site, cluster)
    cluster_mermaid_text = render_cluster_mermaid(site, cluster)
    cluster_target_map_json = json.dumps(cluster.get("clusterNodeTargetMap", {}), separators=(",", ":"))
    cluster_edge_click_map_json = json.dumps(cluster_edge_click_map, separators=(",", ":"))
    cluster_diagram = (
        '<div class="cy-container" '
        f'data-level="cluster" '
        f'data-cluster-id="{escape(cluster["id"])}" '
        f'data-mermaid="{escape(cluster_mermaid_text)}" '
        f'data-elements="{escape(cluster_elements_json)}" '
        f'data-node-target-map="{escape(cluster_target_map_json)}" '
        f'data-edge-click-map="{escape(cluster_edge_click_map_json)}"></div>'
    )
    body = textwrap.dedent(
        f"""
        {toolbar_html(cluster["label"], "Cluster page", rel_href(cluster["href"], "coverage/index.html"))}
        <article class="detail-page" data-entity-kind="cluster" data-entity-id="{escape(cluster["id"])}" data-cluster="{escape(cluster["id"])}" data-entity-key="cluster:{escape(cluster["id"])}">
            {breadcrumb_html([
                (rel_href(cluster["href"], "index.html"), "Overview"),
                (None, cluster["label"]),
            ])}
            <section class="detail-hero">
                <div>
                    <div class="eyebrow">Cluster</div>
                    <h1 class="page-title">{escape(cluster["label"])}</h1>
                    <p class="lede">{escape(cluster["description"])}</p>
                </div>
                <div class="detail-meta">
                    <span class="pill">{len(cluster["systems"])} systems</span>
                    <span class="pill">{len(outgoing)} outgoing links</span>
                    <span class="pill">{len(incoming)} incoming links</span>
                </div>
            </section>
            <section class="cluster-diagram-section">
                <div class="detail-card diagram-summary">
                    <div class="eyebrow">Systems Diagram</div>
                    <h2 class="section-title">Internal flow</h2>
                    <p class="description">This cluster groups related systems. Arrow labels summarize intra-cluster import counts; simple systems open directly in the detail panel, while complex systems drill down to a module diagram first.</p>
                </div>
                <div class="diagram-shell">
                    {cluster_diagram}
                </div>
            </section>
            <div class="claims">
                {"".join(claims)}
            </div>
            <section class="references-card cluster-inline-members">
                <h2 class="section-title">Members</h2>
                <ul class="link-list">
                    {"".join(f'<li data-system-id="{escape(system["id"])}"><a href="{escape(rel_href(cluster["href"], system["href"]))}">{escape(system["label"])}</a><p>{escape(system["description"])}</p></li>' for system in systems)}
                </ul>
            </section>
            {render_references(cluster["refs"], "cluster-inline-references")}
        </article>
        """
    ).strip()
    return page_document(
        f"{cluster['label']} — Artifact Lifecycle",
        cluster["href"],
        cluster["sourceHash"],
        site["buildId"],
        body,
        include_cytoscape=True,
    )


def cluster_label(site: dict, cluster_id: str) -> str:
    for cluster in site["clusters"]:
        if cluster["id"] == cluster_id:
            return cluster["label"]
    return cluster_id.replace("_", " ").title()


def render_store_page(site: dict, store: dict) -> str:
    ref_lookup = {ref["id"]: ref for ref in store["refs"]}
    all_systems = [
        system_id
        for system_id in dict.fromkeys(store.get("readers", []) + store.get("writers", []))
        if system_id != "(auto-discovery pending)"
    ]
    diagram_links = render_system_diagram_links(site, all_systems)
    coverage_summary = build_page_reference_summary(store["refs"], store["sectionRefs"], store["symbolCoverage"])
    claims = [
        render_claim_section(
            "what",
            "What it is",
            f"<p>{escape(store['what'])}{render_ref_sup(store['sectionRefs']['what'], ref_lookup)}</p>",
            store["sectionRefs"]["what"],
            ref_lookup,
        ),
        render_claim_section(
            "how",
            "How it is organized",
            "<p>"
            + escape(f"Location: {store['location']}.")
            + "</p>"
            + render_list(store["tables"]),
            store["sectionRefs"]["how"],
            ref_lookup,
        ),
        render_claim_section(
            "connections",
            "Connections",
            (
                "<h3 class=\"subsection-title\">Readers</h3>"
                + render_link_list([
                    (
                        rel_href(store["href"], site["systems"][system_id]["href"]),
                        site["systems"][system_id]["label"],
                        site["systems"][system_id]["description"],
                    )
                    for system_id in store["readers"]
                    if system_id in site["systems"]
                ])
                + "<h3 class=\"subsection-title\">Writers</h3>"
                + render_link_list([
                    (
                        rel_href(store["href"], site["systems"][system_id]["href"]),
                        site["systems"][system_id]["label"],
                        site["systems"][system_id]["description"],
                    )
                    for system_id in store["writers"]
                    if system_id in site["systems"]
                ])
            ),
            store["sectionRefs"]["connections"],
            ref_lookup,
        ),
        render_behavioral_crossref_claim(site, store["id"], ref_lookup),
        render_claim_section(
            "coverage",
            f"Code Coverage ({count_cited_files(store['refs'], store['sectionRefs'])}/{len(store['refs'])})",
            f"<p>{escape(coverage_summary)}{render_ref_sup(store['sectionRefs']['coverage'], ref_lookup)}</p>",
            store["sectionRefs"]["coverage"],
            ref_lookup,
        ),
    ]
    body = textwrap.dedent(
        f"""
        {toolbar_html(store["label"], "Store page", rel_href(store["href"], "coverage/index.html"))}
        <article class="detail-page" data-entity-kind="store" data-entity-id="{escape(store["id"])}" data-entity-key="store:{escape(store["id"])}">
            {breadcrumb_html([
                (rel_href(store["href"], "index.html"), "Overview"),
                (None, store["label"]),
            ])}
            <section class="detail-hero">
                <div>
                    <div class="eyebrow">Store</div>
                    <h1 class="page-title">{escape(store["label"])}</h1>
                    <p class="lede">{escape(store["description"])}</p>
                </div>
                <div class="detail-meta">
                    <span class="pill">{escape(store["location"])}</span>
                    <span class="pill">{len(store["tables"])} tracked surfaces</span>
                    <span class="pill">{len([system_id for system_id in store["readers"] if system_id in site["systems"]])} readers</span>
                </div>
            </section>
            {diagram_links}
            <div class="claims">
                {"".join(claims)}
            </div>
            {render_references(store["refs"])}
        </article>
        """
    ).strip()
    return page_document(
        f"{store['label']} — Artifact Lifecycle",
        store["href"],
        store["sourceHash"],
        site["buildId"],
        body,
    )


def render_coverage_page(site: dict) -> str:
    global site_coverage_for_toolbar
    site_coverage_for_toolbar = site["coverage"]
    ref_lookup = {ref["id"]: ref for ref in site["rootRefs"]}
    system_rows = []
    for system_id, metrics in sorted(site["coverage"]["bySystem"].items(), key=lambda item: (item[1]["percentage"], item[0])):
        system = site["systems"][system_id]
        system_rows.append(
            f"<tr><td><a href=\"{escape(rel_href('coverage/index.html', system['href']))}\">{escape(system['label'])}</a></td>"
            f"<td>{metrics['files']}</td><td>{metrics['referencedSymbols']}/{metrics['symbols']}</td>"
            f"<td>{metrics['percentage']:.1f}%</td></tr>"
        )
    claims = [
        render_claim_section(
            "overview",
            "Coverage summary",
            (
                f"<p>The generated site currently cites {site['coverage']['coveredFiles']}/{site['coverage']['totalFiles']} tracked files "
                f"and {site['coverage']['referencedSymbols']}/{site['coverage']['totalSymbols']} public symbols.{render_ref_sup(site['rootSectionRefs']['overview'], ref_lookup)}</p>"
            ),
            site["rootSectionRefs"]["overview"],
            ref_lookup,
        ),
    ]
    body = textwrap.dedent(
        f"""
        {toolbar_html("Coverage Dashboard", "Site reference coverage", "index.html")}
        <article class="detail-page" data-entity-kind="coverage" data-entity-id="coverage" data-entity-key="coverage:index">
            {breadcrumb_html([
                (rel_href("coverage/index.html", "index.html"), "Overview"),
                (None, "Coverage"),
            ])}
            <section class="detail-hero">
                <div>
                    <div class="eyebrow">Coverage</div>
                    <h1 class="page-title">Reference coverage</h1>
                    <p class="lede">Coverage is computed from public Python symbols and the references emitted into the generated HTML.</p>
                </div>
                <div class="detail-meta">
                    <span class="pill">{site['coverage']['coveredFiles']}/{site['coverage']['totalFiles']} files</span>
                    <span class="pill">{site['coverage']['referencedSymbols']}/{site['coverage']['totalSymbols']} symbols</span>
                    <span class="pill">{site['coverage']['symbolPercentage']:.1f}% symbol coverage</span>
                </div>
            </section>
            <div class="claims">
                {"".join(claims)}
            </div>
            <section class="coverage-table-wrap">
                <h2 class="section-title">Per-system coverage</h2>
                <table class="table">
                    <thead>
                        <tr><th>System</th><th>Files</th><th>Symbols</th><th>Coverage</th></tr>
                    </thead>
                    <tbody>
                        {"".join(system_rows)}
                    </tbody>
                </table>
            </section>
            {render_references(site["rootRefs"])}
        </article>
        """
    ).strip()
    return page_document(
        "Coverage — Artifact Lifecycle",
        "coverage/index.html",
        site["rootSourceHash"],
        site["buildId"],
        body,
    )


def _list_lookup(items: list[dict], entity_id: str) -> dict:
    for item in items:
        if item["id"] == entity_id:
            return item
    raise KeyError(entity_id)


def render_page(site: dict, page_id: str) -> str:
    """Render a page from a site model using a simple page identifier."""
    if page_id in {"index", "index.html"}:
        return render_index_page(site)
    if page_id in {"coverage", "coverage/index.html"}:
        return render_coverage_page(site)

    if ":" in page_id:
        kind, entity_id = page_id.split(":", 1)
    elif "/" in page_id:
        kind, entity_id = page_id.split("/", 1)
    else:
        raise KeyError(page_id)

    if kind == "system":
        return render_system_page(site, site["systems"][entity_id])
    if kind == "module":
        return render_module_page(site, site["modules"][entity_id])
    if kind == "agent":
        return render_agent_page(site, site["agents"][entity_id])
    if kind == "edge":
        return render_edge_page(site, _list_lookup(site["edges"], entity_id))
    if kind == "cluster":
        return render_cluster_page(site, _list_lookup(site["clusters"], entity_id))
    if kind == "store":
        return render_store_page(site, _list_lookup(site["stores"], entity_id))
    raise KeyError(page_id)
