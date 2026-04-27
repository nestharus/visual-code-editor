import type { ProviderAdapter } from "./adapters";
import type { Provider, ProviderConnection, ProviderKind } from "./types";
import { makeProviderConnection } from "./types";

type StubRecord = {
  provider: Provider;
  initCount: number;
  syncCount: number;
  teardownCount: number;
};

const records = new Map<string, StubRecord>();

export function createStubProviderAdapter(kind: Extract<ProviderKind, "github" | "generic-http">): ProviderAdapter {
  return {
    kind,

    async init(provider: Provider): Promise<void> {
      records.set(provider.id, {
        provider,
        initCount: (records.get(provider.id)?.initCount ?? 0) + 1,
        syncCount: records.get(provider.id)?.syncCount ?? 0,
        teardownCount: records.get(provider.id)?.teardownCount ?? 0,
      });
    },

    async sync(
      provider: Provider,
      connection: ProviderConnection,
    ): Promise<ProviderConnection> {
      const record = records.get(provider.id) ?? {
        provider,
        initCount: 0,
        syncCount: 0,
        teardownCount: 0,
      };
      const syncCount = record.syncCount + 1;
      records.set(provider.id, {
        ...record,
        provider,
        syncCount,
      });

      return makeProviderConnection({
        ...connection,
        health: "grounded",
        lastSuccessfulSyncMs: Date.now(),
        lastFailureMs: null,
        lastFailureReason: null,
        pendingRequestCount: 0,
      });
    },

    async teardown(provider: Provider): Promise<void> {
      const record = records.get(provider.id);
      if (record) {
        records.set(provider.id, {
          ...record,
          teardownCount: record.teardownCount + 1,
        });
      }
      records.delete(provider.id);
    },
  };
}

export const githubStubAdapter = createStubProviderAdapter("github");
export const genericHttpStubAdapter = createStubProviderAdapter("generic-http");

export function stubRecordForProvider(providerId: string): StubRecord | null {
  return records.get(providerId) ?? null;
}
