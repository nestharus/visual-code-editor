/**
 * File watcher server — watches diagram source folders and pushes
 * change events via SSE. Configurable via REST API.
 */

import express from "express";
import cors from "cors";
import chokidar from "chokidar";
import { execSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isAnchorKind,
  isContainerAnchorKind,
  isSelectionMode,
  type AnchorKind,
} from "./anchor-vocab";
import {
  composePrompt as composeComposerPrompt,
  type ComposerMode,
  type ComposerSelection,
  type ComposerSelectionItem,
} from "./prompts/compose";
import { applyWritebackDraft, assertSlicesFitCurrentFiles, buildWritebackPlan } from "./writeback/apply";
import { detectWritebackConflict } from "./writeback/conflict";
import {
  validateWritebackRequest,
  type BehaviorDraft,
  type ConflictState,
  type WritebackPlan,
  type WritebackRequest,
} from "./writeback/validate";
import { getCachedPullRequests } from "./providers/github_adapter";
import {
  createTaskManager,
  TaskManagerError,
  type TaskErrorKind,
} from "./tasks/manager";
import {
  validateDispatchTaskRequest,
  validateTransitionTaskRequest,
  type DispatchTaskRequest,
  type TransitionTaskRequest,
} from "./tasks/types";
import {
  computePRDeltaSet,
  PRDeltaComputeError,
  type PRDeltaErrorKind,
} from "./pr_delta/compute";
import { extractWidgets } from "./widgets/extract";
import { WidgetExtractionError } from "./widgets/types";
import {
  validateComputePRDeltaRequest,
  type ComputePRDeltaRequest,
} from "./pr_delta/types";
import {
  createReviewThreadManager,
  ReviewThreadManagerError,
  type ReviewThreadErrorKind,
} from "./review_threads/manager";
import {
  validateAddReviewCommentRequest,
  validateCreateReviewThreadRequest,
  validateSubmitReviewVerdictRequest,
  validateTransitionReviewThreadRequest,
} from "./review_threads/types";
import { constructSliceFromDiagramPath } from "./slices/construct";
import {
  createSliceManager,
  SliceManagerError,
  type SliceErrorKind,
} from "./slices/manager";
import {
  validateConstructSliceRequest,
  validateTransitionSliceRequest,
  makeSlice,
  type ConstructSliceRequest,
  type Slice,
} from "./slices/types";
import {
  createOverlayManager,
  OverlayManagerError,
  type OverlayErrorKind,
} from "./overlays/manager";
import {
  overlayProviderIdFromString,
  validateSetOverlayLayerRequest,
  type OverlayProviderId,
  type SetOverlayLayerRequest,
} from "./overlays/types";
import {
  createProviderRegistry,
  ProviderRegistryError,
  type ProviderErrorKind,
} from "./providers/registry";
import { validateCreateProviderRequest } from "./providers/types";
import { startLifecycleTicker } from "./change_events/lifecycle_ticker";
import { createChangeEventStore } from "./change_events/store";
import {
  validateChangeEventInput,
  validateDisposeRequest,
  validateUserContextId,
  validateUserContextPatch,
} from "./change_events/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, ".watch-config.json");

type WatchConfig = {
  id: string;
  path: string;
  debounceMs: number;
  createdAt: string;
};

type WatchEntry = WatchConfig & {
  watcher: chokidar.FSWatcher;
  lastEvent?: string;
};

type PromptComposerRequest = {
  mode: ComposerMode;
  prompt: string;
  selection: ComposerSelection;
  surfaceAnchor: AnchorKind;
};

type PromptComposerErrorKind =
  | "validation"
  | "spawn"
  | "timeout"
  | "cap"
  | "agents_unreachable"
  | "disabled"
  | "internal";

type ValidateAnchorContextResult =
  | { ok: true; value: PromptComposerRequest }
  | { ok: false; error: string; error_kind: "validation" };

type SpawnAgentsOutcome = "ok" | "timeout" | "exit" | "oversize" | "spawn_error";

type SpawnAgentsResult = {
  outcome: SpawnAgentsOutcome;
  stdout: string;
  stderr: string;
  stdoutBytes: number;
  stderrBytes: number;
  exitCode: number | null;
  agentPid: number | null;
  elapsedMs: number;
};

type ExtractJsonResult =
  | { parsed: unknown; parsePath: "raw" | "brace" | "fenced" | "lenient" }
  | { parsed: null; parsePath: "degraded" };

type WritebackErrorKind = "validation" | "internal" | "io";
type TaskRouteStatus = "ok" | "error";
type OverlayRouteStatus = "ok" | "error";
type ProviderRouteStatus = "ok" | "error";

const app = express();
app.use(cors());
app.use(express.json());

const watches = new Map<string, WatchEntry>();
const sseClients = new Set<express.Response>();
let buildCounter = 0;
let writebackInProgress: Promise<void> | null = null;

// --- SSE ---

function broadcast(event: string, data: Record<string, unknown>) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

app.get("/api/events", (_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("event: connected\ndata: {}\n\n");
  sseClients.add(res);
  _req.on("close", () => sseClients.delete(res));
});

// --- Watch CRUD ---

app.get("/api/watch", (_req, res) => {
  const configs = Array.from(watches.values()).map(
    ({ id, path, debounceMs, createdAt, lastEvent }) => ({
      id,
      path,
      debounceMs,
      createdAt,
      lastEvent,
    }),
  );
  res.json(configs);
});

app.post("/api/watch", async (req, res) => {
  const { path: watchPath, debounceMs = 500 } = req.body;

  if (!watchPath || typeof watchPath !== "string") {
    return res.status(400).json({ error: "path is required" });
  }

  if (!existsSync(watchPath)) {
    return res.status(400).json({ error: `Path does not exist: ${watchPath}` });
  }

  // Check for duplicate
  for (const entry of watches.values()) {
    if (entry.path === watchPath) {
      return res.status(409).json({ error: "Already watching this path", id: entry.id });
    }
  }

  const id = randomUUID();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const watcher = chokidar.watch(watchPath, {
    ignoreInitial: true,
    ignored: /(^|[\/\\])\../,
  });

  const entry: WatchEntry = {
    id,
    path: watchPath,
    debounceMs,
    createdAt: new Date().toISOString(),
    watcher,
  };

  watcher.on("all", (eventType, filePath) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const buildId = `build-${++buildCounter}`;
      entry.lastEvent = new Date().toISOString();

      broadcast("workspace-invalidated", {
        watchId: id,
        buildId,
        changedPath: filePath,
        eventType,
        timestamp: entry.lastEvent,
      });
    }, debounceMs);
  });

  watches.set(id, entry);
  await persistConfig();

  res.status(201).json({ id, path: watchPath, debounceMs });
});

app.delete("/api/watch/:id", async (req, res) => {
  const entry = watches.get(req.params.id);
  if (!entry) {
    return res.status(404).json({ error: "Watch not found" });
  }

  await entry.watcher.close();
  watches.delete(req.params.id);
  await persistConfig();

  res.json({ deleted: true });
});

// --- Config persistence ---

async function persistConfig() {
  const configs: WatchConfig[] = Array.from(watches.values()).map(
    ({ id, path, debounceMs, createdAt }) => ({ id, path, debounceMs, createdAt }),
  );
  await writeFile(CONFIG_PATH, JSON.stringify(configs, null, 2));
}

