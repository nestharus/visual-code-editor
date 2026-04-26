import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

const ASK_CAP_BYTES = 256 * 1024;
const TEST_DIR = resolve(".tmp/prompt-composer-route");
const BIN_DIR = join(TEST_DIR, "bin");
const LOG_PATH = join(TEST_DIR, "watcher.log");
const LONG_OUTPUT_MARKER = "__PROMPT_COMPOSER_LONG_OUTPUT__";

type ComposerPayload = {
  mode: "ask" | "edit" | "direct" | string;
  prompt: string;
  selection: {
    items: Array<{
      id: string;
      kind: string;
      mode: "entity" | "contents" | string;
    }>;
    primaryAnchor: string | null;
  };
  surfaceAnchor: string;
};

let watcher: ChildProcessWithoutNullStreams | null = null;
let api: APIRequestContext;

test.describe("/api/prompt-composer", () => {
  test.beforeAll(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(BIN_DIR, { recursive: true });
    writeAgentsStub();

    const port = await getFreePort();
    watcher = spawn("npx", ["tsx", "server/watcher.ts"], {
      cwd: resolve("."),
      detached: true,
      env: {
        ...process.env,
        PATH: `${BIN_DIR}:${process.env.PATH ?? ""}`,
        WATCHER_PORT: String(port),
        PROMPT_COMPOSER_ASK_TIMEOUT_MS: "5000",
        PROMPT_COMPOSER_EDIT_TIMEOUT_MS: "5000",
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
  });

  test("rejects an invalid mode with a validation error", async () => {
    const response = await postComposer({ ...validPayload(), mode: "inspect" });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({ ok: false, error_kind: "validation" });
    expect(body.error).toEqual(expect.any(String));
    expect(body.request_id).toEqual(expect.any(String));
  });

  test("rejects an empty prompt", async () => {
    const response = await postComposer({ ...validPayload(), prompt: "   \n\t  " });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({ ok: false, error_kind: "validation" });
  });

  test("rejects a primaryAnchor that does not match the last selected item", async () => {
    const response = await postComposer({
      ...validPayload(),
      selection: {
        items: [{ id: "cluster-alpha", kind: "node", mode: "entity" }],
        primaryAnchor: "edge",
      },
    });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({ ok: false, error_kind: "validation" });
  });

  test("rejects contents mode for non-container anchor kinds", async () => {
    const response = await postComposer({
      ...validPayload(),
      selection: {
        items: [{ id: "edge-alpha-beta", kind: "edge", mode: "contents" }],
        primaryAnchor: "edge",
      },
      surfaceAnchor: "edge",
    });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({ ok: false, error_kind: "validation" });
  });

  test("rejects unknown AnchorKind strings", async () => {
    const response = await postComposer({ ...validPayload(), surfaceAnchor: "button" });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({ ok: false, error_kind: "validation" });
  });

  test("accepts a valid ask payload and returns the composer response shape", async () => {
    const response = await postComposer(validPayload());
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: true,
      mode: "ask",
      output: expect.any(String),
      duration_ms: expect.any(Number),
      agent_pid: expect.any(Number),
      request_id: expect.any(String),
    });
    expect(body).toHaveProperty("parsed");
  });

  test("enforces the ask output cap without calling the real agents runtime", async () => {
    const response = await postComposer({
      ...validPayload(),
      prompt: `Return a long answer. ${LONG_OUTPUT_MARKER}`,
    });
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({ ok: true, mode: "ask" });
    expect(Buffer.byteLength(body.output, "utf8")).toBeLessThanOrEqual(ASK_CAP_BYTES);
  });

  test("logs prompt composer request fields", async () => {
    const response = await postComposer({
      ...validPayload(),
      prompt: "Log this short prompt",
    });
    const body = await expectJsonStatus(response, 200);

    const entry = await waitForLogEntry((candidate) => candidate.request_id === body.request_id);
    expect(entry).toMatchObject({
      request_id: body.request_id,
      route: "/api/prompt-composer",
      mode: "ask",
      selection_count: 1,
      surface_anchor: "node",
      status: "ok",
    });
    expect(entry.ts).toEqual(expect.any(String));
    expect(Date.parse(entry.ts)).not.toBeNaN();
    expect(entry.duration_ms).toEqual(expect.any(Number));
  });
});

function validPayload(): ComposerPayload {
  return {
    mode: "ask",
    prompt: "Summarize this node.",
    selection: {
      items: [{ id: "cluster-alpha", kind: "node", mode: "entity" }],
      primaryAnchor: "node",
    },
    surfaceAnchor: "node",
  };
}

async function postComposer(payload: ComposerPayload) {
  return api.post("/api/prompt-composer", { data: payload });
}

async function expectJsonStatus(
  response: Awaited<ReturnType<typeof postComposer>>,
  expectedStatus: number,
) {
  const text = await response.text();
  expect(response.status(), text).toBe(expectedStatus);
  expect(response.headers()["content-type"] ?? "", text).toContain("application/json");
  return JSON.parse(text);
}

function writeAgentsStub() {
  const stubPath = join(BIN_DIR, "agents");
  writeFileSync(
    stubPath,
    `#!/usr/bin/env node
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  if (input.includes(${JSON.stringify(LONG_OUTPUT_MARKER)})) {
    process.stdout.write("x".repeat(${ASK_CAP_BYTES + 64 * 1024}));
    return;
  }
  process.stdout.write(JSON.stringify({ message: "stubbed prompt composer response" }));
});
`,
  );
  chmodSync(stubPath, 0o755);
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

async function waitForLogEntry(predicate: (entry: Record<string, unknown>) => boolean) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const entries = readLogEntries();
    const entry = entries.find(predicate);
    if (entry) return entry;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }

  throw new Error(`No matching prompt-composer log entry found in ${LOG_PATH}`);
}

function readLogEntries() {
  const text = readFileSync(LOG_PATH, "utf8");
  return text
    .split(/\r?\n/)
    .flatMap((line) => parseLogLine(line));
}

function parseLogLine(line: string): Record<string, unknown>[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" ? [parsed] : [];
    } catch {
      return [];
    }
  }

  if (!trimmed.includes("prompt_composer") && !trimmed.includes("route=/api/prompt-composer")) {
    return [];
  }

  const entry: Record<string, unknown> = {};
  for (const token of trimmed.split(/\s+/)) {
    const separatorIndex = token.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = token.slice(0, separatorIndex);
    const rawValue = token.slice(separatorIndex + 1);
    const numericValue = Number(rawValue);
    entry[key] = Number.isFinite(numericValue) && rawValue !== "" ? numericValue : rawValue;
  }

  return [entry];
}
