import { Octokit } from "@octokit/rest";
import type { ProviderAdapter } from "./adapters";
import {
  makeProviderConnection,
  ProviderAdapterValidationError,
  type Provider,
  type ProviderConnection,
} from "./types";

export interface CachedPR {
  number: number;
  title: string;
  head_sha: string;
  base_sha: string;
  merged: boolean;
  fetched_at_ms: number;
}

type PullResponseItem = {
  number?: unknown;
  title?: unknown;
  head_sha?: unknown;
  base_sha?: unknown;
  merged?: unknown;
  head?: { sha?: unknown };
  base?: { sha?: unknown };
};

type StubProviderResponse = {
  user?: unknown;
  userError?: unknown;
  pulls?: PullResponseItem[];
  pullsError?: unknown;
};

type StubResponses = {
  providers?: Record<string, StubProviderResponse>;
};

const cachedPullRequests = new Map<string, CachedPR[]>();

export class GithubAdapter implements ProviderAdapter {
  readonly kind = "github" as const;

  async init(provider: Provider): Promise<void> {
    const repo = repoFromProvider(provider);
    if (!repo) return;

    assertGithubToken();
    const stub = stubForRepo(repo.fullName);
    if (stub) {
      if (stub.userError) throw errorFromStub(stub.userError);
      return;
    }

    const octokit = makeOctokit();
    await octokit.rest.users.getAuthenticated();
  }

  async sync(
    provider: Provider,
    connection: ProviderConnection,
  ): Promise<ProviderConnection> {
    const repo = repoFromProvider(provider);
    if (!repo) {
      return groundedConnection(connection, []);
    }

    try {
      const pullRequests = await this.listPullRequests(provider.id, repo);
      return groundedConnection(connection, pullRequests);
    } catch (error) {
      const now = Date.now();
      return makeProviderConnection({
        ...connection,
        health: isAuthError(error) ? "conflicting" : "stale",
        lastSuccessfulSyncMs: connection.lastSuccessfulSyncMs,
        lastFailureMs: now,
        lastFailureReason: errorMessage(error, "GitHub pull request sync failed"),
        pendingRequestCount: 0,
      });
    }
  }

  async teardown(provider: Provider): Promise<void> {
    cachedPullRequests.delete(provider.id);
  }

  private async listPullRequests(
    providerId: string,
    repo: ParsedRepo,
  ): Promise<CachedPR[]> {
    const stub = stubForRepo(repo.fullName);
    const fetchedAtMs = Date.now();

    if (stub) {
      if (stub.pullsError) throw errorFromStub(stub.pullsError);
      return normalizePulls(stub.pulls ?? [], fetchedAtMs);
    }

    const octokit = makeOctokit();
    const response = await octokit.rest.pulls.list({
      owner: repo.owner,
      repo: repo.name,
      state: "open",
    });
    const pullRequests = normalizePulls(response.data, fetchedAtMs);
    cachedPullRequests.set(providerId, pullRequests);
    return pullRequests;
  }
}

type ParsedRepo = {
  owner: string;
  name: string;
  fullName: string;
};

export const githubAdapter = new GithubAdapter();

export function getCachedPullRequests(providerId: string): readonly CachedPR[] | null {
  return cachedPullRequests.get(providerId) ?? null;
}

function repoFromProvider(provider: Provider): ParsedRepo | null {
  const configuredRepo = provider.config.repo;
  if (typeof configuredRepo === "string") {
    return parseRepo(configuredRepo);
  }

  const legacyFullName = provider.config.full_name;
  if (typeof legacyFullName === "string" && parseRepoOrNull(legacyFullName)) {
    return null;
  }

  throw new ProviderAdapterValidationError(
    "GitHub provider config.repo must be in owner/name format",
  );
}

function parseRepo(value: string): ParsedRepo {
  const parsed = parseRepoOrNull(value);
  if (!parsed) {
    throw new ProviderAdapterValidationError(
      "GitHub provider config.repo must be in owner/name format",
    );
  }
  return parsed;
}

function parseRepoOrNull(value: string): ParsedRepo | null {
  const trimmed = value.trim();
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(trimmed);
  if (!match) return null;
  return { owner: match[1], name: match[2], fullName: `${match[1]}/${match[2]}` };
}

function makeOctokit(): Octokit {
  assertGithubToken();
  return new Octokit({ auth: process.env.GITHUB_TOKEN });
}

function assertGithubToken(): void {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new ProviderAdapterValidationError("GITHUB_TOKEN not set");
  }
}

function groundedConnection(
  connection: ProviderConnection,
  pullRequests: CachedPR[],
): ProviderConnection {
  cachedPullRequests.set(connection.providerId, pullRequests);
  return makeProviderConnection({
    ...connection,
    health: "grounded",
    lastSuccessfulSyncMs: Date.now(),
    lastFailureMs: null,
    lastFailureReason: null,
    pendingRequestCount: 0,
  });
}

function normalizePulls(
  pulls: readonly PullResponseItem[],
  fetchedAtMs: number,
): CachedPR[] {
  return pulls.map((pull) => ({
    number: numberFromUnknown(pull.number),
    title: stringFromUnknown(pull.title),
    head_sha: stringFromUnknown(pull.head_sha ?? pull.head?.sha),
    base_sha: stringFromUnknown(pull.base_sha ?? pull.base?.sha),
    merged: Boolean(pull.merged),
    fetched_at_ms: fetchedAtMs,
  }));
}

function stubForRepo(repo: string): StubProviderResponse | null {
  const raw = process.env.GITHUB_ADAPTER_STUB_RESPONSES;
  if (!raw) return null;

  let parsed: StubResponses;
  try {
    parsed = JSON.parse(raw) as StubResponses;
  } catch (error) {
    throw new ProviderAdapterValidationError(
      "GITHUB_ADAPTER_STUB_RESPONSES must be valid JSON",
      { cause: error },
    );
  }

  return parsed.providers?.[repo] ?? null;
}

function errorFromStub(value: unknown): Error {
  const record = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const message = typeof record.message === "string"
    ? record.message
    : "GitHub stub error";
  const error = new Error(message) as Error & {
    status?: number;
    code?: string;
  };

  if (typeof record.status === "number") error.status = record.status;
  if (typeof record.code === "string") error.code = record.code;
  return error;
}

function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  return status === 401 || status === 403;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function numberFromUnknown(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringFromUnknown(value: unknown): string {
  return typeof value === "string" ? value : "";
}
