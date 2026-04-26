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

import type {
  OperationalOverlay,
  OverlayLayer,
  OverlayProviderId,
  OverlaySignal,
} from "../app/lib/overlay";

const TEST_DIR = resolve(".tmp/overlays-route");
const LOG_PATH = join(TEST_DIR, "watcher.log");

const OVERLAY_PROVIDER_IDS = [
  "g:test",
  "g:pr-delta",
  "g:deploy",
  "g:profile",
  "g:task-active",
] as const satisfies readonly OverlayProviderId[];

let watcher: ChildProcessWithoutNullStreams | null = null;
let api: APIRequestContext;
let sequence = 0;
const runId = `${Date.now()}-${process.pid}`;

test.describe.serial("/api/overlays", () => {
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

  test.beforeEach(async () => {
    await clearOverlayLayers();
  });

  test.afterEach(async () => {
    await clearOverlayLayers();
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

  test("bad provider_id returns 400 validation", async () => {
    const requestId = requestIdFor("bad-provider");
    const response = await postLayer({
      provider_id: "g:not-a-provider",
      signals: [],
      computed_at_ms: 1_000,
      attribution_actor: "ci",
      request_id: requestId,
    });
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error_kind: "validation",
      request_id: requestId,
    });
  });

  test("empty signals layer registers successfully", async () => {
    const requestId = requestIdFor("empty");
    const response = await postLayer(
      layerRequest("g:test", [], { computed_at_ms: 1_100, request_id: requestId }),
    );
    const body = await expectJsonStatus(response, 200);

    expect(body).toMatchObject({
      ok: true,
      request_id: requestId,
      layer: {
        providerId: "g:test",
        signals: [],
        computedAtMs: 1_100,
        attributionActor: "ci",
      },
    });
  });

  test("empty signal entity_id returns 400 validation", async () => {
    const requestId = requestIdFor("empty-entity");
    const response = await postLayer(
      layerRequest("g:test", [
        signal("g:test", "", { label: "No entity" }),
      ], { request_id: requestId }),
    );
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error_kind: "validation",
      request_id: requestId,
    });
  });

  test("empty signal label returns 400 validation", async () => {
    const requestId = requestIdFor("empty-label");
    const response = await postLayer(
      layerRequest("g:test", [
        signal("g:test", "entity:empty-label", { label: "" }),
      ], { request_id: requestId }),
    );
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error_kind: "validation",
      request_id: requestId,
    });
  });

  test("out-of-order signals return 400 validation", async () => {
    const requestId = requestIdFor("out-of-order");
    const response = await postLayer(
      layerRequest("g:test", [
        signal("g:test", "entity:z"),
        signal("g:test", "entity:a"),
      ], { request_id: requestId }),
    );
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error_kind: "validation",
      request_id: requestId,
    });
  });

  test("duplicate entity_id within a layer returns 400 validation", async () => {
    const requestId = requestIdFor("duplicate-entity");
    const response = await postLayer(
      layerRequest("g:test", [
        signal("g:test", "entity:dup", { label: "First" }),
        signal("g:test", "entity:dup", { label: "Second" }),
      ], { request_id: requestId }),
    );
    const body = await expectJsonStatus(response, 400);

    expect(body).toMatchObject({
      ok: false,
      error_kind: "validation",
      request_id: requestId,
    });
  });

  test("POST replaces the existing layer for a provider", async () => {
    await expectLayerRegistered(
      "g:test",
      [signal("g:test", "entity:first", { kind: "fail", label: "Old result" })],
      { computed_at_ms: 2_000 },
    );
    await expectLayerRegistered(
      "g:test",
      [signal("g:test", "entity:second", { kind: "pass", label: "New result" })],
      { computed_at_ms: 3_000 },
    );

    const overlay = await getOverlay();
    expect(overlay.computedAtMs).toBe(3_000);
    expect(overlay.layers).toHaveLength(1);
    expect(overlay.layers[0]).toMatchObject({
      providerId: "g:test",
      computedAtMs: 3_000,
      signals: [
        expect.objectContaining({
          entityId: "entity:second",
          kind: "pass",
          label: "New result",
        }),
      ],
    });
  });

  test("GET returns all layers and DELETE removes a layer", async () => {
    await expectLayerRegistered(
      "g:test",
      [signal("g:test", "entity:test", { kind: "pass", label: "Tests pass" })],
      { computed_at_ms: 4_000 },
    );
    await expectLayerRegistered(
      "g:deploy",
      [signal("g:deploy", "entity:deploy", { kind: "in-progress", label: "Deploying" })],
      { computed_at_ms: 4_500 },
    );

    const beforeDelete = await getOverlay();
    expect(beforeDelete.computedAtMs).toBe(4_500);
    expect(beforeDelete.layers.map((layer) => layer.providerId)).toEqual([
      "g:deploy",
      "g:test",
    ]);

    const deleteBody = await expectJsonStatus(
      await api.delete("/api/overlays/layers/g%3Atest"),
      200,
    );
    expect(deleteBody).toEqual({ ok: true });

    const afterDelete = await getOverlay();
    expect(afterDelete.layers.map((layer) => layer.providerId)).toEqual(["g:deploy"]);
    expect(afterDelete.layers[0].signals).toEqual([
      expect.objectContaining({
        providerId: "g:deploy",
        entityId: "entity:deploy",
        kind: "in-progress",
      }),
    ]);
  });
});