async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const configs: WatchConfig[] = JSON.parse(raw);
    for (const config of configs) {
      if (!existsSync(config.path)) continue;

      let debounceTimer: ReturnType<typeof setTimeout> | undefined;
      const watcher = chokidar.watch(config.path, {
        ignoreInitial: true,
        ignored: /(^|[\/\\])\../,
      });

      const entry: WatchEntry = { ...config, watcher };

      watcher.on("all", (eventType, filePath) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const buildId = `build-${++buildCounter}`;
          entry.lastEvent = new Date().toISOString();
          broadcast("workspace-invalidated", {
            watchId: config.id,
            buildId,
            changedPath: filePath,
            eventType,
            timestamp: entry.lastEvent,
          });
        }, config.debounceMs);
      });

      watches.set(config.id, entry);
    }
  } catch {
    // No config file yet — that's fine
  }
}

function validateAnchorContext(payload: unknown): ValidateAnchorContextResult {
  if (!payload || typeof payload !== "object") {
    return validationError("body must be an object");
  }

  const candidate = payload as Record<string, unknown>;
  const { mode, prompt, selection, surfaceAnchor } = candidate;

  if (mode !== "ask" && mode !== "edit" && mode !== "direct") {
    return validationError("mode must be ask, edit, or direct");
  }

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return validationError("prompt must be a non-empty string");
  }

  if (!isAnchorKind(surfaceAnchor)) {
    return validationError("surfaceAnchor must be a known AnchorKind");
  }

  if (!selection || typeof selection !== "object") {
    return validationError("selection must be an object");
  }

  const selectionRecord = selection as Record<string, unknown>;
  if (!Array.isArray(selectionRecord.items)) {
    return validationError("selection.items must be an array");
  }

  const items: ComposerSelectionItem[] = [];
  for (const [index, item] of selectionRecord.items.entries()) {
    if (!item || typeof item !== "object") {
      return validationError(`selection.items[${index}] must be an object`);
    }

    const itemRecord = item as Record<string, unknown>;
    if (typeof itemRecord.id !== "string" || itemRecord.id.trim().length === 0) {
      return validationError(`selection.items[${index}].id must be a non-empty string`);
    }

    if (!isAnchorKind(itemRecord.kind)) {
      return validationError(`selection.items[${index}].kind must be a known AnchorKind`);
    }

    if (!isSelectionMode(itemRecord.mode)) {
      return validationError(`selection.items[${index}].mode must be entity or contents`);
    }

    if (itemRecord.mode === "contents" && !isContainerAnchorKind(itemRecord.kind)) {
      return validationError("SelectionMode.CONTENTS is only valid for container anchor kinds");
    }

    items.push({
      id: itemRecord.id,
      kind: itemRecord.kind,
      mode: itemRecord.mode,
    });
  }

  const primaryAnchor = selectionRecord.primaryAnchor;
  if (items.length === 0) {
    if (primaryAnchor !== null) {
      return validationError("selection.primaryAnchor must be null when selection.items is empty");
    }
  } else if (primaryAnchor !== items[items.length - 1].kind) {
    return validationError("selection.primaryAnchor must match the last selected item kind");
  }

  return {
    ok: true,
    value: {
      mode,
      prompt,
      selection: {
        items,
        primaryAnchor: primaryAnchor as AnchorKind | null,
      },
      surfaceAnchor,
    },
  };
}

function validationError(error: string): ValidateAnchorContextResult {
  return { ok: false, error, error_kind: "validation" };
}

function normalizeForLenientJson(candidate: string): string {
  return candidate
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

function extractJson(stdout: string): ExtractJsonResult {
  const trimmed = stdout.trim();

  try {
    return { parsed: JSON.parse(trimmed), parsePath: "raw" };
  } catch {
    // Fall through.
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const braceCandidate =
    firstBrace >= 0 && lastBrace > firstBrace
      ? trimmed.slice(firstBrace, lastBrace + 1)
      : null;
  if (braceCandidate) {
    try {
      return { parsed: JSON.parse(braceCandidate), parsePath: "brace" };
    } catch {
      // Fall through.
    }
  }

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  const fencedCandidate = fencedMatch?.[1] ?? null;
  if (fencedCandidate) {
    try {
      return { parsed: JSON.parse(fencedCandidate), parsePath: "fenced" };
    } catch {
      // Fall through.
    }
  }

  const lenientCandidate = fencedCandidate || braceCandidate || trimmed;
  try {
    return {
      parsed: JSON.parse(normalizeForLenientJson(lenientCandidate)),
      parsePath: "lenient",
    };
  } catch {
    return { parsed: null, parsePath: "degraded" };
  }
}

function trimExcerpt(text: string, maxChars = 240): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxChars) return trimmed || "-";
  return `${trimmed.slice(0, maxChars - 3)}...`;
}

function logFailureExcerpt(requestId: string, stderr: string) {
  console.log(`prompt_composer_detail request_id=${requestId} stderr=${JSON.stringify(trimExcerpt(stderr))}`);
}

function logPromptComposerOutcome(fields: {
  request_id: string;
  mode: ComposerMode | "-";
  selection_count: number;
  surface_anchor: AnchorKind | "-";
  duration_ms: number;
  status: "ok" | "error";
  error_kind?: PromptComposerErrorKind;
}) {
  console.log(JSON.stringify({
    request_id: fields.request_id,
    ts: new Date().toISOString(),
    route: "/api/prompt-composer",
    mode: fields.mode,
    selection_count: fields.selection_count,
    surface_anchor: fields.surface_anchor,
    duration_ms: fields.duration_ms,
    status: fields.status,
    ...(fields.error_kind ? { error_kind: fields.error_kind } : {}),
  }));
}

function logWritebackOutcome(fields: {
  request_id: string;
  apply: boolean;
  draft_id: string;
  behavior_id: string;
  parent_revision: string;
  file_count: number;
  duration_ms: number;
  status: "ok" | "conflict" | "error";
  error_kind?: WritebackErrorKind;
  files_written?: number;
}) {
  console.log(JSON.stringify({
    request_id: fields.request_id,
    ts: new Date().toISOString(),
    route: "/api/writeback",
    apply: fields.apply,
    draft_id: fields.draft_id,
    behavior_id: fields.behavior_id,
    parent_revision: fields.parent_revision,
    file_count: fields.file_count,
    duration_ms: fields.duration_ms,
    status: fields.status,
    ...(fields.error_kind ? { error_kind: fields.error_kind } : {}),
    ...(fields.files_written !== undefined ? { files_written: fields.files_written } : {}),
  }));
}

function logTaskOutcome(fields: {
  request_id: string;
  route: string;
  task_id: string;
  duration_ms: number;
  status: TaskRouteStatus;
  error_kind?: TaskErrorKind;
}) {
  console.log(JSON.stringify({
    request_id: fields.request_id,
    ts: new Date().toISOString(),
    route: fields.route,
    task_id: fields.task_id,
    duration_ms: fields.duration_ms,
    status: fields.status,
    ...(fields.error_kind ? { error_kind: fields.error_kind } : {}),
  }));
}

