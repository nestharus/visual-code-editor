"""Parser for the lifemap v1 behavioral DSL."""

from __future__ import annotations

import json
import shlex
from pathlib import Path

from visual_code_editor.model import WorkspaceModel
from visual_code_editor.model.behavioral import Artifact, CodeBlock, Lifecycle, Stage, Step

_BLOCK_KEYWORDS = {"lifecycle", "stage", "step", "artifact", "code_block"}


def _parse_header(line: str) -> tuple[str, str, str]:
    parts = shlex.split(line)
    if len(parts) < 2 or parts[0] != "map" or parts[1] != "lifemap/v1":
        raise ValueError(f"Invalid lifemap header: {line}")

    values: dict[str, str] = {}
    for token in parts[2:]:
        key, sep, value = token.partition("=")
        if not sep:
            raise ValueError(f"Invalid header token: {token}")
        values[key] = value

    try:
        return values["build"], values["root"], values["hash"]
    except KeyError as exc:
        raise ValueError(f"Missing lifemap header field: {exc.args[0]}") from exc


def _parse_block_start(line: str) -> tuple[str, str, str]:
    for keyword in _BLOCK_KEYWORDS:
        prefix = f"{keyword} "
        if not line.startswith(prefix):
            continue
        remainder = line[len(prefix) :]
        entity_id, sep, label_raw = remainder.partition(" ")
        if not sep or not label_raw:
            break
        try:
            return keyword, entity_id, json.loads(label_raw)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid quoted label in line: {line}") from exc
    raise ValueError(f"Invalid lifemap entity line: {line}")


def _parse_list(value: str) -> list[str]:
    if value == "-":
        return []
    return [item for item in value.split(", ") if item]


def _parse_string(value: str) -> str:
    if value == "-":
        return ""
    if value.startswith('"'):
        return json.loads(value)
    return value


def _parse_field_line(line: str) -> tuple[str, str]:
    stripped = line.strip()
    key, sep, value = stripped.partition(": ")
    if not sep:
        raise ValueError(f"Invalid field line: {line}")
    return key, value


def _parse_lines(value: str) -> tuple[int, int]:
    start_text, sep, end_text = value.partition("-")
    if not sep:
        raise ValueError(f"Invalid code block lines field: {value}")
    return int(start_text), int(end_text)


def _build_lifecycle(entity_id: str, label: str, fields: dict[str, str]) -> Lifecycle:
    return Lifecycle(
        id=entity_id,
        label=label,
        description=_parse_string(fields.get("description", "-")),
        stage_ids=_parse_list(fields.get("stages", "-")),
        entry_artifact_ids=_parse_list(fields.get("entry_artifacts", "-")),
        exit_artifact_ids=_parse_list(fields.get("exit_artifacts", "-")),
        component_ids=_parse_list(fields.get("components", "-")),
    )


def _build_stage(entity_id: str, label: str, fields: dict[str, str]) -> Stage:
    return Stage(
        id=entity_id,
        lifecycle_id=_parse_string(fields.get("lifecycle", "-")),
        label=label,
        description=_parse_string(fields.get("description", "-")),
        step_ids=_parse_list(fields.get("steps", "-")),
        input_artifact_ids=_parse_list(fields.get("inputs", "-")),
        output_artifact_ids=_parse_list(fields.get("outputs", "-")),
        executor_component_ids=_parse_list(fields.get("executors", "-")),
    )


def _build_step(entity_id: str, label: str, fields: dict[str, str]) -> Step:
    return Step(
        id=entity_id,
        stage_id=_parse_string(fields.get("stage", "-")),
        label=label,
        description=_parse_string(fields.get("description", "-")),
        executor_kind=_parse_string(fields.get("executor_kind", "python")),
        input_artifact_ids=_parse_list(fields.get("inputs", "-")),
        output_artifact_ids=_parse_list(fields.get("outputs", "-")),
        component_ids=_parse_list(fields.get("components", "-")),
        code_block_ids=_parse_list(fields.get("code_blocks", "-")),
    )


def _build_artifact(entity_id: str, label: str, fields: dict[str, str]) -> Artifact:
    return Artifact(
        id=entity_id,
        label=label,
        kind=_parse_string(fields.get("kind", "-")),
        location=_parse_string(fields.get("location", "-")),
        producer_step_ids=_parse_list(fields.get("producers", "-")),
        consumer_step_ids=_parse_list(fields.get("consumers", "-")),
        store_ids=_parse_list(fields.get("stores", "-")),
    )


def _build_code_block(entity_id: str, label: str, fields: dict[str, str]) -> CodeBlock:
    line_start, line_end = _parse_lines(fields.get("lines", "0-0"))
    return CodeBlock(
        id=entity_id,
        path=_parse_string(fields.get("path", "-")),
        line_start=line_start,
        line_end=line_end,
        symbol=_parse_string(fields.get("symbol", "-")),
        language=_parse_string(fields.get("language", "python")),
        component_id=_parse_string(fields.get("component", "-")),
        step_ids=_parse_list(fields.get("steps", "-")),
    )


def parse_lifemap_v1(path: str | Path) -> WorkspaceModel:
    """Parse a lifemap v1 artifact into a workspace model."""
    source = Path(path)
    lines = source.read_text(encoding="utf-8").splitlines()

    header_line = next((line.strip() for line in lines if line.strip().startswith("map ")), "")
    if not header_line:
        raise ValueError("Missing lifemap header")
    build_id, source_root, source_hash = _parse_header(header_line)

    artifacts: dict[str, Artifact] = {}
    lifecycles: dict[str, Lifecycle] = {}
    stages: dict[str, Stage] = {}
    steps: dict[str, Step] = {}
    code_blocks: dict[str, CodeBlock] = {}

    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped or stripped.startswith("map "):
            index += 1
            continue
        if line.startswith(" "):
            raise ValueError(f"Field line without entity block: {line}")

        keyword, entity_id, label = _parse_block_start(stripped)
        index += 1

        fields: dict[str, str] = {}
        while index < len(lines):
            field_line = lines[index]
            if not field_line.strip():
                index += 1
                continue
            if not field_line.startswith(" "):
                break
            key, value = _parse_field_line(field_line)
            fields[key] = value
            index += 1

        if keyword == "lifecycle":
            lifecycles[entity_id] = _build_lifecycle(entity_id, label, fields)
        elif keyword == "stage":
            stages[entity_id] = _build_stage(entity_id, label, fields)
        elif keyword == "step":
            steps[entity_id] = _build_step(entity_id, label, fields)
        elif keyword == "artifact":
            artifacts[entity_id] = _build_artifact(entity_id, label, fields)
        elif keyword == "code_block":
            code_blocks[entity_id] = _build_code_block(entity_id, label, fields)

    return WorkspaceModel(
        build_id=build_id,
        source_root=source_root,
        components={},
        organizational_edges=[],
        artifacts=artifacts,
        lifecycles=lifecycles,
        stages=stages,
        steps=steps,
        code_blocks=code_blocks,
        stores={},
        crossrefs=[],
        source_hash=source_hash,
        metadata={"views": {"behavioral": {"available": True}}},
    )


__all__ = ["parse_lifemap_v1"]
