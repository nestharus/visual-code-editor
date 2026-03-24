"""Shared helpers for static page rendering."""

from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import textwrap
from collections import defaultdict
from html import escape
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SRC_DIR = PROJECT_ROOT / "src"


def compact_json_dumps(value: object) -> str:
    return json.dumps(value, separators=(",", ":"))


def slugify(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", value.lower())
    return text.strip("-") or "item"


def file_hash(paths: list[Path | str]) -> str:
    """SHA-256 of concatenated file contents, truncated to 16 hex chars."""
    digest = hashlib.sha256()
    for path in sorted(Path(item) for item in paths):
        try:
            digest.update(path.read_bytes())
        except OSError:
            pass
    return digest.hexdigest()[:16]


def module_display_label(module_name: str) -> str:
    if module_name == "core":
        return "Core"
    if module_name == "agents":
        return "Agents"
    return module_name.replace("_", " ").title()


def module_sort_key(module_name: str) -> tuple[int, str]:
    if module_name == "core":
        return (0, module_name)
    if module_name == "agents":
        return (2, module_name)
    return (1, module_name)


def extract_symbols(py_file_path: Path | str) -> list[dict]:
    """Extract public classes and top-level functions from a Python file."""
    try:
        source = Path(py_file_path).read_text(encoding="utf-8", errors="replace")
        tree = ast.parse(source)
    except Exception:
        return []

    symbols = []
    rel_path = str(py_file_path)
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.ClassDef) and not node.name.startswith("_"):
            symbols.append({"type": "class", "name": node.name, "line": node.lineno, "file": rel_path})
            for child in ast.iter_child_nodes(node):
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)) and not child.name.startswith("_"):
                    symbols.append({
                        "type": "method",
                        "name": f"{node.name}.{child.name}",
                        "line": child.lineno,
                        "file": rel_path,
                    })
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and not node.name.startswith("_"):
            symbols.append({"type": "function", "name": node.name, "line": node.lineno, "file": rel_path})
    return symbols


def format_path(file_path: str) -> str:
    return file_path if file_path.startswith("src/") else f"src/{file_path}"


def rel_href(from_href: str, to_href: str) -> str:
    return os.path.relpath(to_href, start=os.path.dirname(from_href) or ".")


def collect_symbols_for_files(files: list[str]) -> list[dict]:
    symbols = []
    for rel_path in files:
        full_path = SRC_DIR / rel_path
        if not full_path.exists() or full_path.suffix != ".py":
            continue
        for symbol in extract_symbols(full_path):
            symbol["file"] = rel_path
            symbols.append(symbol)
    return symbols


def group_symbols_by_file(symbols: list[dict], referenced_only: bool = False) -> dict[str, list[str]]:
    grouped: defaultdict[str, list[str]] = defaultdict(list)
    for symbol in symbols:
        if referenced_only and not symbol.get("referenced"):
            continue
        grouped[symbol["file"]].append(symbol["name"])
    return dict(grouped)


def count_cited_files(refs: list[dict], section_refs: dict[str, list[str]]) -> int:
    cited_ids = {ref_id for values in section_refs.values() for ref_id in values}
    return sum(1 for ref in refs if ref["id"] in cited_ids)


def build_page_reference_summary(
    refs: list[dict],
    section_refs: dict[str, list[str]],
    symbol_coverage: dict | None = None,
) -> str:
    cited_files = count_cited_files(refs, section_refs)
    total_files = len(refs)
    if symbol_coverage:
        return (
            f"This page cites {cited_files}/{total_files} discovered files. "
            f"Referenced public symbols cover {symbol_coverage['referenced']}/{symbol_coverage['total']}."
        )
    return f"This page cites {cited_files}/{total_files} supporting files."


def normalize_store_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def resolve_store_reference(site: dict, store_name: str) -> dict | None:
    wanted = normalize_store_key(store_name)
    if not wanted:
        return None
    for store in site.get("stores", []):
        keys = {
            normalize_store_key(store.get("id", "")),
            normalize_store_key(store.get("label", "")),
        }
        if wanted in keys:
            return store
    return None