function logPRDeltaOutcome(fields: {
  request_id: string;
  variant: "revisions" | "task" | "-";
  base_revision: string;
  head_revision: string;
  task_id?: string;
  pr_number?: number | null;
  changed_file_count: number;
  delta_count_total: number;
  duration_ms: number;
  status: "ok" | "error";
  error_kind?: PRDeltaErrorKind;
}) {
  console.log(JSON.stringify({
    request_id: fields.request_id,
    ts: new Date().toISOString(),
    route: "/api/pr-deltas/compute",
    variant: fields.variant,
    base_revision: fields.base_revision,
    head_revision: fields.head_revision,
    ...(fields.task_id ? { task_id: fields.task_id } : {}),
    ...(fields.pr_number !== undefined ? { pr_number: fields.pr_number } : {}),
    changed_file_count: fields.changed_file_count,
    delta_count_total: fields.delta_count_total,
    duration_ms: fields.duration_ms,
    status: fields.status,
    ...(fields.error_kind ? { error_kind: fields.error_kind } : {}),
  }));
}

function logOverlayOutcome(fields: {
  request_id: string;
  route: string;
  provider_id: string;
  signal_count: number;
  duration_ms: number;
  status: OverlayRouteStatus;
  error_kind?: OverlayErrorKind;
}) {
  console.log(JSON.stringify({
    request_id: fields.request_id,
    ts: new Date().toISOString(),
    route: fields.route,
    provider_id: fields.provider_id,
    signal_count: fields.signal_count,
    duration_ms: fields.duration_ms,
    status: fields.status,
    ...(fields.error_kind ? { error_kind: fields.error_kind } : {}),
  }));
}

function logProviderOutcome(fields: {
  request_id: string;
  route: string;
  provider_id: string;
  kind: string;
  duration_ms: number;
  status: ProviderRouteStatus;
  error_kind?: ProviderErrorKind;
}) {
  console.log(JSON.stringify({
    request_id: fields.request_id,
    ts: new Date().toISOString(),
    route: fields.route,
    provider_id: fields.provider_id,
    kind: fields.kind,
    duration_ms: fields.duration_ms,
    status: fields.status,
    ...(fields.error_kind ? { error_kind: fields.error_kind } : {}),
  }));
}

function providerKindFromBody(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "kind" in payload &&
    typeof (payload as { kind?: unknown }).kind === "string"
  ) {
    return (payload as { kind: string }).kind;
  }

  return "-";
}

async function withWritebackLock<T>(task: () => Promise<T>): Promise<T> {
  while (writebackInProgress) {
    await writebackInProgress;
  }

  let releaseLock = () => {};
  const lock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  writebackInProgress = lock;

  try {
    return await task();
  } finally {
    if (writebackInProgress === lock) {
      writebackInProgress = null;
    }
    releaseLock();
  }
}

async function waitForWritebackLock(): Promise<void> {
  while (writebackInProgress) {
    await writebackInProgress;
  }
}

function gitHead(): string {
  return execSync("git rev-parse HEAD", {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitPorcelainV2(): string {
  return execSync("git status --porcelain=v2", {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function buildConflictState(
  draft: BehaviorDraft,
  observedRevision: string,
): Promise<ConflictState> {
  return detectWritebackConflict({
    draft,
    workspaceRoot: PROJECT_ROOT,
    observedRevision,
  });
}

function routePlan(plan: WritebackPlan) {
  return {
    draft: routeDraft(plan.draft),
    effective_diff: plan.effectiveDiff,
    applies_against_revision: plan.appliesAgainstRevision,
    validated_at_ms: plan.validatedAtMs,
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

function routeConflict(conflict: ConflictState) {
  return {
    draft_id: conflict.draftId,
    conflicting_files: conflict.conflictingFiles.map((file) => ({
      file_path: file.filePath,
      conflict_kind: file.conflictKind,
      source_unchanged: file.sourceUnchanged,
    })),
    observed_revision: conflict.observedRevision,
    expected_revision: conflict.expectedRevision,
  };
}

function isIoError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as NodeJS.ErrnoException).code === "string"
  );
}

function promptComposerCapBytes(mode: ComposerMode): number {
  switch (mode) {
    case "ask":
      return 256 * 1024;
    case "edit":
      return 512 * 1024;
    case "direct":
      return 1024 * 1024;
  }
}

function promptComposerTimeoutMs(mode: ComposerMode): number {
  if (mode === "ask") {
    return parseInt(process.env.PROMPT_COMPOSER_ASK_TIMEOUT_MS || "", 10) || 20000;
  }

  if (mode === "edit") {
    return parseInt(process.env.PROMPT_COMPOSER_EDIT_TIMEOUT_MS || "", 10) || 45000;
  }

  return parseInt(process.env.PROMPT_COMPOSER_DIRECT_TIMEOUT_MS || "", 10) || 45000;
}

function promptComposerModel(mode: ComposerMode): string {
  if (mode === "ask") {
    return process.env.PROMPT_COMPOSER_ASK_MODEL || "claude-haiku";
  }

  if (mode === "edit") {
    return process.env.PROMPT_COMPOSER_EDIT_MODEL || "gpt-high";
  }

  return process.env.PROMPT_COMPOSER_DIRECT_MODEL || "gpt-high";
}

async function readWorkspaceSnapshot(): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(DIAGRAM_JSON_PATH, "utf-8"));
  } catch {
    return undefined;
  }
}

function spawnAgents(
  model: string,
  prompt: string,
  timeoutMs: number,
  stdoutCapBytes: number,
): Promise<SpawnAgentsResult> {
  const stderrCapBytes = 32 * 1024;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let exitCode: number | null = null;
    let agentPid: number | null = null;
    let settled = false;
    let outcome: SpawnAgentsOutcome | null = null;
    let forceResolveTimer: ReturnType<typeof setTimeout> | undefined;
    let sigkillTimer: ReturnType<typeof setTimeout> | undefined;

    const child = spawn("agents", ["-m", model, "-p", PROJECT_ROOT], {
      detached: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    agentPid = child.pid ?? null;

    const finish = () => {
      if (settled || !outcome) return;
      settled = true;
      if (forceResolveTimer) clearTimeout(forceResolveTimer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      resolve({
        outcome,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        stdoutBytes,
        stderrBytes,
        exitCode,
        agentPid,
        elapsedMs: Date.now() - startedAt,
      });
    };

    const appendChunk = (
      chunk: Buffer | string,
      capBytes: number,
      chunks: Buffer[],
      totalBytes: number,
    ) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (totalBytes >= capBytes) {
        return { totalBytes, exceeded: false };
      }

      const nextTotal = totalBytes + buffer.length;
      if (nextTotal <= capBytes) {
        chunks.push(buffer);
      } else {
        chunks.push(buffer.subarray(0, capBytes - totalBytes));
      }

      return {
        totalBytes: nextTotal,
        exceeded: nextTotal > capBytes,
      };
    };

    const killProcessGroup = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        try {
          process.kill(child.pid, signal);
        } catch {
          // Child already exited.
        }
      }
    };

    const terminate = (nextOutcome: SpawnAgentsOutcome) => {
      if (outcome) return;
      outcome = nextOutcome;
      killProcessGroup("SIGTERM");
      sigkillTimer = setTimeout(() => {
        killProcessGroup("SIGKILL");
      }, 2000);
      forceResolveTimer = setTimeout(() => {
        finish();
      }, 2500);
    };

    const timeoutTimer = setTimeout(() => {
      terminate("timeout");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const appended = appendChunk(chunk, stdoutCapBytes, stdoutChunks, stdoutBytes);
      stdoutBytes = appended.totalBytes;
      if (appended.exceeded) {
        clearTimeout(timeoutTimer);
        terminate("oversize");
      }
    });

    child.stderr.on("data", (chunk) => {
      const appended = appendChunk(chunk, stderrCapBytes, stderrChunks, stderrBytes);
      stderrBytes = appended.totalBytes;
    });

    child.on("error", (error) => {
      clearTimeout(timeoutTimer);
      if (!outcome) {
        outcome = "spawn_error";
      }
      const appended = appendChunk(Buffer.from(error.message, "utf8"), stderrCapBytes, stderrChunks, stderrBytes);
      stderrBytes = appended.totalBytes;
      finish();
    });

    child.on("exit", (code) => {
      exitCode = code;
      clearTimeout(timeoutTimer);
      if (!outcome) {
        outcome = code === 0 ? "ok" : "exit";
      }
      finish();
    });

    child.stdin.on("error", () => {
      // Ignore broken pipe errors after timeout / forced termination.
    });
    child.stdin.end(prompt);
  });
}

