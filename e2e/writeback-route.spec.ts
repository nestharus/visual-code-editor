import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  changeIntentFromString,
  conflictKindFromString,
  type BehaviorDraft,
  type ChangeIntent,
  type ConflictKind,
  type ProposedSlice,
} from "../app/lib/writeback";

const TEST_DIR = resolve(".tmp/writeback-route");
const FIXTURE_DIR = join(TEST_DIR, "fixtures");
const FIXTURE_PATH = join(FIXTURE_DIR, "behavior-test-fixture-d2.ts");
const FIXTURE_RELATIVE_PATH = ".tmp/writeback-route/fixtures/behavior-test-fixture-d2.ts";
const LOG_PATH = join(TEST_DIR, "watcher.log");
const SERVER_VALIDATE_PATH = resolve("server/writeback/validate.ts");

const ORIGINAL_FIXTURE = [
  "// behavior-test-fixture-d2",
  "export const untouched = true;",
  'export const marker = "original";',
  'export const spacing = "keep";',
  "",
].join("\n");

const APPLIED_FIXTURE = ORIGINAL_FIXTURE.replace(
  'export const marker = "original";',
  'export const marker = "applied";',
);

const CONTRACT_CHANGE_INTENT_VALUES = [
  "user-edit",
  "agent-edit",
  "promote-to-test",
  "reconcile",
  "revert",
] as const satisfies readonly ChangeIntent[];

const CONTRACT_CONFLICT_KIND_VALUES = [
  "file-deleted",
  "lines-changed",
  "file-moved",
  "whitespace-only",
] as const satisfies readonly ConflictKind[];

let watcher: ChildProcessWithoutNullStreams | null = null;
let api: APIRequestContext;
let currentRevision = "";

