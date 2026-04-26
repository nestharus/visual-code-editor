"""Extract behavior records from source content provided on stdin."""

from __future__ import annotations

import json
import sys
from enum import Enum
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from visual_code_editor.extractor.behavior_extractor import _rule_based_categorizer
from visual_code_editor.extractor.parse import parse_content


def _json_value(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, tuple):
        return [_json_value(item) for item in value]
    if hasattr(value, "__dataclass_fields__"):
        return {
            field_name: _json_value(getattr(value, field_name))
            for field_name in value.__dataclass_fields__
        }
    return value


def main() -> int:
    payload = json.loads(sys.stdin.read())
    file_path = payload["file_path"]
    content = payload["content"]

    tree = parse_content(content, file_path)
    behaviors = _rule_based_categorizer((tree,), workspace_root=str(Path.cwd()))
    json.dump([_json_value(behavior) for behavior in behaviors], sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