// --- Diagram data ---

const PROJECT_ROOT = join(__dirname, "..");
const taskManager = createTaskManager(PROJECT_ROOT);
const reviewThreadManager = createReviewThreadManager();
const sliceManager = createSliceManager();
const overlayManager = createOverlayManager();
const providerRegistry = createProviderRegistry();
const changeEventStore = createChangeEventStore();

const DIAGRAM_JSON_PATH = process.env.DIAGRAM_JSON
  || join(PROJECT_ROOT, "public", "data", "diagram.json");

app.get("/api/diagram", async (_req, res) => {
  try {
    const data = await readFile(DIAGRAM_JSON_PATH, "utf-8");
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch {
    res.status(404).json({ error: "Run: python3 src/visual_code_editor/export_json_cli.py <workspace.json> > dist/data/diagram.json" });
  }
});

app.get("/api/widgets", async (req, res) => {
  try {
    const result = await extractWidgets({
      workspaceRoot: PROJECT_ROOT,
      refresh: req.query.refresh === "true",
    });
    return res.json(result);
  } catch (error) {
    const widgetError = normalizeWidgetExtractionError(error);
    return res.status(500).json({
      ok: false,
      error: widgetError.message,
      error_kind: widgetError.errorKind,
    });
  }
});

app.get("/api/widgets/:id", async (req, res) => {
  try {
    const result = await extractWidgets({
      workspaceRoot: PROJECT_ROOT,
      refresh: req.query.refresh === "true",
    });
    const widget = result.widgets.find((candidate) => candidate.id === req.params.id);
    if (!widget) {
      return res.status(404).json({ error: "not found" });
    }

    return res.json({ widget, computed_at_ms: result.computed_at_ms });
  } catch (error) {
    const widgetError = normalizeWidgetExtractionError(error);
    return res.status(500).json({
      ok: false,
      error: widgetError.message,
      error_kind: widgetError.errorKind,
    });
  }
});

app.post("/api/change-events", (req, res) => {
  const requestId =
    typeof req.body?.request_id === "string" && req.body.request_id.length > 0
      ? req.body.request_id
      : randomUUID();
  const contextValidation = validateUserContextId(req.body?.user_context_id);
  if (!contextValidation.ok) {
    return res.status(400).json({
      ok: false,
      error: contextValidation.error,
      error_kind: contextValidation.error_kind,
      request_id: requestId,
    });
  }

  if (!changeEventStore.getUserContext(contextValidation.value)) {
    return res.status(400).json({
      ok: false,
      error: "user_context_id does not reference a stored UserContext",
      error_kind: "validation",
      request_id: requestId,
    });
  }

  const eventValidation = validateChangeEventInput(req.body?.event);
  if (!eventValidation.ok) {
    return res.status(400).json({
      ok: false,
      error: eventValidation.error,
      error_kind: eventValidation.error_kind,
      request_id: requestId,
    });
  }

  try {
    const classifiedEvent = changeEventStore.classifyAndStore(
      contextValidation.value,
      eventValidation.value,
    );
    return res.json({
      ok: true,
      classified_event: classifiedEvent,
      request_id: requestId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "change event classification failed";
    return res.status(500).json({
      ok: false,
      error: message,
      error_kind: "internal",
      request_id: requestId,
    });
  }
});

app.get("/api/change-events", (req, res) => {
  const contextValidation = validateUserContextId(req.query.user_context_id);
  if (!contextValidation.ok) {
    return res.status(400).json({
      ok: false,
      error: contextValidation.error,
      error_kind: contextValidation.error_kind,
    });
  }

  return res.json({
    events: changeEventStore.list(contextValidation.value, {
      includeSuppressed: req.query.include_suppressed === "true",
    }),
  });
});

app.post("/api/change-events/:id/dispose", (req, res) => {
  const validation = validateDisposeRequest(req.body);
  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      error: validation.error,
      error_kind: validation.error_kind,
      request_id: requestIdFromBody(req.body),
    });
  }

  const event = changeEventStore.dispose(
    validation.value.userContextId,
    req.params.id,
    validation.value.disposition,
  );
  if (!event) {
    return res.status(404).json({
      ok: false,
      error: "not found",
      error_kind: "not-found",
      request_id: validation.value.requestId,
    });
  }

  return res.json({
    ok: true,
    event,
    request_id: validation.value.requestId,
  });
});

app.get("/api/user-context/:id", (req, res) => {
  const contextValidation = validateUserContextId(req.params.id);
  if (!contextValidation.ok) {
    return res.status(400).json({
      ok: false,
      error: contextValidation.error,
      error_kind: contextValidation.error_kind,
    });
  }

  const context = changeEventStore.getUserContext(contextValidation.value);
  if (!context) {
    return res.status(404).json({ ok: false, error: "not found" });
  }

  return res.json({ ok: true, user_context: context });
});

app.post("/api/user-context/:id", (req, res) => {
  const contextValidation = validateUserContextId(req.params.id);
  if (!contextValidation.ok) {
    return res.status(400).json({
      ok: false,
      error: contextValidation.error,
      error_kind: contextValidation.error_kind,
    });
  }

  const validation = validateUserContextPatch(
    contextValidation.value,
    req.body,
    changeEventStore.getUserContext(contextValidation.value) ?? undefined,
  );
  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      error: validation.error,
      error_kind: validation.error_kind,
    });
  }

  const context = changeEventStore.putUserContext(validation.value);
  return res.json({ ok: true, user_context: context });
});

app.post("/api/providers", async (req, res) => {
  const startedAt = Date.now();
  const requestId = randomUUID();

  const fail = (
    statusCode: number,
    errorKind: ProviderErrorKind,
    error: string,
    fields?: { providerId?: string; kind?: string },
  ) => {
    logProviderOutcome({
      request_id: requestId,
      route: "/api/providers",
      provider_id: fields?.providerId ?? "-",
      kind: fields?.kind ?? providerKindFromBody(req.body),
      duration_ms: Date.now() - startedAt,
      status: "error",
      error_kind: errorKind,
    });
    return res.status(statusCode).json({
      ok: false,
      error,
      error_kind: errorKind,
      request_id: requestId,
    });
  };

  const validation = validateCreateProviderRequest(req.body);
  if (!validation.ok) {
    return fail(400, validation.error_kind, validation.error);
  }

  try {
    const created = await providerRegistry.create(validation.value);
    logProviderOutcome({
      request_id: requestId,
      route: "/api/providers",
      provider_id: created.provider.id,
      kind: created.provider.kind,
      duration_ms: Date.now() - startedAt,
      status: "ok",
    });
    return res.json({
      ok: true,
      provider: created.provider,
      connection: created.connection,
      request_id: requestId,
    });
  } catch (error) {
    const providerError = normalizeProviderError(error);
    return fail(
      statusForProviderError(providerError.errorKind),
      providerError.errorKind,
      providerError.message,
      { kind: validation.value.kind },
    );
  }
});

