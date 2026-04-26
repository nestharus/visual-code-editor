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

const TEST_DIR = resolve(".tmp/review-threads-route");
const LOG_PATH = join(TEST_DIR, "watcher.log");

type ThreadStatus = "open" | "resolved" | "dismissed" | "frozen";
type VerdictDecision = "approved" | "changes-requested" | "rejected";

let watcher: ChildProcessWithoutNullStreams | null = null;
let api: APIRequestContext;
let sequence = 0;
const runId = `${Date.now()}-${process.pid}`;

test.describe.serial("/api/review-threads", () => {
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

  test("create thread succeeds and rejects empty initial_comment", async () => {
    const thread = await createThread("route create succeeds");

    expect(thread).toMatchObject({
      id: expect.stringMatching(/^review:[a-zA-Z0-9._-]+$/),
      deltaSetId: expect.any(String),
      anchorKind: "behavior",
      anchorId: expect.any(String),
      anchorSide: "head",
      status: "open",
      comments: [
        expect.objectContaining({
          id: expect.stringMatching(/^comment:[a-zA-Z0-9._-]+$/),
          text: "route create succeeds",
          actor: "you-this-session",
        }),
      ],
      createdAtMs: expect.any(Number),
      resolvedAtMs: null,
      resolvedBy: null,
    });

    const response = await api.post("/api/review-threads", {
      data: createThreadPayload({ initial_comment: "   " }),
    });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error_kind: "validation",
      request_id: expect.any(String),
    });
  });

  test("add comment succeeds and appends to the thread", async () => {
    const thread = await createThread("route add comment base");

    const response = await api.post(
      `/api/review-threads/${encodeURIComponent(thread.id)}/comments`,
      {
        data: {
          text: "Follow-up review comment",
          actor: "another-user",
        },
      },
    );
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: true,
      thread: {
        id: thread.id,
        comments: [
          expect.objectContaining({ text: "route add comment base" }),
          expect.objectContaining({
            text: "Follow-up review comment",
            actor: "another-user",
          }),
        ],
      },
      request_id: expect.any(String),
    });
  });

  test("transition OPEN to RESOLVED succeeds and sets resolution metadata", async () => {
    const thread = await createThread("route transition base");
    const response = await transitionThread(thread.id, "resolved");
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: true,
      thread: {
        id: thread.id,
        status: "resolved",
        resolvedAtMs: expect.any(Number),
        resolvedBy: "you-this-session",
      },
      request_id: expect.any(String),
    });
  });

  test("invalid transition from RESOLVED to OPEN returns 400", async () => {
    const thread = await createThread("route invalid transition base");
    await transitionThread(thread.id, "resolved");

    const response = await transitionThread(thread.id, "open");
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error_kind: "invalid-transition",
      request_id: expect.any(String),
    });
  });

  test("list by delta_set_id returns matching threads only", async () => {
    const deltaSetId = uniqueDeltaSetId();
    const first = await createThread("route list first", { delta_set_id: deltaSetId });
    const second = await createThread("route list second", { delta_set_id: deltaSetId });
    await createThread("route list other set");

    const response = await api.get(
      `/api/review-threads?delta_set_id=${encodeURIComponent(deltaSetId)}`,
    );
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: true,
      threads: expect.any(Array),
      request_id: expect.any(String),
    });
    expect(body.threads.map((thread: { id: string }) => thread.id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
    expect(
      body.threads.every((thread: { deltaSetId: string }) => thread.deltaSetId === deltaSetId),
    ).toBe(true);
  });

  test("submit verdict succeeds and allows multiple verdicts over time", async () => {
    const deltaSetId = uniqueDeltaSetId();
    const first = await submitVerdict(deltaSetId, "changes-requested", "Needs follow-up.");
    const second = await submitVerdict(deltaSetId, "approved", "Follow-up is complete.");

    expect(first).toMatchObject({
      deltaSetId,
      decision: "changes-requested",
      decidedBy: "you-this-session",
      decidedAtMs: expect.any(Number),
      rationale: "Needs follow-up.",
    });
    expect(second).toMatchObject({
      deltaSetId,
      decision: "approved",
      rationale: "Follow-up is complete.",
    });

    expect(first.decidedAtMs).toBeLessThanOrEqual(second.decidedAtMs);
  });
});

function createThreadPayload(overrides: Record<string, unknown> = {}) {
  return {
    delta_set_id: uniqueDeltaSetId(),
    anchor_kind: "behavior",
    anchor_id: `behavior:review-route.${uniqueSuffix()}`,
    anchor_side: "head",
    initial_comment: "Route review comment",
    actor: "you-this-session",
    ...overrides,
  };
}

async function createThread(initialComment: string, overrides: Record<string, unknown> = {}) {
  const response = await api.post("/api/review-threads", {
    data: createThreadPayload({
      initial_comment: initialComment,
      ...overrides,
    }),
  });
  const body = await expectJsonStatusOneOf(response, [200, 201]);

  expect(body).toMatchObject({
    ok: true,
    thread: expect.any(Object),
    request_id: expect.any(String),
  });
  return body.thread;
}

async function transitionThread(threadId: string, toStatus: ThreadStatus) {
  return api.post(`/api/review-threads/${encodeURIComponent(threadId)}/transition`, {
    data: {
      to_status: toStatus,
      actor: "you-this-session",
    },
  });
}

async function submitVerdict(
  deltaSetId: string,
  decision: VerdictDecision,
  rationale: string,
) {
  const response = await api.post("/api/review-verdicts", {
    data: {
      delta_set_id: deltaSetId,
      decision,
      rationale,
      actor: "you-this-session",
    },
  });
  const body = await expectJsonStatus(response, 200);

  expect(body).toMatchObject({
    ok: true,
    verdict: expect.any(Object),
    request_id: expect.any(String),
  });
  return body.verdict;
}

async function expectJsonStatus(response: APIResponse, expectedStatus: number) {
  const text = await response.text();
  expect(response.status(), text).toBe(expectedStatus);
  expect(response.headers()["content-type"] ?? "", text).toContain("application/json");
  return JSON.parse(text);
}

async function expectJsonStatusOneOf(response: APIResponse, expectedStatuses: readonly number[]) {
  const text = await response.text();
  expect(expectedStatuses, text).toContain(response.status());
  expect(response.headers()["content-type"] ?? "", text).toContain("application/json");
  return JSON.parse(text);
}

function uniqueDeltaSetId() {
  return `prdelta:review-route.${uniqueSuffix()}`;
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