test.describe("/api/writeback", () => {
  test.beforeAll(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(FIXTURE_DIR, { recursive: true });
    writeFixture(ORIGINAL_FIXTURE);
    currentRevision = git(["rev-parse", "HEAD"]);

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

  test.afterEach(() => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    writeFixture(ORIGINAL_FIXTURE);
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

  test("rejects bad payloads with a validation error", async () => {
    const response = await postWriteback({ draft: {}, apply: false });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error: expect.any(String),
      error_kind: "validation",
      request_id: expect.any(String),
    });
  });

  test("returns a dry-run plan without writing files when apply=false", async () => {
    const response = await postWriteback({
      draft: routeDraft(validDraft({ newText: 'export const marker = "dry-run";\n' })),
      apply: false,
    });
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: true,
      applied: false,
      request_id: expect.any(String),
      plan: {
        draft: expect.objectContaining({ id: expect.any(String) }),
        effective_diff: expect.any(String),
        applies_against_revision: currentRevision,
        validated_at_ms: expect.any(Number),
      },
    });
    expect(readFixture()).toBe(ORIGINAL_FIXTURE);
  });

  test("writes files when apply=true and reports the applied revision", async () => {
    const response = await postWriteback({
      draft: routeDraft(validDraft({ newText: 'export const marker = "applied";\n' })),
      apply: true,
    });
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: true,
      applied_revision: expect.any(String),
      files_written: expect.arrayContaining([FIXTURE_RELATIVE_PATH]),
      request_id: expect.any(String),
      plan: {
        effective_diff: expect.any(String),
        applies_against_revision: currentRevision,
      },
    });
    expect(readFixture()).toBe(APPLIED_FIXTURE);
  });

  test("returns a stale-revision conflict without writing files", async () => {
    const response = await postWriteback({
      draft: routeDraft(validDraft({
        parentRevision: staleRevision(),
        newText: 'export const marker = "should-not-write";\n',
      })),
      apply: true,
    });
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: false,
      conflict: {
        draft_id: expect.any(String),
        expected_revision: staleRevision(),
        observed_revision: currentRevision,
        conflicting_files: expect.arrayContaining([
          expect.objectContaining({ file_path: FIXTURE_RELATIVE_PATH }),
        ]),
      },
      request_id: expect.any(String),
    });
    expect(readFixture()).toBe(ORIGINAL_FIXTURE);
  });

  test("classifies stale drafts against deleted files as FILE_DELETED", async () => {
    unlinkSync(FIXTURE_PATH);

    const response = await postWriteback({
      draft: routeDraft(validDraft({ parentRevision: staleRevision() })),
      apply: true,
    });
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: false,
      conflict: {
        conflicting_files: expect.arrayContaining([
          expect.objectContaining({
            file_path: FIXTURE_RELATIVE_PATH,
            conflict_kind: "file-deleted",
          }),
        ]),
      },
    });
    expect(existsSync(FIXTURE_PATH)).toBe(false);
  });

  test("classifies stale drafts with changed target lines as LINES_CHANGED", async () => {
    writeFixture(
      ORIGINAL_FIXTURE.replace(
        'export const marker = "original";',
        'export const marker = "changed elsewhere";',
      ),
    );

    const response = await postWriteback({
      draft: routeDraft(validDraft({ parentRevision: staleRevision() })),
      apply: true,
    });
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: false,
      conflict: {
        conflicting_files: expect.arrayContaining([
          expect.objectContaining({
            file_path: FIXTURE_RELATIVE_PATH,
            conflict_kind: "lines-changed",
          }),
        ]),
      },
    });
    expect(readFixture()).toContain('export const marker = "changed elsewhere";');
  });

  test("classifies stale drafts with whitespace-only target changes as WHITESPACE_ONLY", async () => {
    writeFixture(
      ORIGINAL_FIXTURE.replace(
        'export const marker = "original";',
        'export   const   marker   =   "original";',
      ),
    );

    const response = await postWriteback({
      draft: routeDraft(validDraft({ parentRevision: staleRevision() })),
      apply: true,
    });
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: false,
      conflict: {
        conflicting_files: expect.arrayContaining([
          expect.objectContaining({
            file_path: FIXTURE_RELATIVE_PATH,
            conflict_kind: "whitespace-only",
          }),
        ]),
      },
    });
    expect(readFixture()).toContain('export   const   marker   =   "original";');
  });

  test("logs expected writeback request fields", async () => {
    const draft = validDraft();
    const response = await postWriteback({ draft: routeDraft(draft), apply: false });
    const body = await expectJsonStatus(response, 200);

    const entry = await waitForLogEntry((candidate) => candidate.request_id === body.request_id);
    expect(entry).toMatchObject({
      request_id: body.request_id,
      route: "/api/writeback",
      apply: false,
      draft_id: draft.id,
      behavior_id: draft.behaviorId,
      parent_revision: currentRevision,
      file_count: 1,
      duration_ms: expect.any(Number),
      status: "ok",
    });
    expect(entry.ts).toEqual(expect.any(String));
    expect(Date.parse(String(entry.ts))).not.toBeNaN();
  });

  test("keeps server writeback validation vocabulary in sync with app writeback types", async () => {
    const routeProbe = await postWriteback({ draft: {}, apply: false });
    test.skip(
      routeProbe.status() === 404,
      "D.2 /api/writeback route is not registered yet",
    );

    expect(
      existsSync(SERVER_VALIDATE_PATH),
      "server/writeback/validate.ts should exist for /api/writeback validation",
    ).toBe(true);

    const serverValidate = await import(pathToFileURL(SERVER_VALIDATE_PATH).href);
    const serverChangeIntents = exportedStringList(
      serverValidate,
      "ChangeIntent",
      CONTRACT_CHANGE_INTENT_VALUES,
    );
    const serverConflictKinds = exportedStringList(
      serverValidate,
      "ConflictKind",
      CONTRACT_CONFLICT_KIND_VALUES,
    );

    expect(serverChangeIntents).toEqual(CONTRACT_CHANGE_INTENT_VALUES);
    expect(serverConflictKinds).toEqual(CONTRACT_CONFLICT_KIND_VALUES);

    for (const intent of serverChangeIntents) {
      expect(changeIntentFromString(intent)).toBe(intent);
    }
    for (const kind of serverConflictKinds) {
      expect(conflictKindFromString(kind)).toBe(kind);
    }
  });
});