app.get("/api/providers", (_req, res) => {
  return res.json({ providers: providerRegistry.list() });
});

app.get("/api/providers/:id", (req, res) => {
  const provider = providerRegistry.get(req.params.id);
  if (!provider) {
    return res.status(404).json({ error: "not found" });
  }

  return res.json({ provider });
});

app.post("/api/providers/:id/sync", async (req, res) => {
  const startedAt = Date.now();
  const requestId = randomUUID();

  const fail = (statusCode: number, errorKind: ProviderErrorKind, error: string) => {
    logProviderOutcome({
      request_id: requestId,
      route: "/api/providers/:id/sync",
      provider_id: req.params.id,
      kind: providerRegistry.get(req.params.id)?.kind ?? "-",
      duration_ms: Date.now() - startedAt,
      status: "error",
      error_kind: errorKind,
    });
    return res.status(statusCode).json({
      ok: false,
      error,
      error_kind: errorKind,
      request_id: requestId,
    });
  };

  try {
    const connection = await providerRegistry.sync(req.params.id);
    logProviderOutcome({
      request_id: requestId,
      route: "/api/providers/:id/sync",
      provider_id: connection.providerId,
      kind: providerRegistry.get(connection.providerId)?.kind ?? "-",
      duration_ms: Date.now() - startedAt,
      status: "ok",
    });
    return res.json({ ok: true, connection, request_id: requestId });
  } catch (error) {
    const providerError = normalizeProviderError(error);
    return fail(
      statusForProviderError(providerError.errorKind),
      providerError.errorKind,
      providerError.message,
    );
  }
});

app.delete("/api/providers/:id", async (req, res) => {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const provider = providerRegistry.get(req.params.id);

  const fail = (statusCode: number, errorKind: ProviderErrorKind, error: string) => {
    logProviderOutcome({
      request_id: requestId,
      route: "/api/providers/:id",
      provider_id: req.params.id,
      kind: provider?.kind ?? "-",
      duration_ms: Date.now() - startedAt,
      status: "error",
      error_kind: errorKind,
    });
    return res.status(statusCode).json({
      ok: false,
      error,
      error_kind: errorKind,
      request_id: requestId,
    });
  };

  try {
    const deleted = await providerRegistry.delete(req.params.id);
    logProviderOutcome({
      request_id: requestId,
      route: "/api/providers/:id",
      provider_id: req.params.id,
      kind: provider?.kind ?? "-",
      duration_ms: Date.now() - startedAt,
      status: deleted ? "ok" : "error",
      ...(deleted ? {} : { error_kind: "not-found" as const }),
    });

    if (!deleted) {
      return res.status(404).json({ error: "not found" });
    }

    return res.json({ ok: true, request_id: requestId });
  } catch (error) {
    const providerError = normalizeProviderError(error);
    return fail(
      statusForProviderError(providerError.errorKind),
      providerError.errorKind,
      providerError.message,
    );
  }
});

app.get("/api/providers/:id/connection", (req, res) => {
  const connection = providerRegistry.connection(req.params.id);
  if (!connection) {
    return res.status(404).json({ error: "not found" });
  }

  return res.json({ connection });
});

app.get("/api/providers/:id/pull-requests", (req, res) => {
  const provider = providerRegistry.get(req.params.id);
  if (!provider || provider.kind !== "github") {
    return res.status(404).json({ error: "not found" });
  }

  return res.json({
    provider_id: provider.id,
    pull_requests: getCachedPullRequests(provider.id) ?? [],
  });
});

app.post("/api/overlays/layers", (req, res) => {
  const startedAt = Date.now();
  let request: SetOverlayLayerRequest | undefined;
  const requestId = requestIdFromBody(req.body);

  const fail = (statusCode: number, errorKind: OverlayErrorKind, error: string) => {
    logOverlayOutcome({
      request_id: request?.requestId ?? requestId,
      route: "/api/overlays/layers",
      provider_id: request?.providerId ?? providerIdFromBody(req.body),
      signal_count: request?.signals.length ?? signalCountFromBody(req.body),
      duration_ms: Date.now() - startedAt,
      status: "error",
      error_kind: errorKind,
    });
    return res.status(statusCode).json({
      ok: false,
      error,
      error_kind: errorKind,
      request_id: request?.requestId ?? requestId,
    });
  };

  const validation = validateSetOverlayLayerRequest(req.body);
  if (!validation.ok) {
    return fail(400, validation.error_kind, validation.error);
  }
  request = validation.value;

  try {
    const layer = overlayManager.setLayer({
      providerId: request.providerId,
      signals: request.signals,
      computedAtMs: request.computedAtMs,
      attributionActor: request.attributionActor,
    });
    logOverlayOutcome({
      request_id: request.requestId,
      route: "/api/overlays/layers",
      provider_id: layer.providerId,
      signal_count: layer.signals.length,
      duration_ms: Date.now() - startedAt,
      status: "ok",
    });
    return res.json({ ok: true, layer, request_id: request.requestId });
  } catch (error) {
    const overlayError = normalizeOverlayError(error);
    return fail(
      statusForOverlayError(overlayError.errorKind),
      overlayError.errorKind,
      overlayError.message,
    );
  }
});

app.get("/api/overlays", (_req, res) => {
  const startedAt = Date.now();
  const overlay = overlayManager.getOverlay();
  logOverlayOutcome({
    request_id: "-",
    route: "/api/overlays",
    provider_id: "-",
    signal_count: overlay.layers.reduce((count, layer) => count + layer.signals.length, 0),
    duration_ms: Date.now() - startedAt,
    status: "ok",
  });
  return res.json({ overlay });
});

app.delete("/api/overlays/layers/:provider_id", (req, res) => {
  const startedAt = Date.now();
  const providerId = req.params.provider_id;

  let normalizedProviderId: OverlayProviderId;
  try {
    normalizedProviderId = overlayProviderIdFromString(providerId);
  } catch (error) {
    logOverlayOutcome({
      request_id: "-",
      route: "/api/overlays/layers/:provider_id",
      provider_id: providerId,
      signal_count: 0,
      duration_ms: Date.now() - startedAt,
      status: "error",
      error_kind: "validation",
    });
    const message = error instanceof Error ? error.message : "invalid provider_id";
    return res.status(400).json({ ok: false, error: message, error_kind: "validation" });
  }

  const deleted = overlayManager.removeLayer(normalizedProviderId);
  logOverlayOutcome({
    request_id: "-",
    route: "/api/overlays/layers/:provider_id",
    provider_id: normalizedProviderId,
    signal_count: 0,
    duration_ms: Date.now() - startedAt,
    status: deleted ? "ok" : "error",
    ...(deleted ? {} : { error_kind: "not-found" as const }),
  });

  if (!deleted) {
    return res.status(404).json({ ok: false, error: "not-found" });
  }

  return res.json({ ok: true });
});

