"""Rule-based extractor for reusable UI widgets in Solid TSX files."""

from __future__ import annotations

import os
import re
from collections.abc import Sequence
from pathlib import Path

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.trust import TrustSignal, TrustState
from visual_code_editor.model.widget import (
    Widget,
    WidgetKind,
    WidgetReference,
    WidgetSurface,
)


_COMPONENT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^\s*export\s+function\s+(\w+)\(", re.MULTILINE),
    re.compile(r"^\s*export\s+const\s+(\w+)\s*=", re.MULTILINE),
    re.compile(r"^\s*export\s+default\s+function\s+(\w+)\(", re.MULTILINE),
)

_KIND_PATTERNS: tuple[tuple[tuple[str, ...], WidgetKind], ...] = (
    (("Button",), WidgetKind.BUTTON),
    (("Input", "Textarea", "Field"), WidgetKind.INPUT),
    (("List",), WidgetKind.LIST),
    (("Modal", "Dialog", "Shadowbox"), WidgetKind.MODAL),
    (("Table",), WidgetKind.TABLE),
    (("Tab",), WidgetKind.TAB),
    (("Panel",), WidgetKind.PANEL),
    (("Card",), WidgetKind.CARD),
    (("Tooltip",), WidgetKind.TOOLTIP),
    (("Banner",), WidgetKind.BANNER),
    (("Chip", "Badge"), WidgetKind.CHIP),
    (("Form",), WidgetKind.FORM),
    (("Avatar",), WidgetKind.AVATAR),
    (("Icon",), WidgetKind.ICON),
)

_WIDGET_DIRS: tuple[Path, ...] = (
    Path("app/components"),
    Path("app/graph/cards"),
    Path("app/lib"),
)


def extract_widgets(
    workspace_root: str,
    *,
    file_paths: Sequence[str] | None = None,
    now_ms: int = 0,
) -> list[Widget]:
    """Walks the workspace's UI directories and produces Widget records."""

    root = Path(workspace_root)
    widgets_by_id: dict[str, Widget] = {}

    for file_path in _iter_tsx_files(root, file_paths):
        content = file_path.read_text(encoding="utf-8")
        relative_path = file_path.relative_to(root).as_posix()

        for component_name in _extract_component_names(content):
            widget_id = _widget_id(relative_path, component_name)
            if widget_id in widgets_by_id:
                continue

            widgets_by_id[widget_id] = Widget(
                id=widget_id,
                label=_humanize_label(component_name),
                kind=_classify_kind(component_name),
                references=(
                    WidgetReference(
                        surface=WidgetSurface.SOURCE,
                        identifier=f"{relative_path}#{component_name}",
                        evidence_source="rule-based-extractor",
                    ),
                ),
                trust=TrustSignal(state=TrustState.CANDIDATE, grounding=None),
                attribution_actor=ActorKind.AGENTS_SLICE_CONSTRUCTOR,
                created_at_ms=now_ms,
            )

    return [widgets_by_id[widget_id] for widget_id in sorted(widgets_by_id)]


def _iter_tsx_files(root: Path, file_paths: Sequence[str] | None) -> list[Path]:
    if file_paths is not None:
        return sorted(
            path
            for path in (Path(file_path) for file_path in file_paths)
            if path.suffix == ".tsx" and _is_scanned_path(root, path)
        )

    paths: list[Path] = []
    for relative_dir in _WIDGET_DIRS:
        search_root = root / relative_dir
        if not search_root.exists():
            continue

        for current_dir, _dirnames, filenames in os.walk(search_root):
            for filename in filenames:
                path = Path(current_dir) / filename
                if path.suffix == ".tsx":
                    paths.append(path)

    return sorted(paths)


def _is_scanned_path(root: Path, path: Path) -> bool:
    try:
        relative_path = path.relative_to(root)
    except ValueError:
        return False

    return any(relative_path.is_relative_to(widget_dir) for widget_dir in _WIDGET_DIRS)


def _extract_component_names(content: str) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()

    for pattern in _COMPONENT_PATTERNS:
        for match in pattern.finditer(content):
            name = match.group(1)
            if name not in seen:
                seen.add(name)
                names.append(name)

    return names


def _classify_kind(component_name: str) -> WidgetKind:
    for name_patterns, kind in _KIND_PATTERNS:
        if any(pattern in component_name for pattern in name_patterns):
            return kind
    return WidgetKind.GENERIC


def _widget_id(relative_path: str, component_name: str) -> str:
    path_without_suffix = relative_path.removesuffix(".tsx").replace("/", ".")
    return f"widget:{path_without_suffix}.{component_name}"


def _humanize_label(component_name: str) -> str:
    if not component_name:
        return component_name
    if component_name[0].isupper():
        return component_name

    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", component_name)
