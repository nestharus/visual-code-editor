import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ALL_ACTORS


def test_python_and_typescript_actor_registries_match_in_order():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-actors.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_actors = json.loads(result.stdout)
    py_actors = [actor.value for actor in ALL_ACTORS]

    assert ts_actors == py_actors, (
        "Cross-language parity invariant violated: Python and TypeScript actor registries "
        "must expose the same actor strings in the same order"
    )
