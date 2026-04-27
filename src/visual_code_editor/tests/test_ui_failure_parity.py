import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.ui_failure import (
    ALL_UI_FAILURE_KINDS,
    ALL_UI_FAILURE_SEVERITIES,
)


def test_python_and_typescript_ui_failure_registries_match_in_order():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-ui-failure.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_registry = json.loads(result.stdout)
    py_registry = {
        "uiFailureKinds": [kind.value for kind in ALL_UI_FAILURE_KINDS],
        "uiFailureSeverities": [
            severity.value for severity in ALL_UI_FAILURE_SEVERITIES
        ],
    }

    assert ts_registry == py_registry, (
        "Cross-language parity invariant violated: Python and TypeScript UI failure "
        "registries must expose the same strings in the same order"
    )
