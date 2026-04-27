import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

import type {
  ChangeEvent,
  ChangeEventKind,
  ChangeEventTier,
  UserContext,
} from "../app/lib/user-context";

const TEST_DIR = resolve(".tmp/change-events-route");
const LOG_PATH = join(TEST_DIR, "watcher.log");

type ChangeEventInput = Omit<ChangeEvent, "tier"> & {
  tier?: ChangeEventTier;
};

let watcher: ChildProcessWithoutNullStreams | null = null;
let api: APIRequestContext;
let sequence = 0;
const runId = `${Date.now()}-${process.pid}`;

test.describe.serial("/api/change-events", () => {
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
        H_TICKER_INTERVAL_MS: "200",
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
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test("POST /api/change-events with no context returns validation 400", async () => {
    const response = await api.post("/api/change-events", {
      data: {
        event: changeEventInput({
          id: `change:no-context-${uniqueSuffix()}`,
          kind: "entity-renamed",
        }),
        request_id: `request:${uniqueSuffix()}`,
      },
    });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error: expect.any(String),
      error_kind: "validation",
    });
  });

  test("POST /api/change-events classifies and returns an event with tier", async () => {
    const context = await putUserContext("user-context:route-classify", {
      openedSurfaces: [
        {
          kind: "diagram",
          entityId: "entity:focused",
          openedAtMs: Date.now() - 20_000,
          lastFocusedAtMs: Date.now() - 1_000,
          totalDwellMs: 19_000,
        },
      ],
    });
    const event = changeEventInput({
      id: `change:classified-${uniqueSuffix()}`,
      kind: "entity-renamed",
      affectedEntityIds: ["entity:focused"],
    });

    const response = await api.post("/api/change-events", {
      data: {
        event,
        user_context_id: context.id,
        request_id: `request:${uniqueSuffix()}`,
      },
    });
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: true,
      classified_event: {
        ...event,
        tier: "immediate",
      },
      request_id: expect.any(String),
    });
  });

  test("GET /api/change-events filters by context and excludes suppressed by default", async () => {
    const contextA = await putUserContext("user-context:route-filter-a");
    const contextB = await putUserContext("user-context:route-filter-b");
    const visibleA = await emitChangeEvent(contextA.id, {
      id: `change:visible-a-${uniqueSuffix()}`,
      kind: "provider-sync",
      affectedEntityIds: ["entity:visible-a"],
      actor: "provider:github:sync",
    });
    const suppressedA = await emitChangeEvent(contextA.id, {
      id: `change:suppressed-a-${uniqueSuffix()}`,
      kind: "entity-added",
      actor: "generator",
      affectedEntityIds: ["entity:suppressed-a"],
      timestampMs: Date.now() - 900_000,
    });
    const visibleB = await emitChangeEvent(contextB.id, {
      id: `change:visible-b-${uniqueSuffix()}`,
      kind: "entity-renamed",
      affectedEntityIds: ["entity:visible-b"],
    });

    expect(visibleA.tier).toBe("stashed");
    expect(suppressedA.tier).toBe("suppressed");
    expect(visibleB.tier).toBe("immediate");

    const response = await api.get(
      `/api/change-events?user_context_id=${encodeURIComponent(contextA.id)}`,
    );
    const body = await expectJsonStatus(response, 200);

    expect(body.events).toEqual(expect.any(Array));
    const eventIds = body.events.map((event: ChangeEvent) => event.id);
    expect(eventIds).toContain(visibleA.id);
    expect(eventIds).not.toContain(suppressedA.id);
    expect(eventIds).not.toContain(visibleB.id);
  });

  test("POST /api/change-events/:id/dispose updates the event record", async () => {
    const context = await putUserContext("user-context:route-dispose");
    const event = await emitChangeEvent(context.id, {
      id: `change:dispose-${uniqueSuffix()}`,
      kind: "provider-sync",
      actor: "provider:github:sync",
    });

    const response = await api.post(
      `/api/change-events/${encodeURIComponent(event.id)}/dispose`,
      {
        data: {
          disposition: "dismissed",
          user_context_id: context.id,
          request_id: `request:${uniqueSuffix()}`,
        },
      },
    );
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: true,
      event: {
        id: event.id,
        disposition: "dismissed",
        disposedAtMs: expect.any(Number),
      },
      request_id: expect.any(String),
    });

    const listResponse = await api.get(
      `/api/change-events?user_context_id=${encodeURIComponent(
        context.id,
      )}&include_suppressed=true`,
    );
    const listBody = await expectJsonStatus(listResponse, 200);
    const stored = listBody.events.find((candidate: ChangeEvent) => candidate.id === event.id);
    expect(stored).toMatchObject({
      id: event.id,
      disposition: "dismissed",
      disposedAtMs: expect.any(Number),
    });
  });

  test("lifecycle ticker emits change events at the configured interval", async () => {
    const context = await putUserContext("user-context:route-ticker");
    const constructResponse = await api.post("/api/slices/construct", {
      data: {
        query: "Alpha",
        rule: { kind: "direct-neighbours", edgeKinds: [], maxHops: 0 },
        default_ttl_ms: 50,
        actor: "you-this-session",
      },
    });
    const constructBody = await expectJsonStatus(constructResponse, 200);
    expect(constructBody).toMatchObject({ ok: true, slice: { id: expect.any(String) } });

    await expect
      .poll(
        async () => {
          const response = await api.get(
            `/api/change-events?user_context_id=${encodeURIComponent(
              context.id,
            )}&include_suppressed=true`,
          );
          if (response.status() !== 200) {
            return [];
          }
          const body = await response.json();
          return (body.events as ChangeEvent[]).filter((event) =>
            event.affectedEntityIds.includes(constructBody.slice.id),
          ).length;
        },
        { timeout: 1_000, intervals: [100, 200] },
      )
      .toBeGreaterThan(0);
  });
});

