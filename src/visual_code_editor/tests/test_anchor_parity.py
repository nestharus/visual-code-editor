import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.anchor import (
    CONTAINER_ANCHOR_KINDS,
    AnchorKind,
    SelectionMode,
)


def test_python_and_typescript_anchor_registries_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-anchor.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_registry = json.loads(result.stdout)
    py_registry = {
        "anchorKinds": [kind.value for kind in AnchorKind],
        "selectionModes": [mode.value for mode in SelectionMode],
        "containerAnchorKinds": sorted(kind.value for kind in CONTAINER_ANCHOR_KINDS),
    }

    assert ts_registry == py_registry, (
        "Cross-language parity invariant violated: Python and TypeScript anchor vocabulary "
        "must expose the same anchor kinds, selection modes, and container anchor set"
    )
