import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { execSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";

import { PR_DELTA_ID_PATTERN, type DeltaKind, type EntityDelta } from "../app/lib/pr-delta";

const TEST_BRANCH = "e2e/pr-delta-test";
const TEST_DIR = resolve(".tmp/pr-delta-route");
const FIXTURE_RELATIVE_PATH = ".tmp/pr-delta-route/fixtures/behavior_delta_fixture.py";
const FIXTURE_PATH = resolve(FIXTURE_RELATIVE_PATH);
const LOG_PATH = join(TEST_DIR, "watcher.log");
const STASH_MESSAGE = `e2e-pr-delta-route-${Date.now()}-${process.pid}`;

const BASE_FIXTURE = [
  "def unchanged_behavior():",
  '    label = "stable"',
  "    return label",
  "",
  "def removed_behavior():",
  '    return "remove me"',
  "",
  "def reshaped_behavior(value: int) -> int:",
  "    total = value + 1",
  "    return total",
  "",
].join("\n");

const HEAD_FIXTURE = [
  "def unchanged_behavior():",
  '    label = "stable"',
  "    return label",
  "",
  "def reshaped_behavior(value: int) -> int:",
  "    total = value + 2",
  "    return total",
  "",
  "def added_behavior():",
  '    return "added"',
  "",
].join("\n");

let watcher: ChildProcessWithoutNullStreams | null = null;
let api: APIRequestContext;
let originalHead = "";
let originalBranch: string | null = null;
let stashCreated = false;
let baseRevision = "";
let headRevision = "";

test.describe.serial("/api/pr-deltas/compute", () => {
  test.beforeAll(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    originalHead = git(["rev-parse", "HEAD"]);
    originalBranch = currentBranch();
    stashCreated = stashWorkspace();

    deleteTestBranch();
    git(["checkout", "-B", TEST_BRANCH, originalHead]);
    writeFixture(BASE_FIXTURE);
    git(["add", "-f", FIXTURE_RELATIVE_PATH]);
    git(["commit", "-m", "e2e pr delta base fixture"]);
    baseRevision = git(["rev-parse", "HEAD"]);

    writeFixture(HEAD_FIXTURE);
    git(["add", "-f", FIXTURE_RELATIVE_PATH]);
    git(["commit", "-m", "e2e pr delta head fixture"]);
    headRevision = git(["rev-parse", "HEAD"]);

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

    cleanupGitState();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("rejects a payload that matches neither request variant", async () => {
    const response = await postCompute({});
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error: expect.any(String),
      error_kind: "validation",
      request_id: expect.any(String),
    });
  });

  test("rejects a payload that mixes task and explicit revision variants", async () => {
    const response = await postCompute({
      task_id: "task:ambiguous-pr-delta",
      base_revision: baseRevision,
      head_revision: headRevision,
    });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error: expect.any(String),
      error_kind: "validation",
      request_id: expect.any(String),
    });
  });

  test("rejects an unknown task id", async () => {
    const response = await postCompute({ task_id: "task:missing-pr-delta-e2e" });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error: expect.any(String),
      error_kind: "validation",
      request_id: expect.any(String),
    });
  });

  test("accepts a valid revision pair and returns an E.1-shaped delta set", async () => {
    const body = await computeDeltaSet();

    expect(body).toMatchObject({
      ok: true,
      request_id: expect.any(String),
      delta_set: {
        id: expect.stringMatching(PR_DELTA_ID_PATTERN),
        baseRevision,
        headRevision,
        baseBranch: "(base)",
        headBranch: TEST_BRANCH,
        prNumber: 902,
        taskId: null,
        computedAtMs: expect.any(Number),
        attributionActor: "generator",
        deltas: expect.any(Array),
      },
    });

    for (const delta of body.delta_set.deltas) {
      expect(delta).toMatchObject({
        entityKind: "behavior",
        relatedIds: [],
        trust: { state: "grounded", grounding: "lsp-type" },
        attributionActor: "generator",
      });
    }
  });

  test("detects an added behavior", async () => {
    const body = await computeDeltaSet();

    expect(findBehaviorDelta(body.delta_set.deltas, "added", "added_behavior")).toMatchObject({
      deltaKind: "added",
      entityKind: "behavior",
      baseId: null,
      headId: behaviorId("added_behavior"),
    });
  });

  test("detects a removed behavior", async () => {
    const body = await computeDeltaSet();

    expect(findBehaviorDelta(body.delta_set.deltas, "removed", "removed_behavior")).toMatchObject({
      deltaKind: "removed",
      entityKind: "behavior",
      baseId: behaviorId("removed_behavior"),
      headId: null,
    });
  });

  test("detects a reshaped behavior", async () => {
    const body = await computeDeltaSet();

    expect(
      findBehaviorDelta(body.delta_set.deltas, "reshaped", "reshaped_behavior"),
    ).toMatchObject({
      deltaKind: "reshaped",
      entityKind: "behavior",
      baseId: behaviorId("reshaped_behavior"),
      headId: behaviorId("reshaped_behavior"),
    });
  });

  test("includes unchanged behaviors", async () => {
    const body = await computeDeltaSet();

    expect(
      findBehaviorDelta(body.delta_set.deltas, "unchanged", "unchanged_behavior"),
    ).toMatchObject({
      deltaKind: "unchanged",
      entityKind: "behavior",
      baseId: behaviorId("unchanged_behavior"),
      headId: behaviorId("unchanged_behavior"),
    });
  });

  test("returns deterministic delta sets for repeated compute calls", async () => {
    const first = await computeDeltaSet();
    const second = await computeDeltaSet();

    expect(normalizeDeltaSet(second.delta_set)).toEqual(normalizeDeltaSet(first.delta_set));
  });
});

