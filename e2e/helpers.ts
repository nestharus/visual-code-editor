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

/**
 * Wait for cytoscape to have nodes rendered and animations to settle.
 * Optionally wait for a specific node ID to appear (useful after navigation).
 */
export async function waitForDiagram(
  page: Page,
  opts: { expectNodeId?: string } = {},
) {
  if (opts.expectNodeId) {
    await page.waitForFunction(
      (id: string) => {
        const cy = (window as any).__cy;
        return cy && cy.getElementById(id).length > 0;
      },
      opts.expectNodeId,
      { timeout: 15000 },
    );
  } else {
    await page.waitForFunction(
      () => {
        const cy = (window as any).__cy;
        return cy && cy.nodes().length > 0;
      },
      undefined,
      { timeout: 15000 },
    );
  }
  // Allow mermaid layout + animations to complete
  await page.waitForTimeout(2500);
}

/** Get rendered position of a node relative to the cy container. */
export async function getNodeRenderedPosition(page: Page, nodeId: string) {
  return page.evaluate((id: string) => {
    const cy = (window as any).__cy;
    if (!cy) return null;
    const node = cy.getElementById(id);
    if (!node || node.length === 0) return null;
    return node.renderedPosition();
  }, nodeId);
}

/** Get bounding box of the cy container on the page. */
export async function getContainerBox(page: Page) {
  return page.locator(".cy-container").boundingBox();
}

/** Click on a cytoscape node by its ID (programmatic tap for reliability). */
export async function clickCyNode(page: Page, nodeId: string) {
  await page.evaluate((id: string) => {
    const cy = (window as any).__cy;
    if (!cy) throw new Error("Cytoscape not initialized");
    const node = cy.getElementById(id);
    if (!node || node.length === 0) throw new Error(`Node "${id}" not found`);
    node.emit("tap");
  }, nodeId);
}

/** Hover over a cytoscape node by its ID. */
export async function hoverCyNode(page: Page, nodeId: string) {
  const pos = await getNodeRenderedPosition(page, nodeId);
  if (!pos) throw new Error(`Node "${nodeId}" not found in cytoscape`);
  const box = await getContainerBox(page);
  if (!box) throw new Error("Cytoscape container not found");
  await page.mouse.move(box.x + pos.x, box.y + pos.y);
}

/** Hover over a cytoscape edge by its ID (at midpoint). */
export async function hoverCyEdge(page: Page, edgeId: string) {
  const midpoint = await page.evaluate((id: string) => {
    const cy = (window as any).__cy;
    if (!cy) return null;
    const edge = cy.getElementById(id);
    if (!edge || edge.length === 0) return null;
    return edge.renderedMidpoint();
  }, edgeId);
  if (!midpoint) throw new Error(`Edge "${edgeId}" not found in cytoscape`);
  const box = await getContainerBox(page);
  if (!box) throw new Error("Cytoscape container not found");
  await page.mouse.move(box.x + midpoint.x, box.y + midpoint.y);
}

/** Move mouse away from any node/edge — two-step to ensure canvas mouseout. */
export async function moveMouseAway(page: Page) {
  const box = await page.locator(".cy-container").boundingBox();
  if (box) {
    // First move within canvas but away from nodes (bottom-right corner)
    await page.mouse.move(
      box.x + box.width - 5,
      box.y + box.height - 5,
      { steps: 5 },
    );
    await page.waitForTimeout(100);
  }
  // Then move outside the canvas entirely (with intermediate steps)
  await page.mouse.move(10, 10, { steps: 5 });
  await page.waitForTimeout(100);
}

/** Get current cytoscape state snapshot. */
export async function getCyState(page: Page) {
  return page.evaluate(() => {
    const cy = (window as any).__cy;
    if (!cy) return null;
    return {
      nodeCount: cy.nodes().length,
      edgeCount: cy.edges().length,
      nodeIds: cy.nodes().map((n: any) => n.id()) as string[],
      edgeIds: cy.edges().map((e: any) => e.id()) as string[],
      zoom: cy.zoom() as number,
    };
  });
}
