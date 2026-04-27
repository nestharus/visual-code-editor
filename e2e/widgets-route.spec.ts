import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

import type { Widget } from "../app/lib/widget";

const TEST_DIR = resolve(".tmp/widgets-route");
const LOG_PATH = join(TEST_DIR, "watcher.log");
const PROBE_PATHS: string[] = [];

let watcher: ChildProcessWithoutNullStreams | null = null;
let api: APIRequestContext;
let sequence = 0;

test.describe("/api/widgets", () => {
  test.beforeAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });

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

    for (const path of PROBE_PATHS) {
      await rm(path, { force: true });
    }
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test("GET /api/widgets returns a 200 with a widgets array", async () => {
    const body = await getWidgets();

    expect(body.widgets).toEqual(expect.any(Array));
    expect(body.computed_at_ms).toEqual(expect.any(Number));
  });

  test("GET /api/widgets includes fixture widgets from app/components", async () => {
    const { widgets } = await getWidgets();

    expect(widgets).toEqual(
      expect.arrayContaining([
        expectedWidget({
          id: "widget:app.components.ControlIcon.ControlIcon",
          label: "ControlIcon",
          kind: "icon",
          identifier: "app/components/ControlIcon.tsx#ControlIcon",
        }),
        expectedWidget({
          id: "widget:app.components.DetailPanel.DetailPanel",
          label: "DetailPanel",
          kind: "panel",
          identifier: "app/components/DetailPanel.tsx#DetailPanel",
        }),
        expectedWidget({
          id: "widget:app.components.tasks-panel.TasksPanel.TasksPanel",
          label: "TasksPanel",
          kind: "panel",
          identifier: "app/components/tasks-panel/TasksPanel.tsx#TasksPanel",
        }),
      ]),
    );
  });

  test("GET /api/widgets/:id returns a known widget and 404s unknown ids", async () => {
    const knownId = "widget:app.components.ControlIcon.ControlIcon";

    const foundResponse = await api.get(`/api/widgets/${encodeURIComponent(knownId)}`);
    const foundBody = await expectJsonStatus(foundResponse, 200);
    expect(foundBody.widget).toMatchObject({
      id: knownId,
      label: "ControlIcon",
      kind: "icon",
    });

    const missingResponse = await api.get("/api/widgets/widget:missing-widget-route");
    const missingBody = await expectJsonStatus(missingResponse, 404);
    expect(missingBody.error).toEqual(expect.any(String));
  });

  test("GET /api/widgets?refresh=true forces re-extraction", async () => {
    await getWidgets();

    const componentName = `WidgetInventoryRefreshProbe${uniqueSuffix()}`;
    const probePath = resolve("app", "components", `${componentName}.tsx`);
    PROBE_PATHS.push(probePath);

    await writeFile(
      probePath,
      [
        "import type { JSX } from \"solid-js\";",
        "",
        `export function ${componentName}(): JSX.Element {`,
        "  return <button type=\"button\">Refresh probe</button>;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const refreshed = await getWidgets({ refresh: true });
    expect(refreshed.widgets).toEqual(
      expect.arrayContaining([
        expectedWidget({
          id: `widget:app.components.${componentName}.${componentName}`,
          label: componentName,
          kind: "generic",
          identifier: `app/components/${componentName}.tsx#${componentName}`,
        }),
      ]),
    );
  });
});

function expectedWidget(input: {
  id: string;
  label: string;
  kind: Widget["kind"];
  identifier: string;
}) {
  return expect.objectContaining({
    id: input.id,
    label: input.label,
    kind: input.kind,
    references: expect.arrayContaining([
      expect.objectContaining({
        surface: "source",
        identifier: input.identifier,
      }),
    ]),
  });
}

async function getWidgets(options: { refresh?: boolean } = {}) {
  const path = options.refresh ? "/api/widgets?refresh=true" : "/api/widgets";
  const response = await api.get(path);
  const body = await expectJsonStatus(response, 200);
  return body as { widgets: Widget[]; computed_at_ms: number };
}

async function expectJsonStatus(response: APIResponse, expectedStatus: number) {
  const text = await response.text();
  expect(response.status(), text).toBe(expectedStatus);
  expect(response.headers()["content-type"] ?? "", text).toContain("application/json");
  return JSON.parse(text);
}

function uniqueSuffix() {
  sequence += 1;
  return `${Date.now()}${process.pid}${sequence}`;
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