def breadcrumb_html(items: list[tuple[str | None, str]]) -> str:
    parts = ['<nav class="breadcrumb" aria-label="Breadcrumb">']
    for index, (href, label) in enumerate(items):
        if index:
            parts.append('<span class="sep">›</span>')
        if href:
            parts.append(f'<a href="{escape(href)}">{escape(label)}</a>')
        else:
            parts.append(f"<span>{escape(label)}</span>")
    parts.append("</nav>")
    return "".join(parts)


def render_ref_sup(ref_ids: list[str], ref_lookup: dict[str, dict]) -> str:
    links = []
    for ref_id in ref_ids:
        ref = ref_lookup.get(ref_id)
        if not ref:
            continue
        number = ref_id.split("-")[-1]
        links.append(f'<a href="#{escape(ref_id)}">[{escape(number)}]</a>')
    if not links:
        return ""
    return f' <sup class="mono">{" ".join(links)}</sup>'


def mermaid_escape(text: str) -> str:
    sanitized = escape(text.replace("\\", "\\\\").replace('"', '\\"'), quote=False)
    return sanitized.replace("\n", "<br/>")


def mermaid_multiline_label(text: str) -> str:
    return mermaid_escape(text)


def render_list(items: list[str]) -> str:
    if not items:
        return '<p class="empty">No explicit items documented.</p>'
    return "<ul>" + "".join(f"<li>{escape(item)}</li>" for item in items) + "</ul>"


def render_link_list(items: list[tuple[str, str, str | None]]) -> str:
    if not items:
        return '<p class="empty">No linked items available.</p>'
    rendered = []
    for href, label, meta in items:
        suffix = f"<p>{escape(meta)}</p>" if meta else ""
        rendered.append(f'<li><a href="{escape(href)}">{escape(label)}</a>{suffix}</li>')
    return '<ul class="link-list">' + "".join(rendered) + "</ul>"


def render_system_diagram_links(site: dict, system_ids: list[str], current_href: str = "") -> str:
    """Render drill-down links for systems that have diagrams."""
    del current_href
    links = []
    seen: set[str] = set()
    for system_id in system_ids:
        if system_id in seen:
            continue
        seen.add(system_id)
        system = site["systems"].get(system_id)
        if not system or not system.get("hasDiagram"):
            continue
        label = escape(system.get("label", system_id))
        href = system["href"]
        cluster_id = system.get("cluster", "")
        links.append(
            f'<a href="{escape(href)}" class="system-diagram-link"'
            f' data-open-system-diagram'
            f' data-system-id="{escape(system_id)}"'
            f' data-cluster-id="{escape(cluster_id)}">'
            f"{label} system diagram →</a>"
        )
    if not links:
        return ""
    return '<div class="system-diagram-links">' + "".join(links) + "</div>"


def render_file_overviews(items: list[dict]) -> str:
    if not items:
        return '<p class="empty">No tracked files available.</p>'
    rendered = []
    for item in items:
        summary = f"<p>{escape(item['summary'])}</p>" if item.get("summary") else ""
        rendered.append(f'<li><code>{escape(item["displayPath"])}</code>{summary}</li>')
    return '<ul class="link-list">' + "".join(rendered) + "</ul>"


def render_table(headers: list[str], rows: list[list[str]]) -> str:
    if not rows:
        return '<p class="empty">No structured data documented.</p>'
    head_html = "".join(f"<th>{escape(header)}</th>" for header in headers)
    body_html = "".join(
        "<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>"
        for row in rows
    )
    return f'<table class="table"><thead><tr>{head_html}</tr></thead><tbody>{body_html}</tbody></table>'


def store_direction_label(direction: str) -> str:
    return {
        "forward": "Forward",
        "reverse": "Reverse",
        "both_write": "Both write",
        "both_read": "Both read",
        "shared": "Shared",
    }.get(direction, "Shared")


def flow_direction_badge(direction: str) -> str:
    return {
        "out": "&rarr;",
        "in": "&larr;",
    }.get(direction, "&harr;")