async function computeDeltaSet() {
  const response = await postCompute({
    base_revision: baseRevision,
    head_revision: headRevision,
    head_branch: TEST_BRANCH,
    pr_number: 902,
  });
  return expectJsonStatus(response, 200);
}

async function postCompute(payload: unknown) {
  return api.post("/api/pr-deltas/compute", { data: payload });
}

async function expectJsonStatus(response: APIResponse, expectedStatus: number) {
  const text = await response.text();
  expect(response.status(), text).toBe(expectedStatus);
  expect(response.headers()["content-type"] ?? "", text).toContain("application/json");
  return JSON.parse(text);
}

function findBehaviorDelta(
  deltas: readonly EntityDelta[],
  deltaKind: DeltaKind,
  behaviorName: string,
) {
  const expectedId = behaviorId(behaviorName);
  const delta = deltas.find((candidate) => {
    return (
      candidate.deltaKind === deltaKind &&
      candidate.entityKind === "behavior" &&
      (candidate.baseId === expectedId || candidate.headId === expectedId)
    );
  });

  expect(delta, `Expected ${deltaKind} delta for ${expectedId}`).toBeTruthy();
  return delta;
}

function behaviorId(name: string) {
  return `behavior:${FIXTURE_RELATIVE_PATH.replace(/\.py$/, "").split("/").join(".")}.${name}`;
}

function normalizeDeltaSet(deltaSet: Record<string, unknown>) {
  return {
    ...deltaSet,
    id: "<normalized>",
  };
}

function writeFixture(text: string) {
  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, text);
}

function stashWorkspace() {
  const output = git(["stash", "push", "--include-untracked", "-m", STASH_MESSAGE]);
  return !output.includes("No local changes to save");
}

function cleanupGitState() {
  tryGit(["reset", "--hard", "HEAD"]);

  if (originalBranch) {
    tryGit(["checkout", originalBranch]);
  } else if (originalHead) {
    tryGit(["checkout", "--detach", originalHead]);
  }

  deleteTestBranch();
  restoreStash();
}

function restoreStash() {
  if (!stashCreated) return;

  const stashRef = findStashRef();
  if (!stashRef) {
    throw new Error(`Could not find test stash ${STASH_MESSAGE}`);
  }
  git(["stash", "pop", stashRef]);
}

function findStashRef() {
  const stashes = git(["stash", "list", "--format=%gd%x09%s"], { allowFailure: true });
  for (const line of stashes.split(/\r?\n/)) {
    const [ref, subject] = line.split("\t");
    if (ref && subject?.includes(STASH_MESSAGE)) {
      return ref;
    }
  }
  return null;
}

function deleteTestBranch() {
  tryGit(["branch", "-D", TEST_BRANCH]);
}

function currentBranch() {
  const branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });
  return branch === "" ? null : branch;
}

function git(args: readonly string[], options: { allowFailure?: boolean } = {}) {
  try {
    return execSync(["git", ...args].map(shellQuote).join(" "), {
      cwd: resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "visual-code-editor e2e",
        GIT_AUTHOR_EMAIL: "visual-code-editor-e2e@example.invalid",
        GIT_COMMITTER_NAME: "visual-code-editor e2e",
        GIT_COMMITTER_EMAIL: "visual-code-editor-e2e@example.invalid",
      },
    }).trim();
  } catch (error) {
    if (options.allowFailure) return "";
    throw error;
  }
}

function tryGit(args: readonly string[]) {
  git(args, { allowFailure: true });
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
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
