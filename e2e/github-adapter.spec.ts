import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

import type { Provider, ProviderConnection } from "../app/lib/provider";

const TEST_DIR = resolve(".tmp/github-adapter");
const MOCK_LOG_PATH = join(TEST_DIR, "mock-watcher.log");
const MISSING_TOKEN_LOG_PATH = join(TEST_DIR, "missing-token-watcher.log");
const LIVE_LOG_PATH = join(TEST_DIR, "live-watcher.log");

type CreateProviderPayload = {
  kind: "github";
  label: string;
  workspace_id: string;
  config: Record<string, string>;
  mappings: [];
  actor: "you-this-session";
};

type CachedPullRequest = {
  number: number;
  title: string;
  head_sha: string;
  base_sha: string;
  merged: boolean;
  fetched_at_ms: number;
};

type WatcherHarness = {
  api: APIRequestContext;
  port: number;
  stop: () => Promise<void>;
};

let sequence = 0;
const runId = `${Date.now()}-${process.pid}`;

const stubResponses = {
  providers: {
    "octo/two-prs": {
      user: { login: "octo-test" },
      pulls: [
        {
          number: 17,
          title: "Add provider cache",
          head_sha: "1111111111111111111111111111111111111111",
          base_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          merged: false,
        },
        {
          number: 42,
          title: "Wire sync state",
          head_sha: "2222222222222222222222222222222222222222",
          base_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          merged: false,
        },
      ],
    },
    "octo/init-401": {
      userError: { status: 401, message: "Bad credentials" },
      pulls: [],
    },
    "octo/sync-401": {
      user: { login: "octo-test" },
      pullsError: { status: 401, message: "Bad credentials" },
    },
    "octo/network-error": {
      user: { login: "octo-test" },
      pullsError: { code: "ECONNRESET", message: "socket hang up" },
    },
    "octo/empty": {
      user: { login: "octo-test" },
      pulls: [],
    },
  },
};

test.describe.serial("real GitHub provider adapter contract", () => {
  let harness: WatcherHarness;

  test.beforeAll(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });

    harness = await startWatcher(MOCK_LOG_PATH, {
      GITHUB_TOKEN: "ghp_mock_token",
      GITHUB_ADAPTER_STUB_RESPONSES: JSON.stringify(stubResponses),
    });
  });

  test.afterAll(async () => {
    await harness?.stop();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("init validates config.repo", async () => {
    for (const config of [{}, { repo: "" }, { repo: "missing-owner" }]) {
      const response = await harness.api.post("/api/providers", {
        data: providerPayload("bad-repo", config),
      });
      const body = await expectJsonStatus(response, 400);

      expect(body).toMatchObject({
        ok: false,
        error_kind: "validation",
        request_id: expect.any(String),
      });
      expect(String(body.error)).toContain("repo");
    }
  });

  test("init validates auth", async () => {
    const response = await harness.api.post("/api/providers", {
      data: providerPayload("init-auth-401", { repo: "octo/init-401" }),
    });
    const body = await expectJsonStatus(response, 500);

    expect(body).toMatchObject({
      ok: false,
      error_kind: "adapter-error",
      request_id: expect.any(String),
    });
    expect(String(body.error)).toContain("Bad credentials");
  });

  test("sync lists open PRs into the provider cache", async () => {
    const created = await createProvider(harness.api, "sync-two-prs", "octo/two-prs");

    const syncBody = await expectJsonStatus(
      await harness.api.post(
        `/api/providers/${encodeURIComponent(created.provider.id)}/sync`,
      ),
      200,
    );
    expect(syncBody).toMatchObject({
      ok: true,
      connection: {
        providerId: created.provider.id,
        health: "grounded",
        lastSuccessfulSyncMs: expect.any(Number),
        lastFailureMs: null,
        lastFailureReason: null,
        pendingRequestCount: 0,
      },
    });

    const cached = await getCachedPullRequests(harness.api, created.provider.id);
    expect(cached).toHaveLength(2);
    expect(cached).toEqual([
      expect.objectContaining({
        number: 17,
        title: "Add provider cache",
        head_sha: "1111111111111111111111111111111111111111",
        base_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        merged: false,
        fetched_at_ms: expect.any(Number),
      }),
      expect.objectContaining({
        number: 42,
        title: "Wire sync state",
        head_sha: "2222222222222222222222222222222222222222",
        base_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        merged: false,
        fetched_at_ms: expect.any(Number),
      }),
    ]);
  });

  test("sync 401 marks the connection conflicting with a reason", async () => {
    const created = await createProvider(harness.api, "sync-401", "octo/sync-401");

    const body = await expectJsonStatus(
      await harness.api.post(
        `/api/providers/${encodeURIComponent(created.provider.id)}/sync`,
      ),
      200,
    );

    expect(body).toMatchObject({
      ok: true,
      connection: {
        providerId: created.provider.id,
        health: "conflicting",
        lastSuccessfulSyncMs: null,
        lastFailureMs: expect.any(Number),
        lastFailureReason: expect.stringContaining("Bad credentials"),
        pendingRequestCount: 0,
      },
    });
  });

  test("sync network error marks the connection stale with a reason", async () => {
    const created = await createProvider(
      harness.api,
      "sync-network-error",
      "octo/network-error",
    );

    const body = await expectJsonStatus(
      await harness.api.post(
        `/api/providers/${encodeURIComponent(created.provider.id)}/sync`,
      ),
      200,
    );

    expect(body).toMatchObject({
      ok: true,
      connection: {
        providerId: created.provider.id,
        health: "stale",
        lastSuccessfulSyncMs: null,
        lastFailureMs: expect.any(Number),
        lastFailureReason: expect.stringContaining("socket hang up"),
        pendingRequestCount: 0,
      },
    });
  });

  test("teardown clears cached PRs for the provider", async () => {
    const created = await createProvider(
      harness.api,
      "teardown-cache",
      "octo/two-prs",
    );
    await expectJsonStatus(
      await harness.api.post(
        `/api/providers/${encodeURIComponent(created.provider.id)}/sync`,
      ),
      200,
    );
    expect(await getCachedPullRequests(harness.api, created.provider.id)).toHaveLength(2);

    await expectJsonStatus(
      await harness.api.delete(`/api/providers/${encodeURIComponent(created.provider.id)}`),
      200,
    );
    await expectJsonStatus(
      await harness.api.get(
        `/api/providers/${encodeURIComponent(created.provider.id)}/pull-requests`,
      ),
      404,
    );
  });
});

