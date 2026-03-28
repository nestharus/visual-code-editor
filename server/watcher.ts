/**
 * File watcher server — watches diagram source folders and pushes
 * change events via SSE. Configurable via REST API.
 */

import express from "express";
import cors from "cors";
import chokidar from "chokidar";
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
