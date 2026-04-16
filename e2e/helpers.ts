/**
 * E2E test helpers — route interception + cytoscape interaction.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Page } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureData = JSON.parse(
  readFileSync(join(__dirname, "fixtures/diagram-data.json"), "utf-8"),
);

/**
 * Intercept all API calls so tests don't need the watcher server.
 * Must be called BEFORE page.goto().
 */
export async function setupMockApi(page: Page) {
  // Diagram data API
  await page.route("**/api/diagram", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixtureData),
    });
  });

  // SSE endpoint — prevent reconnection loops
  await page.route("**/api/events", async (route) => {
    await route.abort();
  });

  // Code endpoint — return fixture code blocks for entity
  await page.route("**/api/panel-code**", async (route) => {
    const url = new URL(route.request().url());
    const entityId = url.searchParams.get("entityId") || "";
    const codeIndex = fixtureData.code || { byEntity: {}, blocks: {} };
    const blockIds = codeIndex.byEntity[entityId] || [];
    const blocks = blockIds
      .map((id: string) => codeIndex.blocks[id])
      .filter(Boolean);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entityId, blocks }),
    });
  });

  // Search endpoint — return mock search results
  await page.route("**/api/search", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const query = (body.query || "").toLowerCase();

    // Build a simple lexical search result from fixture data
    const allElements = fixtureData.organizational.root.elements || [];
    const matchedNodes = allElements.filter((el: any) => {
      if (el.data.source) return false;
      return (
        (el.data.label || "").toLowerCase().includes(query) ||
        (el.data.kind || "").toLowerCase().includes(query)
      );
    });
    const matchedNodeIds = new Set(matchedNodes.map((el: any) => el.data.id));
    const matchedEdges = allElements.filter((el: any) => {
      if (!el.data.source) return false;
      return (
        matchedNodeIds.has(el.data.source) || matchedNodeIds.has(el.data.target)
      );
    });

    const graph = {
      id: `search:${query}`,
      nodes: matchedNodes.map((el: any) => ({
        id: el.data.id,
        kind: (el.classes || "").split(" ")[0] || el.data.kind || "default",
        label: el.data.label || el.data.id,
        data: el.data,
        size: { width: 150, height: 60 },
      })),
      edges: matchedEdges.map((el: any) => ({
        id: el.data.id,
        source: el.data.source,
        target: el.data.target,
        kind: (el.classes || "").split(" ").pop() || el.data.kind || "edge",
        label: el.data.label,
        data: el.data,
      })),
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        query,
        graph,
        summary: `Found ${graph.nodes.length} matches`,
      }),
    });
  });

  await page.route("**/api/prompt", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const selected = Array.isArray(body.selection) ? body.selection : [];
    const labels = selected.map((s: any) => s.label).join(", ");

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        response: `Analysis of ${selected.length} entities (${labels}): These entities are part of the system architecture and interact through defined edges. The selected components handle core functionality.`,
      }),
    });
  });

  // Panel prompt endpoint — deterministic mock responses
  await page.route("**/api/panel-prompt", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const mode = body.mode || "ask";
    const panelId = body.panel?.id || "unknown";
    const panelLabel = body.panel?.label || panelId;
    const panelKind = body.panel?.kind || "unknown";
    const promptText = body.prompt || "";
    const focusBlockIds = body.focus?.blockIds || [];
    const codeBlocks = body.context?.codeBlocks || [];

    if (mode === "edit" && focusBlockIds.length > 0) {
      const blockId = focusBlockIds[0];
      const block = codeBlocks.find((b: any) => b.id === blockId);
      const before = block?.content || "(no content)";
      const after = before + "\n// Added by panel prompt";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "code-edit",
          response: `Suggested edit for ${block?.symbol || blockId} in ${block?.path || "unknown file"}.`,
          edits: [{
            blockId,
            path: block?.path || "unknown",
            language: block?.language,
            symbol: block?.symbol,
            before,
            after,
          }],
        }),
      });
      return;
    }

    // XSS test case
    if (promptText.includes("script-test")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "answer",
          response: '<script>alert("xss")</script> This should render as text, not execute.',
        }),
      });
      return;
    }

    // Default ask response
    const scenarioCount = body.context?.scenarios?.length || 0;
    const codeBlockCount = codeBlocks.length;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "answer",
        response: `Analysis of ${panelKind} "${panelLabel}": This entity has ${codeBlockCount} code block(s) and ${scenarioCount} scenario(s). ${promptText}`,
      }),
    });
  });

  // Watcher CRUD mock — in-memory watch list
  const mockWatches: Array<{
    id: string;
    path: string;
    debounceMs: number;
    createdAt: string;
    lastEvent?: string;
  }> = [
    {
      id: "watch-1",
      path: "/home/user/projects/src",
      debounceMs: 500,
      createdAt: "2026-04-16T00:00:00Z",
    },
    {
      id: "watch-2",
      path: "/home/user/projects/config",
      debounceMs: 1000,
      createdAt: "2026-04-16T00:01:00Z",
      lastEvent: "2026-04-16T01:00:00Z",
    },
  ];

  await page.route("**/api/watch", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockWatches),
      });
      return;
    }

    if (method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      const path = body.path || "";
      if (!path) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "path is required" }),
        });
        return;
      }

      const duplicate = mockWatches.find((watch) => watch.path === path);
      if (duplicate) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Already watching this path",
            id: duplicate.id,
          }),
        });
        return;
      }

      const newEntry = {
        id: `watch-${Date.now()}`,
        path,
        debounceMs: body.debounceMs || 500,
        createdAt: new Date().toISOString(),
      };
      mockWatches.push(newEntry);

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(newEntry),
      });
      return;
    }

    await route.fallback();
  });

  await page.route("**/api/watch/*", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const id = url.pathname.split("/").pop() || "";
    const index = mockWatches.findIndex((watch) => watch.id === id);
    if (index === -1) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Watch not found" }),
      });
      return;
    }

    mockWatches.splice(index, 1);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ deleted: true }),
    });
  });

  await page.route("**/api/rebuild", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ buildId: "mock-build-1", status: "completed" }),
    });
  });

  // Static site pages for panel content — return template HTML for any entity
  await page.route("**/site/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/site/", "");
    const entityId = path.replace(".html", "").split("/").pop() || "unknown";
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<html><body><article><h1>${entityId}</h1><p>Detail content for ${entityId}.</p><ul><li>Type: entity</li><li>Status: active</li></ul></article></body></html>`,
    });
  });
}

export async function gotoDiagram(page: Page, path: string) {
  await setupMockApi(page);
  await page.goto(path);
  await page.locator(".graph-node").first().waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(4000);
}
