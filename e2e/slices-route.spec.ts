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

import {
  SLICE_ID_PATTERN,
  type NeighbourhoodRule,
  type Slice,
  type SliceLifecycleState,
} from "../app/lib/slice";

const TEST_DIR = resolve(".tmp/slices-route");
const LOG_PATH = join(TEST_DIR, "watcher.log");
const FIXTURE_QUERY = "section_communicator.py";
const MATCHED_ENTITY_ID = "section_communicator_py";
const DIRECT_NEIGHBOUR_IDS = [
  "artifact_io_py",
  "database_client_py",
  "mailbox_service_py",
] as const;
const SHARED_CONTAINER_SIBLING_IDS = [
  "blocker_manager_py",
  "database_client_py",
  "mailbox_service_py",
  "message_poller_py",
] as const;

let watcher: ChildProcessWithoutNullStreams | null = null;
let api: APIRequestContext;
let sequence = 0;
const runId = `${Date.now()}-${process.pid}`;
const createdSlices: Slice[] = [];

test.describe.serial("/api/slices", () => {
  test.beforeAll(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });

    const port = await getFreePort();
    watcher = spawn("npx", ["tsx", "server/watcher.ts"], {
      cwd: resolve("."),
      detached: true,
      env: {
        ...process.env,
        DIAGRAM_JSON: resolve("public/data/diagram.json"),
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

  test.afterEach(async () => {
    await dismissCreatedSlices();
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

  test("empty query returns 400 validation", async () => {
    const response = await api.post("/api/slices/construct", {
      data: constructPayload({ query: "" }),
    });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error_kind: "validation",
      request_id: expect.any(String),
    });
  });

  test("invalid transitive neighbourhood rule returns 400 validation", async () => {
    const response = await api.post("/api/slices/construct", {
      data: constructPayload({
        rule: {
          kind: "transitive-by-edge-kind",
          edgeKinds: [],
          maxHops: 2,
        },
      }),
    });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error_kind: "validation",
      request_id: expect.any(String),
    });
  });

  test("no matches returns 200 with no-matches error kind", async () => {
    const response = await api.post("/api/slices/construct", {
      data: constructPayload({
        query: `slice-route-no-match-${uniqueSuffix()}`,
      }),
    });
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: false,
      error_kind: "no-matches",
      request_id: expect.any(String),
    });
    expect(body.slice).toBeUndefined();
  });

  test("construct matches a known diagram entity by label", async () => {
    const slice = await constructSlice();

    expect(slice).toMatchObject({
      id: expect.stringMatching(SLICE_ID_PATTERN),
      query: FIXTURE_QUERY,
      matchedEntityIds: expect.arrayContaining([MATCHED_ENTITY_ID]),
      lifecycleState: "active",
      createdBy: "you-this-session",
      createdAtMs: expect.any(Number),
      pinnedAtMs: null,
      trust: expect.any(Object),
    });
    expect(slice.matchedEntityIds.length).toBeGreaterThan(0);
    expect(slice.ttlMs).toEqual(expect.any(Number));
  });

  test("EXACT rule constructs an empty neighbourhood", async () => {
    const slice = await constructSlice({ rule: exactRule() });

    expect(slice.rule).toEqual(exactRule());
    expect(slice.neighbourhoodEntityIds).toEqual([]);
  });

  test("DIRECT_NEIGHBOURS rule includes one-hop neighbours", async () => {
    const slice = await constructSlice({ rule: directNeighboursRule() });

    expect(slice.rule).toEqual(directNeighboursRule());
    expect(slice.matchedEntityIds).toContain(MATCHED_ENTITY_ID);
    expect(slice.neighbourhoodEntityIds).toEqual(
      expect.arrayContaining([...DIRECT_NEIGHBOUR_IDS]),
    );
    expect(slice.neighbourhoodEntityIds).not.toContain(MATCHED_ENTITY_ID);
  });

  test("SHARED_CONTAINER rule includes siblings", async () => {
    const slice = await constructSlice({ rule: sharedContainerRule() });

    expect(slice.rule).toEqual(sharedContainerRule());
    expect(slice.matchedEntityIds).toContain(MATCHED_ENTITY_ID);
    expect(slice.neighbourhoodEntityIds).toEqual(
      expect.arrayContaining([...SHARED_CONTAINER_SIBLING_IDS]),
    );
    expect(slice.neighbourhoodEntityIds).not.toContain(MATCHED_ENTITY_ID);
  });

  test("GET /api/slices lists active slices and excludes DISMISSED by default", async () => {
    const activeSlice = await constructSlice();
    const dismissedSlice = await constructSlice();
    await transitionSlice(dismissedSlice.id, "dismissed");

    const response = await api.get("/api/slices");
    const body = await expectJsonStatus(response, 200);
    const listedSlices = body.slices as Slice[];

    expect(listedSlices).toEqual(expect.any(Array));
    expect(listedSlices.map((slice) => slice.id)).toContain(activeSlice.id);
    expect(listedSlices.map((slice) => slice.id)).not.toContain(dismissedSlice.id);
    expect(listedSlices.every((slice) => slice.lifecycleState !== "dismissed")).toBe(true);
  });

  test("transition ACTIVE to PINNED clears ttlMs and sets pinnedAtMs", async () => {
    const slice = await constructSlice({ default_ttl_ms: 30_000 });
    const response = await transitionSlice(slice.id, "pinned");
    const body = await expectJsonStatus(response, 200);
    const pinned = rememberSlice(body.slice);

    expect(body).toMatchObject({
      ok: true,
      slice: {
        id: slice.id,
        lifecycleState: "pinned",
        ttlMs: null,
        pinnedAtMs: expect.any(Number),
      },
    });
    expect(pinned.pinnedAtMs).toBeGreaterThanOrEqual(slice.createdAtMs);
  });

  test("transition PINNED to ACTIVE sets a new ttlMs and clears pinnedAtMs", async () => {
    const slice = await constructSlice({ default_ttl_ms: 30_000 });
    const pinnedBody = await expectJsonStatus(await transitionSlice(slice.id, "pinned"), 200);
    const pinned = rememberSlice(pinnedBody.slice);

    const activeBody = await expectJsonStatus(await transitionSlice(slice.id, "active"), 200);
    const active = rememberSlice(activeBody.slice);

    expect(active).toMatchObject({
      id: slice.id,
      lifecycleState: "active",
      ttlMs: expect.any(Number),
      pinnedAtMs: null,
    });
    expect(active.ttlMs).toBeGreaterThanOrEqual(pinned.pinnedAtMs ?? 0);
  });

  test("invalid DISMISSED to ACTIVE transition returns 400", async () => {
    const slice = await constructSlice();
    await expectJsonStatus(await transitionSlice(slice.id, "dismissed"), 200);

    const response = await transitionSlice(slice.id, "active");
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error_kind: expect.stringMatching(/invalid-transition|validation/),
    });
  });
});