def render_store_flow_direction(store_detail: dict, source_system: dict, target_system: dict) -> str:
    def participant_label(value: str, fallback: str) -> str:
        if not value:
            return fallback
        labels = []
        for part in [item.strip() for item in value.split(",") if item.strip()]:
            labels.append(
                source_system["label"] if part == source_system["id"]
                else target_system["label"] if part == target_system["id"]
                else part.replace("_", " ").title()
            )
        return ", ".join(labels) if labels else fallback

    direction = store_detail.get("direction", "shared")
    writer = participant_label(store_detail.get("writer", ""), source_system["label"])
    reader = participant_label(store_detail.get("reader", ""), target_system["label"])
    store_label = store_detail.get("label", "")

    if direction == "reverse":
        parts = [
            ("flow-reader", reader),
            ("flow-arrow", "&larr;"),
            ("flow-store", store_label),
            ("flow-arrow", "&larr;"),
            ("flow-writer", writer),
        ]
    elif direction == "both_write":
        shared_writer = writer or f"{source_system['label']}, {target_system['label']}"
        parts = [
            ("flow-writer", shared_writer),
            ("flow-arrow", "&rarr;"),
            ("flow-store", store_label),
            ("flow-arrow", "&larr;"),
            ("flow-writer", shared_writer),
        ]
    elif direction == "both_read":
        shared_reader = reader or f"{source_system['label']}, {target_system['label']}"
        parts = [
            ("flow-reader", shared_reader),
            ("flow-arrow", "&larr;"),
            ("flow-store", store_label),
            ("flow-arrow", "&rarr;"),
            ("flow-reader", shared_reader),
        ]
    elif direction == "shared":
        parts = [
            ("flow-writer", source_system["label"]),
            ("flow-arrow", "&harr;"),
            ("flow-store", store_label),
            ("flow-arrow", "&harr;"),
            ("flow-reader", target_system["label"]),
        ]
    else:
        parts = [
            ("flow-writer", writer),
            ("flow-arrow", "&rarr;"),
            ("flow-store", store_label),
            ("flow-arrow", "&rarr;"),
            ("flow-reader", reader),
        ]

    rendered = []
    for class_name, value in parts:
        if class_name == "flow-arrow":
            rendered.append(f'<span class="{class_name}">{value}</span>')
        else:
            rendered.append(f'<span class="{class_name}">{escape(value)}</span>')
    return '<div class="flow-direction">' + "".join(rendered) + "</div>"


def render_edge_artifact_flow(site: dict, edge: dict) -> str:
    source_system = site["systems"][edge["from"]]
    target_system = site["systems"][edge["to"]]
    sections = []
    store_details = edge.get("storeDetails", [])
    if store_details:
        lane_html = []
        for store_detail in store_details:
            tables = store_detail.get("tables", [])[:3]
            tables_html = (
                '<ul class="flow-tables">'
                + "".join(f"<li>{escape(table)}</li>" for table in tables)
                + "</ul>"
                if tables
                else ""
            )
            lane_html.append(
                '<div class="flow-lane">'
                '<div class="flow-lane-header">'
                f'<a href="{escape(rel_href(edge["href"], store_detail.get("href", "")))}" class="flow-store-name">{escape(store_detail.get("label", ""))}</a>'
                f'<span class="meta-badge">{escape(store_direction_label(store_detail.get("direction", "shared")))}</span>'
                "</div>"
                '<div class="flow-lane-body">'
                f"{render_store_flow_direction(store_detail, source_system, target_system)}"
                f'<p class="flow-description">{escape(store_detail.get("description", ""))}</p>'
                f"{tables_html}"
                "</div>"
                "</div>"
            )
        sections.append('<div class="flow-lanes">' + "".join(lane_html) + "</div>")
    elif edge.get("stores"):
        sections.append('<h3 class="subsection-title">Stores</h3>' + render_list(edge["stores"]))

    artifact_items = []
    for item in edge.get("artifactFlow", []):
        agent_href = item.get("agentHref", "")
        agent_html = (
            f'<a href="{escape(rel_href(edge["href"], agent_href))}">{escape(item.get("agentLabel", item.get("agentId", "")))}</a>'
            if agent_href
            else escape(item.get("agentLabel", item.get("agentId", "")))
        )
        detail_bits = []
        for bit in [item.get("label", ""), item.get("data", "")]:
            if bit and bit not in detail_bits:
                detail_bits.append(bit)
        detail = " · ".join(detail_bits)
        artifact_items.append(
            "<li>"
            f"{agent_html}: {escape(detail)} "
            f'<span class="meta-badge">{flow_direction_badge(item.get("direction", ""))}</span>'
            "</li>"
        )
    if artifact_items:
        sections.append(
            '<h3 class="subsection-title">Agent-Mediated Flow</h3>' + "<ul>" + "".join(artifact_items) + "</ul>"
        )

    if not sections:
        return '<p class="empty">No artifact flow evidence documented.</p>'
    return "".join(sections)


