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

import type {
  Provider,
  ProviderConnection,
  ProviderEntityMapping,
  ProviderKind,
} from "../app/lib/provider";
import type { ActorKind } from "../app/lib/actors";

const TEST_DIR = resolve(".tmp/providers-route");
const LOG_PATH = join(TEST_DIR, "watcher.log");

type CreateProviderPayload = {
  kind: ProviderKind | string;
  label: string;
  workspace_id: string;
  config: Record<string, string>;
  mappings?: readonly ProviderEntityMapping[];
  actor?: ActorKind;
};

let watcher: ChildProcessWithoutNullStreams | null = null;
let api: APIRequestContext;
let sequence = 0;
const runId = `${Date.now()}-${process.pid}`;

test.describe.serial("/api/providers", () => {
  test.beforeAll(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });

    const port = await getFreePort();
    watcher = spawn("npx", ["tsx", "server/watcher.ts"], {
      cwd: resolve("."),
      detached: true,
      env: {
        ...process.env,
        WATCHER_PORT: String(port),
      },
    });

    const appendLog = (chunk: Buffer) => {
      writeFileSync(LOG_PATH, chunk, { flag: "a" });
    };
    watcher.stdout.on("data", appendLog);
    watcher.stderr.on("data", appendLog);

    await waitForWatcherReady(port);
    api = await playwrightRequest.newContext({ baseURL: `http://127.0.0.1:${port}` });
  });

  test.afterAll(async () => {
    await api?.dispose();
    if (watcher?.pid) {
      try {
        process.kill(-watcher.pid, "SIGTERM");
      } catch {
        watcher.kill("SIGTERM");
      }
    }

    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("POST creates a GitHub provider and initializes connection state", async () => {
    const body = await createProvider("create-github");

    expect(body).toMatchObject({
      ok: true,
      request_id: expect.any(String),
      provider: {
        id: expect.stringMatching(/^provider:[a-zA-Z0-9._-]+$/),
        kind: "github",
        label: expect.stringContaining("create-github"),
        workspaceId: "workspace:test",
        config: { full_name: "example/repo" },
        mappings: [],
        attributionActor: "you-this-session",
        createdAtMs: expect.any(Number),
      },
      connection: {
        providerId: expect.stringMatching(/^provider:[a-zA-Z0-9._-]+$/),
        health: "grounded",
        lastSuccessfulSyncMs: null,
        pendingRequestCount: 0,
      },
    });
    expect(body.connection.providerId).toBe(body.provider.id);
  });

  test("POST validation rejects empty label, missing config, and invalid kind", async () => {
    for (const payload of [
      providerPayload("empty-label", { label: "   " }),
      omitKey(providerPayload("missing-config"), "config"),
      providerPayload("invalid-kind", { kind: "bitbucket" }),
    ]) {
      const response = await api.post("/api/providers", { data: payload });
      const body = await expectJsonStatus(response, 400);

      expect(body).toMatchObject({
        ok: false,
        error_kind: "validation",
        request_id: expect.any(String),
      });
    }
  });

  test("POST rejects known but unsupported provider kinds", async () => {
    for (const kind of ["jira", "linear", "gitlab"] satisfies readonly ProviderKind[]) {
      const response = await api.post("/api/providers", {
        data: providerPayload(`unsupported-${kind}`, { kind }),
      });
      const body = await expectJsonStatus(response, 400);

      expect(body).toMatchObject({
        ok: false,
        error_kind: "unsupported-kind",
        request_id: expect.any(String),
      });
    }
  });

  test("GET lists providers", async () => {
    const first = await createProvider("list-one");
    const second = await createProvider("list-two", { kind: "generic-http" });

    const response = await api.get("/api/providers");
    const body = await expectJsonStatus(response, 200);

    expect(body.providers).toEqual(expect.any(Array));
    expect(body.providers.map((provider: Provider) => provider.id)).toEqual(
      expect.arrayContaining([first.provider.id, second.provider.id]),
    );
  });

  test("GET /api/providers/:id returns a known provider", async () => {
    const created = await createProvider("read-known");

    const response = await api.get(`/api/providers/${encodeURIComponent(created.provider.id)}`);
    const body = await expectJsonStatus(response, 200);

    expect(body.provider).toMatchObject({
      id: created.provider.id,
      kind: "github",
      label: created.provider.label,
    });
  });

  test("GET /api/providers/:id returns 404 for an unknown provider", async () => {
    const response = await api.get("/api/providers/provider%3Amissing-route-test");
    const body = await expectJsonStatus(response, 404);

    expect(body).toMatchObject({ error: expect.any(String) });
  });

  test("POST /api/providers/:id/sync calls the stub adapter", async () => {
    const created = await createProvider("sync");

    const response = await api.post(
      `/api/providers/${encodeURIComponent(created.provider.id)}/sync`,
    );
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: true,
      request_id: expect.any(String),
      connection: {
        providerId: created.provider.id,
        health: "grounded",
        lastSuccessfulSyncMs: expect.any(Number),
        pendingRequestCount: 0,
      },
    });
  });

  test("GET /api/providers/:id/connection returns current connection state", async () => {
    const created = await createProvider("connection");
    await expectJsonStatus(
      await api.post(`/api/providers/${encodeURIComponent(created.provider.id)}/sync`),
      200,
    );

    const response = await api.get(
      `/api/providers/${encodeURIComponent(created.provider.id)}/connection`,
    );
    const body = await expectJsonStatus(response, 200);

    expect(body.connection).toMatchObject({
      providerId: created.provider.id,
      health: "grounded",
      lastSuccessfulSyncMs: expect.any(Number),
      pendingRequestCount: 0,
    });
  });

  test("DELETE removes a provider and tears down connection state", async () => {
    const created = await createProvider("delete");

    const deleteBody = await expectJsonStatus(
      await api.delete(`/api/providers/${encodeURIComponent(created.provider.id)}`),
      200,
    );
    expect(deleteBody).toMatchObject({ ok: true });

    await expectJsonStatus(
      await api.get(`/api/providers/${encodeURIComponent(created.provider.id)}`),
      404,
    );
    await expectJsonStatus(
      await api.get(`/api/providers/${encodeURIComponent(created.provider.id)}/connection`),
      404,
    );
  });
});

function providerPayload(
  label: string,
  overrides: Partial<CreateProviderPayload> = {},
): CreateProviderPayload {
  return {
    kind: "github",
    label: `Provider ${label} ${uniqueSuffix()}`,
    workspace_id: "workspace:test",
    config: { full_name: "example/repo" },
    mappings: [],
    actor: "you-this-session",
    ...overrides,
  };
}

async function createProvider(
  label: string,
  overrides: Partial<CreateProviderPayload> = {},
): Promise<{ provider: Provider; connection: ProviderConnection }> {
  const response = await api.post("/api/providers", {
    data: providerPayload(label, overrides),
  });
  const body = await expectJsonStatus(response, 200);

  expect(body).toMatchObject({
    ok: true,
    provider: expect.any(Object),
    request_id: expect.any(String),
  });
  return body;
}

function omitKey<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> {
  const clone = { ...value };
  delete clone[key];
  return clone;
}

async function expectJsonStatus(response: APIResponse, expectedStatus: number) {
  const text = await response.text();
  expect(response.status(), text).toBe(expectedStatus);
  expect(response.headers()["content-type"] ?? "", text).toContain("application/json");
  return JSON.parse(text);
}

function uniqueSuffix() {
  sequence += 1;
  return `${runId}-${sequence}`;
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
