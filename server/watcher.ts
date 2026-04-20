/**
 * File watcher server — watches diagram source folders and pushes
 * change events via SSE. Configurable via REST API.
 */

import express from "express";
import cors from "cors";
import chokidar from "chokidar";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

type PromptMode = "ask" | "edit";

type PanelPromptCodeBlock = {
  id: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  language?: string;
  symbol?: string;
  content?: string;
};

type PanelPromptRequest = {
  pathname: string;
  prompt: string;
  mode: PromptMode;
  panel: {
    kind: string;
    id: string;
    label: string;
  };
  focus: {
    blockIds: string[];
  };
  context: {
    entity?: {
      id?: string;
      kind?: string;
      label?: string;
      description?: string;
    };
    codeBlocks: PanelPromptCodeBlock[];
  };
};

type PanelPromptAnswer = {
  kind: "answer";
  response: string;
};

type PanelPromptEdit = {
  kind: "code-edit";
  response: string;
  edits: Array<{
    blockId: string;
    path: string;
    before: string;
    after: string;
    language?: string;
    symbol?: string;
  }>;
};

type PanelPromptResponse = PanelPromptAnswer | PanelPromptEdit;

type ValidateBodyResult =
  | { ok: true; parsed: PanelPromptRequest }
  | { ok: false; error: string };

type SpawnAgentsOutcome = "ok" | "timeout" | "exit" | "oversize";

type SpawnAgentsResult = {
  outcome: SpawnAgentsOutcome;
  stdout: string;
  stderr: string;
  stdoutBytes: number;
  stderrBytes: number;
  exitCode: number | null;
  elapsedMs: number;
};

type ExtractJsonResult =
  | { parsed: unknown; parsePath: "raw" | "brace" | "fenced" | "lenient" }
  | { parsed: null; parsePath: "degraded" };

const app = express();
app.use(cors());
app.use(express.json());

const watches = new Map<string, WatchEntry>();
const sseClients = new Set<express.Response>();
let buildCounter = 0;

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