function validDraft(overrides: {
  parentRevision?: string;
  newText?: string;
  startLine?: number;
  endLine?: number;
} = {}): BehaviorDraft {
  const createdAtMs = Date.now();
  return {
    id: `draft:writeback-d2-${createdAtMs}`,
    behaviorId: "behavior:writeback-d2-fixture",
    proposedSlices: [
      proposedSlice({
        startLine: overrides.startLine ?? 3,
        endLine: overrides.endLine ?? 3,
        newText: overrides.newText ?? 'export const marker = "applied";\n',
      }),
    ],
    origin: {
      actor: "you-this-session",
      intent: "user-edit",
      timestampMs: createdAtMs,
      requestId: null,
    },
    parentRevision: overrides.parentRevision ?? currentRevision,
    createdAtMs,
  };
}

function proposedSlice(overrides: Partial<ProposedSlice> = {}): ProposedSlice {
  return {
    filePath: FIXTURE_RELATIVE_PATH,
    startLine: 3,
    endLine: 3,
    newText: 'export const marker = "applied";\n',
    intentRole: "body",
    ...overrides,
  };
}

function routeDraft(draft: BehaviorDraft) {
  return {
    id: draft.id,
    behavior_id: draft.behaviorId,
    proposed_slices: draft.proposedSlices.map((slice) => ({
      file_path: slice.filePath,
      start_line: slice.startLine,
      end_line: slice.endLine,
      new_text: slice.newText,
      intent_role: slice.intentRole,
    })),
    origin: {
      actor: draft.origin.actor,
      intent: draft.origin.intent,
      timestamp_ms: draft.origin.timestampMs,
      request_id: draft.origin.requestId,
    },
    parent_revision: draft.parentRevision,
    created_at_ms: draft.createdAtMs,
  };
}

async function postWriteback(payload: unknown) {
  return api.post("/api/writeback", { data: payload });
}

async function expectJsonStatus(response: APIResponse, expectedStatus: number) {
  const text = await response.text();
  expect(response.status(), text).toBe(expectedStatus);
  expect(response.headers()["content-type"] ?? "", text).toContain("application/json");
  return JSON.parse(text);
}

function writeFixture(text: string) {
  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, text);
}

function readFixture() {
  return readFileSync(FIXTURE_PATH, "utf8");
}

function git(args: readonly string[]) {
  return execFileSync("git", args, {
    cwd: resolve("."),
    encoding: "utf8",
  }).trim();
}

function staleRevision() {
  const previousRevisions = git(["rev-list", "--max-count=2", "HEAD"]).split(/\r?\n/);
  return previousRevisions[1] ?? "0000000000000000000000000000000000000000";
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

  throw new Error(`No matching writeback log entry found in ${LOG_PATH}`);
}

function readLogEntries() {
  if (!existsSync(LOG_PATH)) return [];
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

  if (!trimmed.includes("writeback") && !trimmed.includes("route=/api/writeback")) {
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

function exportedStringList(
  moduleExports: Record<string, unknown>,
  label: string,
  expectedValues: readonly string[],
) {
  const matchingExport = Object.entries(moduleExports).find(([, value]) => {
    return (
      Array.isArray(value) &&
      value.length === expectedValues.length &&
      value.every((item) => typeof item === "string") &&
      expectedValues.every((expectedValue) => value.includes(expectedValue))
    );
  });

  expect(
    matchingExport,
    `server/writeback/validate.ts should export the ${label} string list`,
  ).toBeDefined();

  return matchingExport?.[1] as string[];
}