function constructPayload(overrides: Record<string, unknown> = {}) {
  return {
    query: FIXTURE_QUERY,
    rule: exactRule(),
    default_ttl_ms: 60_000,
    ...overrides,
  };
}

async function constructSlice(overrides: Record<string, unknown> = {}) {
  const response = await api.post("/api/slices/construct", {
    data: constructPayload(overrides),
  });
  const body = await expectJsonStatus(response, 200);

  expect(body).toMatchObject({
    ok: true,
    slice: expect.any(Object),
    request_id: expect.any(String),
  });
  return rememberSlice(body.slice);
}

async function transitionSlice(sliceId: string, toState: SliceLifecycleState) {
  return api.post(`/api/slices/${encodeURIComponent(sliceId)}/transition`, {
    data: {
      to_state: toState,
      actor: "you-this-session",
    },
  });
}

function rememberSlice(slice: Slice) {
  const index = createdSlices.findIndex((candidate) => candidate.id === slice.id);
  if (index === -1) {
    createdSlices.push(slice);
  } else {
    createdSlices[index] = slice;
  }
  return slice;
}

async function dismissCreatedSlices() {
  for (const slice of [...createdSlices]) {
    if (slice.lifecycleState === "dismissed") continue;
    try {
      const response = await transitionSlice(slice.id, "dismissed");
      if (response.ok()) {
        const body = await response.json();
        if (body.slice) rememberSlice(body.slice);
      }
    } catch {
      // Best-effort cleanup; route assertions surface actual failures.
    }
  }
}

async function expectJsonStatus(response: APIResponse, expectedStatus: number) {
  const text = await response.text();
  expect(response.status(), text).toBe(expectedStatus);
  expect(response.headers()["content-type"] ?? "", text).toContain("application/json");
  return JSON.parse(text);
}

function exactRule(): NeighbourhoodRule {
  return { kind: "exact", edgeKinds: [], maxHops: 0 };
}

function directNeighboursRule(): NeighbourhoodRule {
  return { kind: "direct-neighbours", edgeKinds: [], maxHops: 0 };
}

function sharedContainerRule(): NeighbourhoodRule {
  return { kind: "shared-container", edgeKinds: [], maxHops: 0 };
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
