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
