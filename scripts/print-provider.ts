import {
  makeProvider,
  makeProviderConnection,
  providerHealthStateFromString,
  providerKindFromString,
  type ProviderKind,
  type ProviderHealthState,
} from "../app/lib/provider";
import { makeTrustSignal } from "../app/lib/trust";

const providerKinds = [
  "github",
  "gitlab",
  "jira",
  "linear",
  "generic-http",
] as const satisfies readonly ProviderKind[];

const providerHealthStates = [
  "grounded",
  "stale",
  "conflicting",
] as const satisfies readonly ProviderHealthState[];

const provider = makeProvider({
  id: "provider:github-main",
  kind: "github",
  label: "GitHub main repository",
  workspaceId: "workspace:main",
  config: { full_name: "example/repo" },
  mappings: [
    {
      providerField: "issue.state",
      workspaceField: "behaviour.lifecycle_state",
      trust: makeTrustSignal("grounded", "provider-verified"),
      evidenceSource: "github issue state",
    },
    {
      providerField: "issue.assignee.login",
      workspaceField: "owner.handle",
      trust: makeTrustSignal("candidate", null),
      evidenceSource: "provider field name match",
    },
  ],
  attributionActor: "agents:provider-mapper",
  createdAtMs: 1_700_000_000_000,
});

const connection = makeProviderConnection({
  providerId: "provider:github-main",
  health: "stale",
  lastSuccessfulSyncMs: 1_700_000_001_000,
  lastFailureMs: null,
  lastFailureReason: null,
  pendingRequestCount: 2,
});

console.log(
  JSON.stringify({
    providerKinds: providerKinds.map(providerKindFromString),
    providerHealthStates: providerHealthStates.map(providerHealthStateFromString),
    provider,
    connection,
  }),
);
