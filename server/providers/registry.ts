import { randomUUID } from "node:crypto";
import { getAdapter } from "./adapters";
import {
  makeProvider,
  makeProviderConnection,
  ProviderAdapterValidationError,
  type CreateProviderRequest,
  type Provider,
  type ProviderConnection,
} from "./types";

export type ProviderErrorKind =
  | "validation"
  | "unsupported-kind"
  | "not-found"
  | "adapter-error"
  | "internal";

export class ProviderRegistryError extends Error {
  readonly errorKind: ProviderErrorKind;

  constructor(errorKind: ProviderErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderRegistryError";
    this.errorKind = errorKind;
  }
}

export type ProviderRegistry = {
  create(request: CreateProviderRequest): Promise<{
    provider: Provider;
    connection: ProviderConnection;
  }>;
  list(): readonly Provider[];
  get(id: string): Provider | null;
  connection(id: string): ProviderConnection | null;
  sync(id: string): Promise<ProviderConnection>;
  delete(id: string): Promise<boolean>;
};

export function createProviderRegistry(): ProviderRegistry {
  const providers = new Map<string, Provider>();
  const connections = new Map<string, ProviderConnection>();

  return {
    async create(request: CreateProviderRequest) {
      const adapter = getAdapter(request.kind);
      if (!adapter) {
        throw new ProviderRegistryError(
          "unsupported-kind",
          `provider kind is not supported: ${request.kind}`,
        );
      }

      const provider = makeProvider({
        id: buildProviderId(request.kind, request.label),
        kind: request.kind,
        label: request.label,
        workspaceId: request.workspaceId,
        config: request.config,
        mappings: request.mappings,
        attributionActor: request.actor,
        createdAtMs: Date.now(),
      });

      const connection = makeProviderConnection({
        providerId: provider.id,
        health: "grounded",
        lastSuccessfulSyncMs: null,
        lastFailureMs: null,
        lastFailureReason: null,
        pendingRequestCount: 0,
      });

      try {
        await adapter.init(provider);
      } catch (error) {
        if (error instanceof ProviderAdapterValidationError) {
          throw new ProviderRegistryError(
            "validation",
            errorMessage(error, "provider adapter validation failed"),
            { cause: error },
          );
        }

        throw new ProviderRegistryError(
          "adapter-error",
          errorMessage(error, "provider adapter init failed"),
          { cause: error },
        );
      }

      providers.set(provider.id, provider);
      connections.set(provider.id, connection);
      return { provider, connection };
    },

    list(): readonly Provider[] {
      return Array.from(providers.values());
    },

    get(id: string): Provider | null {
      return providers.get(id) ?? null;
    },

    connection(id: string): ProviderConnection | null {
      return connections.get(id) ?? null;
    },

    async sync(id: string): Promise<ProviderConnection> {
      const provider = providers.get(id);
      if (!provider) {
        throw new ProviderRegistryError("not-found", "not found");
      }

      const connection = connections.get(id);
      if (!connection) {
        throw new ProviderRegistryError("internal", "missing provider connection");
      }

      const adapter = getAdapter(provider.kind);
      if (!adapter) {
        throw new ProviderRegistryError(
          "unsupported-kind",
          `provider kind is not supported: ${provider.kind}`,
        );
      }

      const pendingConnection = makeProviderConnection({
        ...connection,
        pendingRequestCount: connection.pendingRequestCount + 1,
      });
      connections.set(id, pendingConnection);

      try {
        const synced = await adapter.sync(provider, pendingConnection);
        const normalized = makeProviderConnection(synced);
        connections.set(id, normalized);
        return normalized;
      } catch (error) {
        const failed = makeProviderConnection({
          ...pendingConnection,
          health: "stale",
          lastFailureMs: Date.now(),
          lastFailureReason: errorMessage(error, "provider adapter sync failed"),
          pendingRequestCount: 0,
        });
        connections.set(id, failed);
        throw new ProviderRegistryError(
          "adapter-error",
          failed.lastFailureReason ?? "provider adapter sync failed",
          { cause: error },
        );
      }
    },

    async delete(id: string): Promise<boolean> {
      const provider = providers.get(id);
      if (!provider) return false;

      const adapter = getAdapter(provider.kind);
      if (adapter) {
        try {
          await adapter.teardown(provider);
        } catch (error) {
          throw new ProviderRegistryError(
            "adapter-error",
            errorMessage(error, "provider adapter teardown failed"),
            { cause: error },
          );
        }
      }

      providers.delete(id);
      connections.delete(id);
      return true;
    },
  };
}

function buildProviderId(kind: string, label: string): string {
  return `provider:${kind}-${slugify(label)}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "provider";
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
