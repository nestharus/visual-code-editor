import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

import { TASK_ID_PATTERN, type Task, type TaskState } from "../app/lib/task";

const TEST_DIR = resolve(".tmp/tasks-route");
const BIN_DIR = join(TEST_DIR, "bin");
const LOG_PATH = join(TEST_DIR, "watcher.log");
const COLLISION_BRANCH_LOG = join(TEST_DIR, "collision-branches.log");
const COLLISION_SLUG = "k2-worktree-collision";

type DispatchPayload = {
  label: string;
  prompt: string;
  base_branch?: string;
  related_behavior_ids?: readonly string[];
  request_id: string;
};

let watcher: ChildProcessWithoutNullStreams | null = null;
let api: APIRequestContext;
let sequence = 0;
const runId = `${Date.now()}-${process.pid}`;
const createdTasks: Task[] = [];

test.describe.serial("/api/tasks", () => {
  test.beforeAll(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(BIN_DIR, { recursive: true });
    writeGitWrapper(realGitPath());

    const port = await getFreePort();
    watcher = spawn("npx", ["tsx", "server/watcher.ts"], {
      cwd: resolve("."),
      detached: true,
      env: {
        ...process.env,
        PATH: `${BIN_DIR}:${process.env.PATH ?? ""}`,
        WATCHER_PORT: String(port),
        K2_GIT_COLLISION_BRANCH_LOG: COLLISION_BRANCH_LOG,
        K2_GIT_COLLISION_SLUG: COLLISION_SLUG,
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

    await cleanupCreatedTasks();
    await cleanupCollisionBranches();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test("dispatch creates a pending Task and worktree on disk", async () => {
    const task = await dispatchTask("k2 creates pending task");

    expect(task.id).toMatch(TASK_ID_PATTERN);
    expect(task.state).toBe("pending");
    expect(task.label).toContain("k2 creates pending task");
    expect(task.prompt).toContain("Prompt for");
    expect(task.requestId).toEqual(expect.any(String));
    expect(task.worktree).toMatchObject({
      path: expect.any(String),
      branch: expect.stringMatching(/^task\//),
      baseBranch: expect.any(String),
      baseRevision: expect.any(String),
      headRevision: null,
      createdAtMs: expect.any(Number),
    });
    expect(task.stateHistory).toEqual([
      expect.objectContaining({
        fromState: null,
        toState: "pending",
        actor: "you-this-session",
        reason: expect.any(String),
        timestampMs: expect.any(Number),
      }),
    ]);
    expect(await pathExists(task.worktree.path)).toBe(true);
  });

  test("dispatch validates empty label, prompt, and request_id", async () => {
    for (const payload of [
      dispatchPayload({ label: "   " }),
      dispatchPayload({ prompt: "\n\t " }),
      dispatchPayload({ request_id: "" }),
    ]) {
      const response = await api.post("/api/tasks/dispatch", { data: payload });
      const body = await expectJsonStatus(response, 400);

      expect(body).toMatchObject({
        ok: false,
        error: expect.any(String),
        error_kind: "validation",
        request_id: payload.request_id,
      });
    }
  });

  test("GET /api/tasks returns all dispatched tasks", async () => {
    const first = await dispatchTask("k2 list task one");
    const second = await dispatchTask("k2 list task two");

    const response = await api.get("/api/tasks");
    const body = await expectJsonStatus(response, 200);

    expect(body.tasks).toEqual(expect.any(Array));
    expect(body.tasks.map((task: Task) => task.id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
  });

  test("GET /api/tasks/:id returns the matching task and 404s unknown ids", async () => {
    const task = await dispatchTask("k2 read task");

    const foundResponse = await api.get(`/api/tasks/${encodeURIComponent(task.id)}`);
    const foundBody = await expectJsonStatus(foundResponse, 200);
    expect(foundBody.task).toMatchObject({ id: task.id, label: task.label });

    const missingResponse = await api.get("/api/tasks/task:missing-k2-route");
    const missingBody = await expectJsonStatus(missingResponse, 404);
    expect(missingBody).toEqual({ error: "not found" });
  });

  test("valid transitions update state and append history", async () => {
    const task = await dispatchTask("k2 transition valid");
    const response = await transitionTask(task.id, {
      to_state: "running",
      reason: "start work",
    });
    const body = await expectJsonStatus(response, 200);
    const updated = rememberTask(body.task);

    expect(updated.state).toBe("running");
    expect(updated.stateHistory).toHaveLength(task.stateHistory.length + 1);
    expect(updated.stateHistory.at(-1)).toMatchObject({
      fromState: "pending",
      toState: "running",
      actor: "you-this-session",
      reason: "start work",
      timestampMs: expect.any(Number),
    });
  });

  test("invalid transitions return 400", async () => {
    const task = await dispatchTask("k2 invalid transition");
    const response = await transitionTask(task.id, {
      to_state: "merged",
      reason: "skip to terminal",
    });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      error: expect.any(String),
      error_kind: "invalid-transition",
    });
  });

  test("ABANDONED transition removes the worktree", async () => {
    const task = await dispatchTask("k2 abandon removes worktree");
    expect(await pathExists(task.worktree.path)).toBe(true);

    const response = await transitionTask(task.id, {
      to_state: "abandoned",
      reason: "test cleanup path",
    });
    const body = await expectJsonStatus(response, 200);
    const updated = rememberTask(body.task);

    expect(updated.state).toBe("abandoned");
    expect(await pathExists(updated.worktree.path)).toBe(false);
  });

  test("MERGED is terminal", async () => {
    const task = await dispatchTask("k2 merged terminal");
    await expectTransition(task.id, "running");
    await expectTransition(task.id, "ready-for-pr");
    await expectTransition(task.id, "in-pr");
    await expectTransition(task.id, "merged");

    const response = await transitionTask(task.id, {
      to_state: "abandoned",
      reason: "should be rejected after merge",
    });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      error: expect.any(String),
      error_kind: "invalid-transition",
    });
  });

  test("worktree add failures return a worktree error", async () => {
    const response = await api.post("/api/tasks/dispatch", {
      data: dispatchPayload({
        label: `${COLLISION_SLUG} ${uniqueSuffix()}`,
      }),
    });
    const body = await expectJsonStatus(response, 500);

    expect(body).toMatchObject({
      ok: false,
      error: expect.any(String),
      error_kind: "worktree",
    });
  });
});

function dispatchPayload(overrides: Partial<DispatchPayload> = {}): DispatchPayload {
  const suffix = uniqueSuffix();
  const label = overrides.label ?? `k2 task ${suffix}`;
  return {
    label,
    prompt: overrides.prompt ?? `Prompt for ${label}`,
    request_id: overrides.request_id ?? `request:k2-${suffix}`,
    related_behavior_ids: overrides.related_behavior_ids ?? ["behavior:k2-route-fixture"],
    ...(overrides.base_branch !== undefined ? { base_branch: overrides.base_branch } : {}),
  };
}

async function dispatchTask(label: string) {
  const response = await api.post("/api/tasks/dispatch", {
    data: dispatchPayload({ label: `${label} ${uniqueSuffix()}` }),
  });
  const body = await expectJsonStatusOneOf(response, [200, 201]);

  expect(body).toMatchObject({
    ok: true,
    task: expect.any(Object),
    request_id: expect.any(String),
  });
  return rememberTask(body.task);
}

async function transitionTask(
  taskId: string,
  body: { to_state: TaskState | string; reason: string; actor?: string },
) {
  return api.post(`/api/tasks/${encodeURIComponent(taskId)}/transition`, { data: body });
}

async function expectTransition(taskId: string, toState: TaskState) {
  const response = await transitionTask(taskId, {
    to_state: toState,
    reason: `advance to ${toState}`,
  });
  const body = await expectJsonStatus(response, 200);
  expect(body.task.state).toBe(toState);
  rememberTask(body.task);
}

function rememberTask(task: Task) {
  const index = createdTasks.findIndex((candidate) => candidate.id === task.id);
  if (index === -1) {
    createdTasks.push(task);
  } else {
    createdTasks[index] = task;
  }
  return task;
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

async function pathExists(path: string) {
  try {
    await access(resolve(path));
    return true;
  } catch {
    return false;
  }
}

function uniqueSuffix() {
  sequence += 1;
  return `${runId}-${sequence}`;
}

function realGitPath() {
  return execFileSync("which", ["git"], {
    cwd: resolve("."),
    encoding: "utf8",
  }).trim();
}

function writeGitWrapper(realGit: string) {
  const wrapperPath = join(BIN_DIR, "git");
  writeFileSync(
    wrapperPath,
    `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const realGit = ${JSON.stringify(realGit)};
const args = process.argv.slice(2);
const collisionSlug = process.env.K2_GIT_COLLISION_SLUG || "";
const branchIndex = args.indexOf("-b");
const branch = branchIndex >= 0 ? args[branchIndex + 1] : "";
if (
  args[0] === "worktree" &&
  args[1] === "add" &&
  branch &&
  collisionSlug &&
  branch.includes(collisionSlug)
) {
  const create = spawnSync(realGit, ["branch", branch, "HEAD"], { stdio: "inherit" });
  if (create.status === 0 && process.env.K2_GIT_COLLISION_BRANCH_LOG) {
    fs.appendFileSync(process.env.K2_GIT_COLLISION_BRANCH_LOG, branch + "\\n");
  }
}
const result = spawnSync(realGit, args, { stdio: "inherit" });
process.exit(result.status === null ? 1 : result.status);
`,
  );
  chmodSync(wrapperPath, 0o755);
}

async function cleanupCreatedTasks() {
  const tasks = [...createdTasks].reverse();
  for (const task of tasks) {
    if (await pathExists(task.worktree.path)) {
      tryGit(["worktree", "remove", "--force", resolve(task.worktree.path)]);
    }
    if (task.worktree.branch.startsWith("task/")) {
      tryGit(["branch", "-D", task.worktree.branch]);
    }
  }
  tryGit(["worktree", "prune"]);
}

async function cleanupCollisionBranches() {
  let text = "";
  try {
    text = await readFile(COLLISION_BRANCH_LOG, "utf8");
  } catch {
    return;
  }
  for (const branch of new Set(text.split(/\r?\n/).filter(Boolean))) {
    if (branch.startsWith("task/")) {
      tryGit(["branch", "-D", branch]);
    }
  }
}

function tryGit(args: readonly string[]) {
  try {
    execFileSync("git", args, {
      cwd: resolve("."),
      encoding: "utf8",
      stdio: "ignore",
    });
  } catch {
    // Cleanup is best effort; individual test assertions catch route failures.
  }
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
