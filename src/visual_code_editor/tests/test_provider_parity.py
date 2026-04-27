import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from visual_code_editor.model.actors import ActorKind
from visual_code_editor.model.provider import (
    Provider,
    ProviderConnection,
    ProviderEntityMapping,
    ProviderHealthState,
    ProviderKind,
)
from visual_code_editor.model.trust import GroundingSource, TrustSignal, TrustState


PARITY_PROVIDER = {
    "id": "provider:github-main",
    "kind": "github",
    "label": "GitHub main repository",
    "workspaceId": "workspace:main",
    "config": {"full_name": "example/repo"},
    "mappings": (
        {
            "providerField": "issue.state",
            "workspaceField": "behaviour.lifecycle_state",
            "trust": {
                "state": "grounded",
                "grounding": "provider-verified",
            },
            "evidenceSource": "github issue state",
        },
        {
            "providerField": "issue.assignee.login",
            "workspaceField": "owner.handle",
            "trust": {
                "state": "candidate",
                "grounding": None,
            },
            "evidenceSource": "provider field name match",
        },
    ),
    "attributionActor": "agents:provider-mapper",
    "createdAtMs": 1_700_000_000_000,
}

PARITY_CONNECTION = {
    "providerId": "provider:github-main",
    "health": "stale",
    "lastSuccessfulSyncMs": 1_700_000_001_000,
    "lastFailureMs": None,
    "lastFailureReason": None,
    "pendingRequestCount": 2,
}


def _trust_signal(payload):
    return TrustSignal(
        state=TrustState(payload["state"]),
        grounding=(
            GroundingSource(payload["grounding"])
            if payload["grounding"] is not None
            else None
        ),
    )


def _provider_from_payload(payload) -> Provider:
    return Provider(
        id=payload["id"],
        kind=ProviderKind(payload["kind"]),
        label=payload["label"],
        workspace_id=payload["workspaceId"],
        config=dict(payload["config"]),
        mappings=tuple(
            ProviderEntityMapping(
                provider_field=mapping["providerField"],
                workspace_field=mapping["workspaceField"],
                trust=_trust_signal(mapping["trust"]),
                evidence_source=mapping["evidenceSource"],
            )
            for mapping in payload["mappings"]
        ),
        attribution_actor=ActorKind(payload["attributionActor"]),
        created_at_ms=payload["createdAtMs"],
    )


def _provider_to_payload(provider: Provider):
    return {
        "id": provider.id,
        "kind": provider.kind.value,
        "label": provider.label,
        "workspaceId": provider.workspace_id,
        "config": dict(provider.config),
        "mappings": [
            {
                "providerField": mapping.provider_field,
                "workspaceField": mapping.workspace_field,
                "trust": {
                    "state": mapping.trust.state.value,
                    "grounding": (
                        mapping.trust.grounding.value
                        if mapping.trust.grounding is not None
                        else None
                    ),
                },
                "evidenceSource": mapping.evidence_source,
            }
            for mapping in provider.mappings
        ],
        "attributionActor": provider.attribution_actor.value,
        "createdAtMs": provider.created_at_ms,
    }


def _connection_from_payload(payload) -> ProviderConnection:
    return ProviderConnection(
        provider_id=payload["providerId"],
        health=ProviderHealthState(payload["health"]),
        last_successful_sync_ms=payload["lastSuccessfulSyncMs"],
        last_failure_ms=payload["lastFailureMs"],
        last_failure_reason=payload["lastFailureReason"],
        pending_request_count=payload["pendingRequestCount"],
    )


def _connection_to_payload(connection: ProviderConnection):
    return {
        "providerId": connection.provider_id,
        "health": connection.health.value,
        "lastSuccessfulSyncMs": connection.last_successful_sync_ms,
        "lastFailureMs": connection.last_failure_ms,
        "lastFailureReason": connection.last_failure_reason,
        "pendingRequestCount": connection.pending_request_count,
    }


def test_python_and_typescript_provider_contracts_match():
    result = subprocess.run(
        ["node", "--import", "tsx", "scripts/print-provider.ts"],
        check=True,
        capture_output=True,
        text=True,
    )

    ts_payload = json.loads(result.stdout)
    py_payload = {
        "providerKinds": [kind.value for kind in ProviderKind],
        "providerHealthStates": [state.value for state in ProviderHealthState],
        "provider": _provider_to_payload(_provider_from_payload(PARITY_PROVIDER)),
        "connection": _connection_to_payload(_connection_from_payload(PARITY_CONNECTION)),
    }

    assert ts_payload == py_payload, (
        "Cross-language parity invariant violated: Python and TypeScript provider "
        "schemas must expose the same enum strings and record shapes"
    )