async function putUserContext(
  id: string,
  overrides: Partial<UserContext> = {},
): Promise<UserContext> {
  const context: UserContext = {
    id,
    openedSurfaces: [],
    recentPrompts: [],
    activeTaskIds: [],
    activeSliceIds: [],
    autoMotionDisabled: false,
    computedAtMs: Date.now(),
    ...overrides,
  };

  const response = await api.post(`/api/user-context/${encodeURIComponent(id)}`, {
    data: context,
  });
  const body = await expectJsonStatus(response, 200);
  const storedContext = body.user_context ?? body.context ?? body;

  expect(storedContext).toMatchObject({ id });

  return storedContext;
}

async function emitChangeEvent(
  userContextId: string,
  overrides: Partial<ChangeEventInput> = {},
): Promise<ChangeEvent> {
  const response = await api.post("/api/change-events", {
    data: {
      event: changeEventInput(overrides),
      user_context_id: userContextId,
      request_id: `request:${uniqueSuffix()}`,
    },
  });
  const body = await expectJsonStatus(response, 200);
  expect(body).toMatchObject({ ok: true, classified_event: expect.any(Object) });
  return body.classified_event;
}

function changeEventInput(overrides: Partial<ChangeEventInput> = {}): ChangeEventInput {
  return {
    id: overrides.id ?? `change:fixture-${uniqueSuffix()}`,
    kind: overrides.kind ?? ("entity-added" satisfies ChangeEventKind),
    actor: overrides.actor ?? "you-other-session",
    affectedEntityIds: overrides.affectedEntityIds ?? ["entity:fixture"],
    affectedKinds: overrides.affectedKinds ?? ["module"],
    blocking: overrides.blocking ?? false,
    timestampMs: overrides.timestampMs ?? Date.now(),
    contextSummary: overrides.contextSummary ?? "Fixture change event summary.",
    detailUrl: overrides.detailUrl ?? null,
    ...(overrides.tier !== undefined ? { tier: overrides.tier } : {}),
  };
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