function validateBody(body: unknown): ValidateBodyResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }

  const candidate = body as Record<string, unknown>;
  const { pathname, prompt, mode, panel, focus, context } = candidate;

  if (typeof pathname !== "string" || pathname.length === 0) {
    return { ok: false, error: "pathname must be a non-empty string" };
  }

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return { ok: false, error: "prompt must be a non-empty string" };
  }

  if (mode !== "ask" && mode !== "edit") {
    return { ok: false, error: "mode must be ask or edit" };
  }

  if (!panel || typeof panel !== "object") {
    return { ok: false, error: "panel must be an object" };
  }

  const panelRecord = panel as Record<string, unknown>;
  if (
    typeof panelRecord.kind !== "string"
    || typeof panelRecord.id !== "string"
    || typeof panelRecord.label !== "string"
  ) {
    return { ok: false, error: "panel.kind, panel.id, and panel.label must be strings" };
  }

  if (!focus || typeof focus !== "object") {
    return { ok: false, error: "focus must be an object" };
  }

  const focusRecord = focus as Record<string, unknown>;
  if (!Array.isArray(focusRecord.blockIds) || !focusRecord.blockIds.every((id) => typeof id === "string")) {
    return { ok: false, error: "focus.blockIds must be an array of strings" };
  }

  if (!context || typeof context !== "object") {
    return { ok: false, error: "context must be an object" };
  }

  const contextRecord = context as Record<string, unknown>;
  if (!Array.isArray(contextRecord.codeBlocks)) {
    return { ok: false, error: "context.codeBlocks must be an array" };
  }

  const parsedCodeBlocks: PanelPromptCodeBlock[] = [];
  for (const block of contextRecord.codeBlocks) {
    if (!block || typeof block !== "object") {
      return { ok: false, error: "context.codeBlocks entries must be objects" };
    }

    const blockRecord = block as Record<string, unknown>;
    if (
      typeof blockRecord.id !== "string"
      || typeof blockRecord.path !== "string"
      || typeof blockRecord.lineStart !== "number"
      || typeof blockRecord.lineEnd !== "number"
    ) {
      return {
        ok: false,
        error: "context.codeBlocks entries must include string id/path and numeric lineStart/lineEnd",
      };
    }

    if (blockRecord.language !== undefined && typeof blockRecord.language !== "string") {
      return { ok: false, error: "context.codeBlocks[].language must be a string when present" };
    }

    if (blockRecord.symbol !== undefined && typeof blockRecord.symbol !== "string") {
      return { ok: false, error: "context.codeBlocks[].symbol must be a string when present" };
    }

    if (blockRecord.content !== undefined && typeof blockRecord.content !== "string") {
      return { ok: false, error: "context.codeBlocks[].content must be a string when present" };
    }

    parsedCodeBlocks.push({
      id: blockRecord.id,
      path: blockRecord.path,
      lineStart: blockRecord.lineStart,
      lineEnd: blockRecord.lineEnd,
      language: typeof blockRecord.language === "string" ? blockRecord.language : undefined,
      symbol: typeof blockRecord.symbol === "string" ? blockRecord.symbol : undefined,
      content: typeof blockRecord.content === "string" ? blockRecord.content : undefined,
    });
  }

  if (contextRecord.entity !== undefined && (!contextRecord.entity || typeof contextRecord.entity !== "object")) {
    return { ok: false, error: "context.entity must be an object when present" };
  }

  const entityRecord = (contextRecord.entity as Record<string, unknown> | undefined) ?? undefined;
  for (const key of ["id", "kind", "label", "description"] as const) {
    const value = entityRecord?.[key];
    if (value !== undefined && typeof value !== "string") {
      return { ok: false, error: `context.entity.${key} must be a string when present` };
    }
  }

  return {
    ok: true,
    parsed: {
      pathname,
      prompt,
      mode,
      panel: {
        kind: panelRecord.kind,
        id: panelRecord.id,
        label: panelRecord.label,
      },
      focus: {
        blockIds: focusRecord.blockIds,
      },
      context: {
        entity: entityRecord
          ? {
              id: typeof entityRecord.id === "string" ? entityRecord.id : undefined,
              kind: typeof entityRecord.kind === "string" ? entityRecord.kind : undefined,
              label: typeof entityRecord.label === "string" ? entityRecord.label : undefined,
              description: typeof entityRecord.description === "string" ? entityRecord.description : undefined,
            }
          : undefined,
        codeBlocks: parsedCodeBlocks,
      },
    },
  };
}

function composePrompt(req: PanelPromptRequest): string {
  const focusedBlocks = req.focus.blockIds
    .map((blockId) => req.context.codeBlocks.find((block) => block.id === blockId))
    .filter((block): block is PanelPromptCodeBlock => Boolean(block));
  const panelDescription = req.context.entity?.description?.trim();

  const blockSections = focusedBlocks.length > 0
    ? focusedBlocks.map((block, index) => {
        const blockMeta = [
          `blockId: ${block.id}`,
          `path: ${block.path}`,
          `lines: ${block.lineStart}-${block.lineEnd}`,
          `language: ${block.language || "-"}`,
          `symbol: ${block.symbol || "-"}`,
        ].join("\n");
        return [
          `## Focused Block ${index + 1}`,
          blockMeta,
          "",
          "```",
          block.content || "",
          "```",
        ].join("\n");
      }).join("\n\n")
    : "## Focused Blocks\nNone selected.";

  const responseContract = req.mode === "edit"
    ? [
        "## Response Contract",
        "Return exactly one JSON object and nothing else.",
        "Use this shape:",
        "{",
        '  "kind": "code-edit",',
        '  "response": "Short summary of the edit suggestion.",',
        '  "edits": [',
        "    {",
        '      "blockId": "one of the provided focused block ids",',
        '      "before": "exact current content for that block",',
        '      "after": "your suggested replacement content"',
        "    }",
        "  ]",
        "}",
        "Only use these block ids:",
        req.focus.blockIds.length > 0 ? req.focus.blockIds.map((blockId) => `- ${blockId}`).join("\n") : "- none",
      ].join("\n")
    : [
        "## Response Contract",
        "Respond with plain text only.",
        "Do not return JSON or markdown fences.",
      ].join("\n");

  return [
    `# Panel Prompt (${req.mode})`,
    "",
    "## Route",
    req.pathname,
    "",
    "## Panel",
    `kind: ${req.panel.kind}`,
    `id: ${req.panel.id}`,
    `label: ${req.panel.label}`,
    `description: ${panelDescription || "-"}`,
    "",
    "## User Request",
    req.prompt,
    "",
    blockSections,
    "",
    responseContract,
  ].join("\n");
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

function sanitizeLogValue(value: string | number | null): string {
  if (value === null) return "-";
  return String(value).trim().replace(/\s+/g, "_") || "-";
}

function logOutcome(fields: Record<string, string | number | null>) {
  const parts = Object.entries(fields).map(([key, value]) => `${key}=${sanitizeLogValue(value)}`);
  console.log(`panel_prompt ${parts.join(" ")}`);
}

function trimExcerpt(text: string, maxChars = 240): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxChars) return trimmed || "-";
  return `${trimmed.slice(0, maxChars - 3)}...`;
}