test("GITHUB_TOKEN missing returns validation", async () => {
  const harness = await startWatcher(MISSING_TOKEN_LOG_PATH, {
    GITHUB_TOKEN: undefined,
    GITHUB_ADAPTER_STUB_RESPONSES: JSON.stringify(stubResponses),
  });

  try {
    const response = await harness.api.post("/api/providers", {
      data: providerPayload("missing-token", { repo: "octo/empty" }),
    });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error_kind: "validation",
      request_id: expect.any(String),
    });
    expect(String(body.error)).toContain("GITHUB_TOKEN not set");
  } finally {
    await harness.stop();
  }
});

test("live GitHub adapter syncs a configured repo", async () => {
  test.skip(
    !process.env.GITHUB_TOKEN || !process.env.GITHUB_TEST_REPO,
    "no GitHub creds",
  );

  const harness = await startWatcher(LIVE_LOG_PATH, {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_ADAPTER_STUB_RESPONSES: undefined,
  });

  try {
    const created = await createProvider(
      harness.api,
      "live",
      process.env.GITHUB_TEST_REPO ?? "",
    );
    const body = await expectJsonStatus(
      await harness.api.post(
        `/api/providers/${encodeURIComponent(created.provider.id)}/sync`,
      ),
      200,
    );

    expect(body).toMatchObject({
      ok: true,
      connection: {
        providerId: created.provider.id,
        health: "grounded",
        lastSuccessfulSyncMs: expect.any(Number),
        pendingRequestCount: 0,
      },
    });
    expect(await getCachedPullRequests(harness.api, created.provider.id)).toEqual(
      expect.any(Array),
    );
  } finally {
    await harness.stop();
  }
});

async function createProvider(
  api: APIRequestContext,
  label: string,
  repo: string,
): Promise<{ provider: Provider; connection: ProviderConnection }> {
  const response = await api.post("/api/providers", {
    data: providerPayload(label, { repo }),
  });
  const body = await expectJsonStatus(response, 200);

  expect(body).toMatchObject({
    ok: true,
    provider: {
      id: expect.stringMatching(/^provider:[a-zA-Z0-9._-]+$/),
      kind: "github",
      config: { repo },
    },
    connection: {
      providerId: body.provider.id,
      health: "grounded",
      lastSuccessfulSyncMs: null,
      pendingRequestCount: 0,
    },
    request_id: expect.any(String),
  });
  return body;
}

function providerPayload(
  label: string,
  config: Record<string, string> = { repo: "octo/empty" },
): CreateProviderPayload {
  return {
    kind: "github",
    label: `GitHub ${label} ${uniqueSuffix()}`,
    workspace_id: "workspace:test",
    config,
    mappings: [],
    actor: "you-this-session",
  };
}

async function getCachedPullRequests(
  api: APIRequestContext,
  providerId: string,
): Promise<CachedPullRequest[]> {
  const body = await expectJsonStatus(
    await api.get(`/api/providers/${encodeURIComponent(providerId)}/pull-requests`),
    200,
  );

  expect(body).toMatchObject({
    provider_id: providerId,
    pull_requests: expect.any(Array),
  });
  return body.pull_requests;
}

async function expectJsonStatus(response: APIResponse, expectedStatus: number) {
  const text = await response.text();
  expect(response.status(), text).toBe(expectedStatus);
  expect(response.headers()["content-type"] ?? "", text).toContain("application/json");
  return JSON.parse(text);
}

async function startWatcher(
  logPath: string,
  env: Record<string, string | undefined>,
): Promise<WatcherHarness> {
  mkdirSync(TEST_DIR, { recursive: true });

  const port = await getFreePort();
  const processEnv = { ...process.env, WATCHER_PORT: String(port), ...env };

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete processEnv[key];
    }
  }

  const watcher = spawn("npx", ["tsx", "server/watcher.ts"], {
    cwd: resolve("."),
    detached: true,
    env: processEnv,
  });

  const appendLog = (chunk: Buffer) => {
    writeFileSync(logPath, chunk, { flag: "a" });
  };
  watcher.stdout.on("data", appendLog);
  watcher.stderr.on("data", appendLog);

  await waitForWatcherReady(port);
  const api = await playwrightRequest.newContext({
    baseURL: `http://127.0.0.1:${port}`,
  });

  return {
    api,
    port,
    async stop() {
      await api.dispose();
      if (!watcher.pid) return;

      try {
        process.kill(-watcher.pid, "SIGTERM");
      } catch {
        watcher.kill("SIGTERM");
      }
    },
  };
}

function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a TCP port")));
        return;
      }
      const port = address.port;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForWatcherReady(port: number) {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/watch`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }

  throw new Error(`Watcher did not start on port ${port}: ${String(lastError)}`);
}

function uniqueSuffix() {
  sequence += 1;
  return `${runId}-${sequence}`;
}
