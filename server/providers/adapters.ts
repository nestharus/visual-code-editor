import type { Provider, ProviderConnection, ProviderKind } from "./types";
import { makeProviderConnection } from "./types";
import { githubAdapter } from "./github_adapter";

export interface ProviderAdapter {
  kind: ProviderKind;
  init(provider: Provider): Promise<void>;
  sync(
    provider: Provider,
    connection: ProviderConnection,
  ): Promise<ProviderConnection>;
  teardown(provider: Provider): Promise<void>;
}

const adapters = new Map<ProviderKind, ProviderAdapter>();

export function registerAdapter(adapter: ProviderAdapter): void {
  adapters.set(adapter.kind, adapter);
}

export function getAdapter(kind: ProviderKind): ProviderAdapter | null {
  return adapters.get(kind) ?? null;
}

const genericHttpStubAdapter: ProviderAdapter = {
  kind: "generic-http",

  async init(): Promise<void> {},

  async sync(
    _provider: Provider,
    connection: ProviderConnection,
  ): Promise<ProviderConnection> {
    return makeProviderConnection({
      ...connection,
      health: "grounded",
      lastSuccessfulSyncMs: Date.now(),
      lastFailureMs: null,
      lastFailureReason: null,
      pendingRequestCount: 0,
    });
  },

  async teardown(): Promise<void> {},
};

registerAdapter(githubAdapter);
registerAdapter(genericHttpStubAdapter);