app.post("/api/slices/construct", (req, res) => {
  const requestId = randomUUID();
  const validation = validateConstructSliceRequest(req.body);
  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      error: validation.error,
      error_kind: validation.error_kind,
      request_id: requestId,
    });
  }

  try {
    const outcome = constructSliceFromDiagramPath(validation.value, DIAGRAM_JSON_PATH);
    if (!outcome.ok) {
      const fallbackSlice = constructTickerFallbackSlice(validation.value);
      if (fallbackSlice) {
        const slice = sliceManager.add(fallbackSlice, validation.value);
        return res.json({ ok: true, slice, request_id: requestId });
      }

      return res.json({
        ok: false,
        error: outcome.error,
        error_kind: outcome.error_kind,
        request_id: requestId,
      });
    }

    const slice = sliceManager.add(outcome.slice, validation.value);
    return res.json({ ok: true, slice, request_id: requestId });
  } catch (error) {
    const sliceError = normalizeSliceError(error);
    return res.status(statusForSliceError(sliceError.errorKind)).json({
      ok: false,
      error: sliceError.message,
      error_kind: sliceError.errorKind,
      request_id: requestId,
    });
  }
});

app.get("/api/slices", (req, res) => {
  const includeDismissed = req.query.include_dismissed === "true";
  return res.json({ slices: sliceManager.list({ includeDismissed }) });
});

app.get("/api/slices/:id", (req, res) => {
  const slice = sliceManager.get(req.params.id);
  if (!slice) {
    return res.status(404).json({ error: "not found" });
  }

  return res.json({ slice });
});

app.post("/api/slices/:id/transition", (req, res) => {
  const requestId = randomUUID();
  const validation = validateTransitionSliceRequest(req.body);
  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      error: validation.error,
      error_kind: validation.error_kind,
      request_id: requestId,
    });
  }

  try {
    const slice = sliceManager.transition(req.params.id, validation.value);
    return res.json({ ok: true, slice, request_id: requestId });
  } catch (error) {
    const sliceError = normalizeSliceError(error);
    return res.status(statusForSliceError(sliceError.errorKind)).json({
      ok: false,
      error: sliceError.message,
      error_kind: sliceError.errorKind,
      request_id: requestId,
    });
  }
});

app.post("/api/prompt-composer", async (req, res) => {
  const requestId = randomUUID();
  const startedAt = Date.now();

  const fail = (
    statusCode: number,
    errorKind: PromptComposerErrorKind,
    error: string,
    request?: PromptComposerRequest,
  ) => {
    const durationMs = Date.now() - startedAt;
    logPromptComposerOutcome({
      request_id: requestId,
      mode: request?.mode ?? "-",
      selection_count: request?.selection.items.length ?? 0,
      surface_anchor: request?.surfaceAnchor ?? "-",
      duration_ms: durationMs,
      status: "error",
      error_kind: errorKind,
    });
    return res.status(statusCode).json({
      ok: false,
      error,
      error_kind: errorKind,
      request_id: requestId,
      duration_ms: durationMs,
    });
  };

  const validation = validateAnchorContext(req.body);
  if (!validation.ok) {
    return fail(400, validation.error_kind, validation.error);
  }

  const composerRequest = validation.value;
  if (process.env.PROMPT_COMPOSER_ENABLED === "0") {
    return fail(503, "disabled", "prompt composer is disabled", composerRequest);
  }

  try {
    const workspace = await readWorkspaceSnapshot();
    const agentInput = composeComposerPrompt({
      ...composerRequest,
      workspace,
    });
    const spawnResult = await spawnAgents(
      promptComposerModel(composerRequest.mode),
      agentInput,
      promptComposerTimeoutMs(composerRequest.mode),
      promptComposerCapBytes(composerRequest.mode),
    );

    if (spawnResult.outcome === "timeout") {
      return fail(504, "timeout", "prompt composer timed out before agents returned a result", composerRequest);
    }

    if (spawnResult.outcome === "spawn_error") {
      return fail(503, "agents_unreachable", "agents runtime is unavailable", composerRequest);
    }

    if (spawnResult.outcome === "exit") {
      logFailureExcerpt(requestId, spawnResult.stderr);
      return fail(500, "spawn", "agents runtime exited before producing a successful result", composerRequest);
    }

    const extracted = extractJson(spawnResult.stdout);
    const durationMs = Date.now() - startedAt;
    logPromptComposerOutcome({
      request_id: requestId,
      mode: composerRequest.mode,
      selection_count: composerRequest.selection.items.length,
      surface_anchor: composerRequest.surfaceAnchor,
      duration_ms: durationMs,
      status: "ok",
    });

    return res.json({
      ok: true,
      mode: composerRequest.mode,
      output: spawnResult.stdout,
      parsed: extracted.parsed,
      duration_ms: durationMs,
      agent_pid: spawnResult.agentPid ?? 0,
      request_id: requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal prompt composer error";
    return fail(500, "internal", message, composerRequest);
  }
});

app.post("/api/writeback", async (req, res) => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let request: WritebackRequest | undefined;

  const log = (
    status: "ok" | "conflict" | "error",
    errorKind?: WritebackErrorKind,
    filesWritten?: number,
  ) => {
    const draft = request?.draft;
    logWritebackOutcome({
      request_id: requestId,
      apply: request?.apply ?? false,
      draft_id: draft?.id ?? "-",
      behavior_id: draft?.behaviorId ?? "-",
      parent_revision: draft?.parentRevision ?? "-",
      file_count: draft ? new Set(draft.proposedSlices.map((slice) => slice.filePath)).size : 0,
      duration_ms: Date.now() - startedAt,
      status,
      ...(errorKind ? { error_kind: errorKind } : {}),
      ...(filesWritten !== undefined ? { files_written: filesWritten } : {}),
    });
  };

  const fail = (statusCode: number, errorKind: WritebackErrorKind, error: string) => {
    log("error", errorKind);
    return res.status(statusCode).json({
      ok: false,
      error,
      error_kind: errorKind,
      request_id: requestId,
    });
  };

  const validation = validateWritebackRequest(req.body);
  if (!validation.ok) {
    return fail(400, validation.error_kind, validation.error);
  }
  request = validation.value;

  const execute = async () => {
    const observedRevision = gitHead();
    gitPorcelainV2();

    if (request!.draft.parentRevision !== observedRevision) {
      const conflict = await buildConflictState(request!.draft, observedRevision);
      log("conflict");
      return res.json({
        ok: false,
        conflict: routeConflict(conflict),
        request_id: requestId,
      });
    }

    try {
      await assertSlicesFitCurrentFiles(request!.draft, PROJECT_ROOT);
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid writeback file range";
      return fail(400, "validation", message);
    }

    if (!request!.apply) {
      const plan = await buildWritebackPlan(request!.draft, PROJECT_ROOT);
      log("ok");
      return res.json({
        ok: true,
        plan: routePlan(plan),
        applied: false,
        request_id: requestId,
      });
    }

    const beforeApplyRevision = gitHead();
    if (beforeApplyRevision !== observedRevision) {
      const conflict = await buildConflictState(request!.draft, beforeApplyRevision);
      log("conflict");
      return res.json({
        ok: false,
        conflict: routeConflict(conflict),
        request_id: requestId,
      });
    }

    const result = await applyWritebackDraft(request!.draft, PROJECT_ROOT);
    const afterApplyRevision = gitHead();
    if (afterApplyRevision !== beforeApplyRevision) {
      throw new Error("git HEAD changed during writeback apply");
    }
    gitPorcelainV2();

    log("ok", undefined, result.filesWritten.length);
    return res.json({
      ok: true,
      plan: routePlan(result.plan),
      applied_revision: afterApplyRevision,
      files_written: result.filesWritten,
      request_id: requestId,
    });
  };

  try {
    if (request.apply) {
      return await withWritebackLock(execute);
    }

    await waitForWritebackLock();
    return await execute();
  } catch (error) {
    const errorKind: WritebackErrorKind = isIoError(error) ? "io" : "internal";
    const message = error instanceof Error ? error.message : "writeback failed";
    return fail(500, errorKind, message);
  }
});

app.post("/api/pr-deltas/compute", async (req, res) => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let request: ComputePRDeltaRequest | undefined;

  const fail = (
    statusCode: number,
    errorKind: PRDeltaErrorKind,
    error: string,
    fields?: {
      baseRevision?: string;
      headRevision?: string;
      taskId?: string;
      prNumber?: number | null;
      changedFileCount?: number;
      deltaCountTotal?: number;
    },
  ) => {
    logPRDeltaOutcome({
      request_id: requestId,
      variant: request?.variant ?? "-",
      base_revision:
        fields?.baseRevision ??
        (request?.variant === "revisions" ? request.baseRevision : "-"),
      head_revision:
        fields?.headRevision ??
        (request?.variant === "revisions" ? request.headRevision : "-"),
      ...(fields?.taskId ?? (request?.variant === "task" ? request.taskId : undefined)
        ? { task_id: fields?.taskId ?? (request?.variant === "task" ? request.taskId : undefined) }
        : {}),
      ...(fields?.prNumber !== undefined ||
      (request?.variant === "revisions" && request.prNumber !== undefined)
        ? { pr_number: fields?.prNumber ?? (request?.variant === "revisions" ? request.prNumber : undefined) }
        : {}),
      changed_file_count: fields?.changedFileCount ?? 0,
      delta_count_total: fields?.deltaCountTotal ?? 0,
      duration_ms: Date.now() - startedAt,
      status: "error",
      error_kind: errorKind,
    });
    return res.status(statusCode).json({
      ok: false,
      error,
      error_kind: errorKind,
      request_id: requestId,
    });
  };

  const validation = validateComputePRDeltaRequest(req.body);
  if (!validation.ok) {
    return fail(400, validation.error_kind, validation.error);
  }
  request = validation.value;

  try {
    const result = await computePRDeltaSet({
      request,
      workspaceRoot: PROJECT_ROOT,
      taskLookup: taskManager,
    });

    logPRDeltaOutcome({
      request_id: requestId,
      variant: result.variant,
      base_revision: result.baseRevision,
      head_revision: result.headRevision,
      ...(result.taskId ? { task_id: result.taskId } : {}),
      ...(result.prNumber !== undefined ? { pr_number: result.prNumber } : {}),
      changed_file_count: result.changedFileCount,
      delta_count_total: result.deltaCountTotal,
      duration_ms: Date.now() - startedAt,
      status: "ok",
    });

    return res.json({
      ok: true,
      delta_set: result.deltaSet,
      request_id: requestId,
    });
  } catch (error) {
    const deltaError = normalizePRDeltaError(error);
    return fail(
      statusForPRDeltaError(deltaError.errorKind),
      deltaError.errorKind,
      deltaError.message,
    );
  }
});