function trimForDisplay(text: string, maxChars = 4000): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars - 3)}...`;
}

function logFailureExcerpt(requestId: string, stderr: string) {
  console.log(`panel_prompt_detail request_id=${requestId} stderr=${JSON.stringify(trimExcerpt(stderr))}`);
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
    let settled = false;
    let outcome: SpawnAgentsOutcome | null = null;
    let forceResolveTimer: ReturnType<typeof setTimeout> | undefined;
    let sigkillTimer: ReturnType<typeof setTimeout> | undefined;

    const child = spawn("agents", ["-m", model, "-p", PROJECT_ROOT], {
      detached: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

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
        outcome = "exit";
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

const DIAGRAM_JSON_PATH = process.env.DIAGRAM_JSON
  || join(PROJECT_ROOT, "dist", "data", "diagram.json");

app.get("/api/diagram", async (_req, res) => {
  try {
    const data = await readFile(DIAGRAM_JSON_PATH, "utf-8");
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch {
    res.status(404).json({ error: "Run: python3 src/visual_code_editor/export_json_cli.py <workspace.json> > dist/data/diagram.json" });
  }
});

app.post("/api/prompt", (req, res) => {
  const selection = Array.isArray(req.body?.selection) ? req.body.selection : [];
  const labels = selection
    .map((item) => (item && typeof item.label === "string" ? item.label : "unnamed"))
    .join(", ");

  res.json({
    response: `Analysis of ${selection.length} entities (${labels}): These entities are part of the system architecture and interact through defined edges. The selected components handle core functionality.`,
  });
});

app.post("/api/panel-prompt", async (req, res) => {
  const requestId = randomUUID();
  const ref = requestId.slice(0, 8);
  const askModel = process.env.PANEL_PROMPT_ASK_MODEL || "claude-haiku";
  const editModel = process.env.PANEL_PROMPT_EDIT_MODEL || "gpt-high";
  const askTimeoutMs = parseInt(process.env.PANEL_PROMPT_ASK_TIMEOUT_MS || "", 10) || 20000;
  const editTimeoutMs = parseInt(process.env.PANEL_PROMPT_EDIT_TIMEOUT_MS || "", 10) || 45000;
  const enabled = process.env.PANEL_PROMPT_ENABLED !== "0";
  const debugPrompt = process.env.PANEL_PROMPT_DEBUG === "1";

  const validation = validateBody(req.body);
  if (!validation.ok) {
    logOutcome({
      request_id: requestId,
      outcome: "validation_error",
      mode: "-",
      panel: "-",
      model: "-",
      elapsed_ms: 0,
      parse_path: "-",
      stdout_bytes: 0,
      stderr_bytes: 0,
      exit_code: "-",
    });
    logFailureExcerpt(requestId, validation.error);
    return res.json({
      kind: "answer",
      response: `Invalid request. [ref: ${ref}]`,
    } satisfies PanelPromptResponse);
  }

  const panelRequest = validation.parsed;
  const panelKey = `${panelRequest.panel.kind}/${panelRequest.panel.id}`;
  const model = panelRequest.mode === "edit" ? editModel : askModel;

  if (!enabled) {
    logOutcome({
      request_id: requestId,
      outcome: "disabled",
      mode: panelRequest.mode,
      panel: panelKey,
      model,
      elapsed_ms: 0,
      parse_path: "-",
      stdout_bytes: 0,
      stderr_bytes: 0,
      exit_code: "-",
    });
    return res.json({
      kind: "answer",
      response: `Panel prompt is temporarily unavailable in this environment. [ref: ${ref}]`,
    } satisfies PanelPromptResponse);
  }

  if (panelRequest.mode === "edit" && panelRequest.focus.blockIds.length === 0) {
    logOutcome({
      request_id: requestId,
      outcome: "no_focus",
      mode: panelRequest.mode,
      panel: panelKey,
      model,
      elapsed_ms: 0,
      parse_path: "-",
      stdout_bytes: 0,
      stderr_bytes: 0,
      exit_code: "-",
    });
    return res.json({
      kind: "answer",
      response: `Select a code block with 'Use in Prompt' to get a concrete edit suggestion. [ref: ${ref}]`,
    } satisfies PanelPromptResponse);
  }

  const prompt = composePrompt(panelRequest);
  if (debugPrompt) {
    console.log(
      `panel_prompt_debug request_id=${requestId} prompt_bytes=${Buffer.byteLength(prompt, "utf8")}\n---prompt---\n${prompt}\n---end prompt---`,
    );
  }

  const spawnResult = await spawnAgents(
    model,
    prompt,
    panelRequest.mode === "edit" ? editTimeoutMs : askTimeoutMs,
    panelRequest.mode === "edit" ? 512 * 1024 : 256 * 1024,
  );

  if (spawnResult.outcome !== "ok") {
    logOutcome({
      request_id: requestId,
      outcome: spawnResult.outcome,
      mode: panelRequest.mode,
      panel: panelKey,
      model,
      elapsed_ms: spawnResult.elapsedMs,
      parse_path: "-",
      stdout_bytes: spawnResult.stdoutBytes,
      stderr_bytes: spawnResult.stderrBytes,
      exit_code: spawnResult.exitCode ?? "-",
    });
    logFailureExcerpt(requestId, spawnResult.stderr);

    const degradedMessage =
      spawnResult.outcome === "timeout"
        ? `Panel prompt timed out before the model returned a result. Please retry. [ref: ${ref}]`
        : spawnResult.outcome === "oversize"
          ? `Panel prompt response exceeded the server size limit. Please narrow the request. [ref: ${ref}]`
          : `Panel prompt could not generate a response right now. Please retry. [ref: ${ref}]`;
    return res.json({
      kind: "answer",
      response: degradedMessage,
    } satisfies PanelPromptResponse);
  }

  if (panelRequest.mode === "ask") {
    logOutcome({
      request_id: requestId,
      outcome: "ok",
      mode: panelRequest.mode,
      panel: panelKey,
      model,
      elapsed_ms: spawnResult.elapsedMs,
      parse_path: "-",
      stdout_bytes: spawnResult.stdoutBytes,
      stderr_bytes: spawnResult.stderrBytes,
      exit_code: spawnResult.exitCode ?? "-",
    });
    return res.json({
      kind: "answer",
      response: spawnResult.stdout.trim(),
    } satisfies PanelPromptResponse);
  }

  const extracted = extractJson(spawnResult.stdout);
  if (extracted.parsePath === "degraded" || !extracted.parsed || typeof extracted.parsed !== "object") {
    logOutcome({
      request_id: requestId,
      outcome: "parse_fail",
      mode: panelRequest.mode,
      panel: panelKey,
      model,
      elapsed_ms: spawnResult.elapsedMs,
      parse_path: extracted.parsePath,
      stdout_bytes: spawnResult.stdoutBytes,
      stderr_bytes: spawnResult.stderrBytes,
      exit_code: spawnResult.exitCode ?? "-",
    });
    logFailureExcerpt(requestId, spawnResult.stderr);
    return res.json({
      kind: "answer",
      response: `Panel prompt returned an unstructured edit suggestion instead of parseable edits.\n\n${trimForDisplay(spawnResult.stdout)}\n\n[ref: ${ref}]`,
    } satisfies PanelPromptResponse);
  }

  const parsedResponse = extracted.parsed as Record<string, unknown>;
  const parsedKind = parsedResponse.kind;
  const rawResponse = typeof parsedResponse.response === "string"
    ? parsedResponse.response
    : "Panel prompt returned an edit suggestion.";
  const rawEdits =
    parsedKind === "code-edit" && Array.isArray(parsedResponse.edits)
      ? parsedResponse.edits
      : [];
  const allowedBlockIds = new Set(panelRequest.focus.blockIds);
  const blockById = new Map(panelRequest.context.codeBlocks.map((block) => [block.id, block]));
  const validatedEdits = rawEdits.flatMap((edit) => {
    if (!edit || typeof edit !== "object") return [];
    const editRecord = edit as Record<string, unknown>;
    if (
      typeof editRecord.blockId !== "string"
      || !allowedBlockIds.has(editRecord.blockId)
      || typeof editRecord.before !== "string"
      || typeof editRecord.after !== "string"
    ) {
      return [];
    }

    const block = blockById.get(editRecord.blockId);
    if (!block) return [];

    return [{
      blockId: editRecord.blockId,
      path: block.path,
      before: editRecord.before,
      after: editRecord.after,
      language: block.language,
      symbol: block.symbol,
    }];
  });

  if (validatedEdits.length === 0) {
    logOutcome({
      request_id: requestId,
      outcome: "ok",
      mode: panelRequest.mode,
      panel: panelKey,
      model,
      elapsed_ms: spawnResult.elapsedMs,
      parse_path: extracted.parsePath,
      stdout_bytes: spawnResult.stdoutBytes,
      stderr_bytes: spawnResult.stderrBytes,
      exit_code: spawnResult.exitCode ?? "-",
    });
    return res.json({
      kind: "answer",
      response: `${rawResponse}\n\nNo valid edits matched the selected focused block(s). [ref: ${ref}]`,
    } satisfies PanelPromptResponse);
  }

  logOutcome({
    request_id: requestId,
    outcome: "ok",
    mode: panelRequest.mode,
    panel: panelKey,
    model,
    elapsed_ms: spawnResult.elapsedMs,
    parse_path: extracted.parsePath,
    stdout_bytes: spawnResult.stdoutBytes,
    stderr_bytes: spawnResult.stderrBytes,
    exit_code: spawnResult.exitCode ?? "-",
  });
  return res.json({
    kind: "code-edit",
    response: rawResponse,
    edits: validatedEdits,
  } satisfies PanelPromptResponse);
});

// Serve static site pages
const SITE_DIR = join(PROJECT_ROOT, "..", "agent-implementation-skill", "execution-philosophy", "diagrams", "site");
app.use("/site", express.static(SITE_DIR));

// --- Start ---

const PORT = parseInt(process.env.WATCHER_PORT || "3001", 10);

await loadConfig();

app.listen(PORT, () => {
  console.log(`Watcher server on http://localhost:${PORT}`);
  console.log(`  SSE endpoint: http://localhost:${PORT}/api/events`);
  console.log(`  Watch API: http://localhost:${PORT}/api/watch`);
  console.log(`  Active watches: ${watches.size}`);
});
