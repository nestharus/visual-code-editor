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