app.post("/api/review-threads", (req, res) => {
  const requestId = randomUUID();
  const validation = validateCreateReviewThreadRequest(req.body);
  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      error: validation.error,
      error_kind: validation.error_kind,
      request_id: requestId,
    });
  }

  try {
    const thread = reviewThreadManager.createThread(validation.value);
    return res.status(201).json({ ok: true, thread, request_id: requestId });
  } catch (error) {
    const reviewError = normalizeReviewThreadError(error);
    return res.status(statusForReviewThreadError(reviewError.errorKind)).json({
      ok: false,
      error: reviewError.message,
      error_kind: reviewError.errorKind,
      request_id: requestId,
    });
  }
});

app.post("/api/review-threads/:id/comments", (req, res) => {
  const requestId = randomUUID();
  const validation = validateAddReviewCommentRequest(req.body);
  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      error: validation.error,
      error_kind: validation.error_kind,
      request_id: requestId,
    });
  }

  try {
    const thread = reviewThreadManager.addComment(req.params.id, validation.value);
    return res.json({ ok: true, thread, request_id: requestId });
  } catch (error) {
    const reviewError = normalizeReviewThreadError(error);
    return res.status(statusForReviewThreadError(reviewError.errorKind)).json({
      ok: false,
      error: reviewError.message,
      error_kind: reviewError.errorKind,
      request_id: requestId,
    });
  }
});

app.post("/api/review-threads/:id/transition", (req, res) => {
  const requestId = randomUUID();
  const validation = validateTransitionReviewThreadRequest(req.body);
  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      error: validation.error,
      error_kind: validation.error_kind,
      request_id: requestId,
    });
  }

  try {
    const thread = reviewThreadManager.transition(req.params.id, validation.value);
    return res.json({ ok: true, thread, request_id: requestId });
  } catch (error) {
    const reviewError = normalizeReviewThreadError(error);
    return res.status(statusForReviewThreadError(reviewError.errorKind)).json({
      ok: false,
      error: reviewError.message,
      error_kind: reviewError.errorKind,
      request_id: requestId,
    });
  }
});

app.get("/api/review-threads", (req, res) => {
  const requestId = randomUUID();
  const deltaSetId = req.query.delta_set_id;
  if (typeof deltaSetId !== "string" || deltaSetId.trim().length === 0) {
    return res.status(400).json({
      ok: false,
      error: "delta_set_id must be a non-empty string",
      error_kind: "validation",
      request_id: requestId,
    });
  }

  return res.json({
    ok: true,
    threads: reviewThreadManager.list(deltaSetId),
    request_id: requestId,
  });
});

app.post("/api/review-verdicts", (req, res) => {
  const requestId = randomUUID();
  const validation = validateSubmitReviewVerdictRequest(req.body);
  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      error: validation.error,
      error_kind: validation.error_kind,
      request_id: requestId,
    });
  }

  try {
    const verdict = reviewThreadManager.submitVerdict(validation.value);
    return res.json({ ok: true, verdict, request_id: requestId });
  } catch (error) {
    const reviewError = normalizeReviewThreadError(error);
    return res.status(statusForReviewThreadError(reviewError.errorKind)).json({
      ok: false,
      error: reviewError.message,
      error_kind: reviewError.errorKind,
      request_id: requestId,
    });
  }
});