type LayerRequest = {
  provider_id: string;
  signals: readonly OverlaySignal[];
  computed_at_ms: number;
  attribution_actor: string;
  request_id: string;
};

function layerRequest(
  providerId: OverlayProviderId,
  signals: readonly OverlaySignal[],
  overrides: Partial<LayerRequest> = {},
): LayerRequest {
  return {
    provider_id: providerId,
    signals,
    computed_at_ms: 1_000,
    attribution_actor: "ci",
    request_id: requestIdFor(providerId),
    ...overrides,
  };
}

function signal(
  providerId: OverlayProviderId,
  entityId: string,
  overrides: Partial<OverlaySignal> = {},
): OverlaySignal {
  return {
    providerId,
    entityId,
    kind: "info",
    label: `Overlay signal for ${entityId}`,
    trust: { state: "grounded", grounding: "test" },
    emittedAtMs: 1_000,
    detailUrl: null,
    ...overrides,
  };
}

async function postLayer(body: LayerRequest | Record<string, unknown>) {
  return api.post("/api/overlays/layers", { data: body });
}

async function expectLayerRegistered(
  providerId: OverlayProviderId,
  signals: readonly OverlaySignal[],
  overrides: Partial<LayerRequest> = {},
): Promise<OverlayLayer> {
  const response = await postLayer(layerRequest(providerId, signals, overrides));
  const body = await expectJsonStatus(response, 200);

  expect(body).toMatchObject({
    ok: true,
    layer: expect.any(Object),
    request_id: expect.any(String),
  });
  return body.layer;
}

async function getOverlay(): Promise<OperationalOverlay> {
  const response = await api.get("/api/overlays");
  const body = await expectJsonStatus(response, 200);

  expect(body).toMatchObject({
    overlay: {
      layers: expect.any(Array),
      computedAtMs: expect.any(Number),
    },
  });
  return body.overlay;
}

async function clearOverlayLayers() {
  await Promise.all(
    OVERLAY_PROVIDER_IDS.map((providerId) =>
      api.delete(`/api/overlays/layers/${encodeURIComponent(providerId)}`).catch(() => null),
    ),
  );
}

async function expectJsonStatus(response: APIResponse, expectedStatus: number) {
  const text = await response.text();
  expect(response.status(), text).toBe(expectedStatus);
  expect(response.headers()["content-type"] ?? "", text).toContain("application/json");
  return JSON.parse(text);
}

function requestIdFor(label: string) {
  sequence += 1;
  return `request:g2-overlays-${label}-${runId}-${sequence}`;
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
