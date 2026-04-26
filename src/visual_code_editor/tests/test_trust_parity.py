import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.trust import ALL_GROUNDING_SOURCES, ALL_TRUST_STATES


def test_python_and_typescript_trust_registries_match_in_order():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-trust.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_registry = json.loads(result.stdout)
    py_registry = {
        "trustStates": [state.value for state in ALL_TRUST_STATES],
        "groundingSources": [source.value for source in ALL_GROUNDING_SOURCES],
    }

    assert ts_registry == py_registry, (
        "Cross-language parity invariant violated: Python and TypeScript trust registries "
        "must expose the same trust state and grounding source strings in the same order"
    )
