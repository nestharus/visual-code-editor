import type { Provider, ProviderConnection, ProviderKind } from "./types";
import { genericHttpStubAdapter, githubStubAdapter } from "./github_stub";

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

registerAdapter(githubStubAdapter);
registerAdapter(genericHttpStubAdapter);

export function registerAdapter(adapter: ProviderAdapter): void {
  adapters.set(adapter.kind, adapter);
}

export function getAdapter(kind: ProviderKind): ProviderAdapter | null {
  return adapters.get(kind) ?? null;
}