def render_claim_section(
    claim: str,
    title: str,
    body_html: str,
    ref_ids: list[str],
    ref_lookup: dict[str, dict],
    *,
    open_by_default: bool = True,
) -> str:
    open_attr = " open" if open_by_default else ""
    refs = render_ref_sup(ref_ids, ref_lookup)
    return textwrap.dedent(
        f"""
        <section class="claim-block" data-claim="{escape(claim)}">
            <details{open_attr}>
                <summary>{escape(title)}</summary>
                <div class="claim-body">
                    {body_html.rstrip()}
                    <p class="meta-note">Sources{refs or ''}</p>
                </div>
            </details>
        </section>
        """
    ).strip()


def render_references(refs: list[dict], extra_class: str = "") -> str:
    section_class = "references-card" + (f" {extra_class}" if extra_class else "")
    if not refs:
        return (
            f'<section class="{escape(section_class)}"><h2 class="section-title">References</h2>'
            '<p class="empty">No source references recorded.</p></section>'
        )
    items = []
    for ref in refs:
        symbols = ", ".join(ref["symbols"])
        display = f'<code>{escape(ref["display_path"])}</code>'
        if symbols:
            display += f" — <code>{escape(symbols)}</code>"
        elif ref["all_symbols"]:
            display += ' — <span class="meta-note">public symbols present but not cited directly</span>'
        items.append(
            f'<li id="{escape(ref["id"])}" data-ui-ref data-path="{escape(ref["display_path"])}" '
            f'data-symbols="{escape(",".join(ref["symbols"]))}">{display}</li>'
        )
    return (
        f'<section class="{escape(section_class)}"><h2 class="section-title">References</h2>'
        '<ol class="references">'
        + "".join(items)
        + "</ol></section>"
    )


site_coverage_for_toolbar = {"referencedSymbols": 0, "totalSymbols": 0, "symbolPercentage": 0.0}


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


def toolbar_html(title: str, subtitle: str, coverage_href: str, *, include_toggle: bool = True) -> str:
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
                {toggle_button}
            </div>
        </header>
        """
    ).strip()


def page_document(
    title: str,
    href: str,
    source_hash: str,
    build_id: str,
    body_html: str,
    *,
    body_class: str = "",
    include_cytoscape: bool = False,
) -> str:
    depth = href.count("/")
    asset_prefix = "../" * depth
    cytoscape_scripts = ""
    if include_cytoscape:
        cytoscape_scripts = (
            '\n        <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>'
            '\n        <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.4/cytoscape.min.js"></script>'
        )
    body_class_attr = f' class="{escape(body_class)}"' if body_class else ""
    return textwrap.dedent(
        f"""\
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="source-hash" content="{escape(source_hash)}">
            <meta name="build-id" content="{escape(build_id)}">
            <title>{escape(title)}</title>
            <link rel="stylesheet" href="{asset_prefix}assets/styles.css">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
            {cytoscape_scripts}
        </head>
        <body{body_class_attr}>
        <div class="page-shell">
            {body_html}
        </div>
        <script src="{asset_prefix}assets/app.js"></script>
        </body>
        </html>
        """
    )


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