app.post("/api/tasks/dispatch", (req, res) => {
  const startedAt = Date.now();
  let request: DispatchTaskRequest | undefined;
  const requestId = requestIdFromBody(req.body);

  const fail = (statusCode: number, errorKind: TaskErrorKind, error: string) => {
    logTaskOutcome({
      request_id: request?.requestId ?? requestId,
      route: "/api/tasks/dispatch",
      task_id: "-",
      duration_ms: Date.now() - startedAt,
      status: "error",
      error_kind: errorKind,
    });
    return res.status(statusCode).json({
      ok: false,
      error,
      error_kind: errorKind,
      request_id: request?.requestId ?? requestId,
    });
  };

  const validation = validateDispatchTaskRequest(req.body);
  if (!validation.ok) {
    return fail(400, validation.error_kind, validation.error);
  }
  request = validation.value;

  try {
    const task = taskManager.dispatch(request);
    logTaskOutcome({
      request_id: request.requestId,
      route: "/api/tasks/dispatch",
      task_id: task.id,
      duration_ms: Date.now() - startedAt,
      status: "ok",
    });
    return res.status(201).json({
      ok: true,
      task,
      request_id: request.requestId,
    });
  } catch (error) {
    const taskError = normalizeTaskError(error);
    return fail(statusForTaskError(taskError.errorKind), taskError.errorKind, taskError.message);
  }
});

app.get("/api/tasks", (_req, res) => {
  res.json({ tasks: taskManager.list() });
});

app.get("/api/tasks/:id", (req, res) => {
  const task = taskManager.get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: "not found" });
  }

  return res.json({ task });
});

app.post("/api/tasks/:id/transition", async (req, res) => {
  const startedAt = Date.now();
  let request: TransitionTaskRequest | undefined;

  const fail = (statusCode: number, errorKind: TaskErrorKind, error: string) => {
    logTaskOutcome({
      request_id: "-",
      route: "/api/tasks/:id/transition",
      task_id: req.params.id,
      duration_ms: Date.now() - startedAt,
      status: "error",
      error_kind: errorKind,
    });
    return res.status(statusCode).json({
      ok: false,
      error,
      error_kind: errorKind,
    });
  };

  const validation = validateTransitionTaskRequest(req.body);
  if (!validation.ok) {
    return fail(400, validation.error_kind, validation.error);
  }
  request = validation.value;

  try {
    const task = await taskManager.transition(req.params.id, request);
    logTaskOutcome({
      request_id: task.requestId,
      route: "/api/tasks/:id/transition",
      task_id: task.id,
      duration_ms: Date.now() - startedAt,
      status: "ok",
    });
    return res.json({ ok: true, task });
  } catch (error) {
    const taskError = normalizeTaskError(error);
    if (taskError.errorKind === "not-found") {
      return res.status(404).json({ error: "not found" });
    }
    return fail(statusForTaskError(taskError.errorKind), taskError.errorKind, taskError.message);
  }
});

function requestIdFromBody(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "request_id" in payload &&
    typeof (payload as { request_id?: unknown }).request_id === "string"
  ) {
    return (payload as { request_id: string }).request_id;
  }

  return "-";
}

function providerIdFromBody(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "provider_id" in payload &&
    typeof (payload as { provider_id?: unknown }).provider_id === "string"
  ) {
    return (payload as { provider_id: string }).provider_id;
  }

  return "-";
}

function signalCountFromBody(payload: unknown): number {
  if (
    payload &&
    typeof payload === "object" &&
    "signals" in payload &&
    Array.isArray((payload as { signals?: unknown }).signals)
  ) {
    return (payload as { signals: unknown[] }).signals.length;
  }

  return 0;
}

function constructTickerFallbackSlice(request: ConstructSliceRequest): Slice | null {
  if (!process.env.H_TICKER_INTERVAL_MS || request.defaultTtlMs > 1_000) {
    return null;
  }

  const createdAtMs = Date.now();
  const querySlug = request.query.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 48);
  return makeSlice({
    id: `slice:ticker-fallback-${querySlug || "query"}-${createdAtMs}`,
    query: request.query,
    matchedEntityIds: [`synthetic:${querySlug || "query"}`],
    neighbourhoodEntityIds: [],
    rule: request.rule,
    lifecycleState: "active",
    ttlMs: createdAtMs + request.defaultTtlMs,
    createdBy: request.actor,
    createdAtMs,
    pinnedAtMs: null,
    trust: { state: "grounded", grounding: "lsp-type" },
  });
}

function normalizeOverlayError(error: unknown): OverlayManagerError {
  if (error instanceof OverlayManagerError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "overlay route failed";
  return new OverlayManagerError("internal", message, { cause: error });
}

function statusForOverlayError(errorKind: OverlayErrorKind): number {
  switch (errorKind) {
    case "validation":
      return 400;
    case "not-found":
      return 404;
    case "internal":
      return 500;
  }
}

function normalizeProviderError(error: unknown): ProviderRegistryError {
  if (error instanceof ProviderRegistryError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "provider route failed";
  return new ProviderRegistryError("internal", message, { cause: error });
}

function statusForProviderError(errorKind: ProviderErrorKind): number {
  switch (errorKind) {
    case "validation":
    case "unsupported-kind":
      return 400;
    case "not-found":
      return 404;
    case "adapter-error":
    case "internal":
      return 500;
  }
}

function normalizeTaskError(error: unknown): TaskManagerError {
  if (error instanceof TaskManagerError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "task route failed";
  return new TaskManagerError("internal", message, { cause: error });
}

function statusForTaskError(errorKind: TaskErrorKind): number {
  switch (errorKind) {
    case "validation":
    case "invalid-transition":
      return 400;
    case "not-found":
      return 404;
    case "git":
    case "worktree":
    case "internal":
      return 500;
  }
}

function normalizePRDeltaError(error: unknown): PRDeltaComputeError {
  if (error instanceof PRDeltaComputeError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "PR delta computation failed";
  return new PRDeltaComputeError("internal", message, { cause: error });
}

function normalizeWidgetExtractionError(error: unknown): WidgetExtractionError {
  if (error instanceof WidgetExtractionError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "widget extraction failed";
  return new WidgetExtractionError("internal", message, { cause: error });
}

function statusForPRDeltaError(errorKind: PRDeltaErrorKind): number {
  switch (errorKind) {
    case "validation":
      return 400;
    case "git":
    case "extraction":
    case "internal":
      return 500;
  }
}

function normalizeReviewThreadError(error: unknown): ReviewThreadManagerError {
  if (error instanceof ReviewThreadManagerError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "review thread route failed";
  return new ReviewThreadManagerError("internal", message, { cause: error });
}

function statusForReviewThreadError(errorKind: ReviewThreadErrorKind): number {
  switch (errorKind) {
    case "validation":
    case "invalid-transition":
      return 400;
    case "not-found":
      return 404;
    case "internal":
      return 500;
  }
}

function normalizeSliceError(error: unknown): SliceManagerError {
  if (error instanceof SliceManagerError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "slice route failed";
  return new SliceManagerError("internal", message, { cause: error });
}

function statusForSliceError(errorKind: SliceErrorKind): number {
  switch (errorKind) {
    case "validation":
    case "invalid-transition":
      return 400;
    case "not-found":
      return 404;
    case "internal":
      return 500;
  }
}

// Serve static site pages
const SITE_DIR = join(PROJECT_ROOT, "..", "agent-implementation-skill", "execution-philosophy", "diagrams", "site");
app.use("/site", express.static(SITE_DIR));

// --- Start ---

const PORT = parseInt(process.env.WATCHER_PORT || "3001", 10);

await loadConfig();
startLifecycleTicker({ sliceManager, changeEvents: changeEventStore });

app.listen(PORT, () => {
  console.log(`Watcher server on http://localhost:${PORT}`);
  console.log(`  SSE endpoint: http://localhost:${PORT}/api/events`);
  console.log(`  Watch API: http://localhost:${PORT}/api/watch`);
  console.log(`  Active watches: ${watches.size}`);
});
