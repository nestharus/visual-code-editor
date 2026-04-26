"""Parse source files into a small structural skeleton for behavior extraction."""

from __future__ import annotations

import ast
from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class ParseUnitKind(str, Enum):
    FUNCTION = "function"
    CLASS = "class"
    BLOCK = "block"
    TOP_LEVEL = "top-level"


@dataclass(frozen=True)
class ParseUnit:
    kind: ParseUnitKind
    name: str | None
    start_line: int
    end_line: int
    children: tuple["ParseUnit", ...] = ()


@dataclass(frozen=True)
class ParseTree:
    file_path: str
    language: str
    units: tuple[ParseUnit, ...]


def _language_for_path(file_path: str) -> str:
    suffix = Path(file_path).suffix.lower()
    if suffix == ".py":
        return "python"
    if suffix in {".ts", ".tsx"}:
        return "typescript"
    if suffix in {".js", ".jsx"}:
        return "javascript"
    return "other"


def _line_count(source: str) -> int:
    return max(1, len(source.splitlines()))


def _node_end_line(node: ast.AST) -> int:
    return int(getattr(node, "end_lineno", getattr(node, "lineno", 1)))


def _is_named_unit(node: ast.AST) -> bool:
    return isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))


def _parse_named_unit(node: ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef) -> ParseUnit:
    if isinstance(node, ast.ClassDef):
        kind = ParseUnitKind.CLASS
    else:
        kind = ParseUnitKind.FUNCTION

    children = tuple(_parse_named_unit(child) for child in node.body if _is_named_unit(child))
    return ParseUnit(
        kind=kind,
        name=node.name,
        start_line=node.lineno,
        end_line=_node_end_line(node),
        children=children,
    )


def _parse_python(file_path: str, source: str) -> ParseTree:
    module = ast.parse(source, filename=file_path)
    units: list[ParseUnit] = []

    top_level_nodes = [node for node in module.body if not _is_named_unit(node)]
    if top_level_nodes:
        units.append(
            ParseUnit(
                kind=ParseUnitKind.TOP_LEVEL,
                name=None,
                start_line=min(getattr(node, "lineno", 1) for node in top_level_nodes),
                end_line=max(_node_end_line(node) for node in top_level_nodes),
            )
        )

    units.extend(_parse_named_unit(node) for node in module.body if _is_named_unit(node))
    units.sort(key=lambda unit: (unit.start_line, unit.end_line, unit.kind.value))
    return ParseTree(file_path=file_path, language="python", units=tuple(units))


def parse_content(
    content: str,
    file_path: str,
    language: str | None = None,
) -> ParseTree:
    """Return a structural parse tree for source content."""

    resolved_language = language or _language_for_path(file_path)

    if resolved_language == "python":
        return _parse_python(file_path, content)

    return ParseTree(
        file_path=file_path,
        language=resolved_language,
        units=(
            ParseUnit(
                kind=ParseUnitKind.TOP_LEVEL,
                name=None,
                start_line=1,
                end_line=_line_count(content),
            ),
        ),
    )


def parse(file_path: str) -> ParseTree:
    """Return a structural parse tree for a source file."""

    source = Path(file_path).read_text(encoding="utf-8")
    return parse_content(source, file_path)
