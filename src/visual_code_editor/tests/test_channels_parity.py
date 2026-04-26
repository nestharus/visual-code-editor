import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.channels import (
    CHANNEL_PRECEDENCE,
    ChannelClaimant,
    VisualChannel,
)


def test_python_and_typescript_channel_registries_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-channels.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_registry = json.loads(result.stdout)
    py_registry = {
        "visualChannels": [channel.value for channel in VisualChannel],
        "channelClaimants": [claimant.value for claimant in ChannelClaimant],
        "channelPrecedence": {
            channel.value: [claimant.value for claimant in claimants]
            for channel, claimants in CHANNEL_PRECEDENCE.items()
        },
    }

    assert ts_registry == py_registry, (
        "Cross-language parity invariant violated: Python and TypeScript channel "
        "registries must expose the same channels, claimants, and per-channel precedence"
    )
