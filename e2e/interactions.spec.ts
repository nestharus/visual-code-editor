import { expect, test, type Locator, type Page } from "@playwright/test";

import { gotoDiagram, setupMockApi } from "./helpers";

const LOAD_WAIT = 4000;

async function waitForDiagram(page: Page) {
  await page.locator(".graph-node").first().waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(LOAD_WAIT);
}

function nodeByText(page: Page, kind: string, text: string): Locator {
  return page.locator(`.graph-node[data-kind='${kind}']`).filter({ hasText: text }).first();
}

async function openDetailPanel(page: Page, kind: string, text: string) {
  const node = nodeByText(page, kind, text);
  await expect(node).toBeVisible();
  await node.hover();
  await page.waitForTimeout(300);
  const infoButton = node.locator(".graph-node-info-btn");
  if (await infoButton.count()) {
    await infoButton.click({ force: true });
  } else {
    await node.click({ force: true });
  }
  await expect(page.locator(".detail-panel.is-open")).toBeVisible();
}

test.describe("Graph Surface Interactions", () => {
  test("renders organizational root with card shapes", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    const nodes = page.locator(".graph-node");
    expect(await nodes.count()).toBeGreaterThan(0);
    expect(await page.locator(".graph-card--shape-circle").count()).toBeGreaterThan(0);
  });

  test("behavior indicator visible on cards with scenarios", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    const indicators = page.locator(".graph-node-behavior-indicator");
    const count = await indicators.count();
    if (count === 0) {
      test.skip();
      return;
    }

    await expect(indicators.first()).toBeVisible();
  });

  test("info button appears on hover for navigable cards", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    const clusterNode = page.locator(".graph-node[data-kind='cluster']").first();
    await expect(clusterNode).toBeVisible();
    await clusterNode.hover();
    await page.waitForTimeout(300);
    await expect(clusterNode.locator(".graph-node-info-btn")).toBeVisible();
  });

  test("clicking info button opens detail panel", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await openDetailPanel(page, "cluster", "Alpha");
  });

  test("detail panel shows behaviors section for cards with scenarios", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await openDetailPanel(page, "cluster", "Alpha");

    await expect(page.locator(".detail-behaviors")).toBeVisible();
    expect(await page.locator(".detail-behavior-play").count()).toBeGreaterThan(0);
  });

  test("clicking play button in panel activates shadowbox", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await openDetailPanel(page, "cluster", "Alpha");

    const playBtn = page.locator(".detail-behavior-play").first();
    await expect(playBtn).toBeVisible();
    await playBtn.click();
    await page.waitForTimeout(1000);

    const backdrop = page.locator(".shadowbox-modal-backdrop");
    await expect(backdrop).toBeVisible();
    await expect(page.locator(".scenario-box")).toBeVisible();
    await expect(page.locator(".shadowbox-modal-caption")).toBeVisible();
    await expect(page.locator(".shadowbox-modal-controls")).toBeVisible();

    await backdrop.click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(500);
    await expect(backdrop).not.toBeVisible();
  });

  test("hovering a node dims unconnected nodes", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    const externalNode = nodeByText(page, "external", "External API");
    await externalNode.hover();
    await page.waitForTimeout(500);

    await expect(externalNode).not.toHaveClass(/dimmed/);
    expect(await page.locator(".graph-node.dimmed").count()).toBeGreaterThan(0);
  });

  test("highlighted edges render in overlay (above nodes)", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    const clusterNode = page.locator(".graph-node[data-kind='cluster']").first();
    await clusterNode.hover();
    await page.waitForTimeout(500);

    expect(await page.locator(".overlay-layer .graph-edge.highlighted").count()).toBeGreaterThan(0);
  });

  test("highlighted edges show labels in overlay", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    const clusterNode = nodeByText(page, "cluster", "Alpha");
    await clusterNode.hover();
    await page.waitForTimeout(500);

    expect(await page.locator(".overlay-layer .edge-label text").count()).toBeGreaterThan(0);
  });

  test("node hover lifts card and edges follow", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    const node = page.locator(".graph-node:not(.is-compound)").first();
    const beforeBox = await node.boundingBox();
    await node.hover();
    await page.waitForTimeout(600);
    const afterBox = await node.boundingBox();

    if (beforeBox && afterBox) {
      expect(afterBox.y).toBeLessThan(beforeBox.y);
    }
  });

  test("clicking cluster card drills down", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    const clusterNode = nodeByText(page, "cluster", "Alpha");
    await clusterNode.click({ force: true });
    await page.waitForURL("**/organizational/clusters/cluster-alpha");
    await waitForDiagram(page);

    await expect(page.locator(".breadcrumb-bar")).toBeVisible();
  });
});

test.describe("CTRL+F Search", () => {
  test("Ctrl+F opens search overlay", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await page.keyboard.press("Control+f");
    await expect(page.locator(".search-overlay")).toBeVisible();
  });

  test("search returns matching nodes", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await page.keyboard.press("Control+f");
    await page.locator(".search-overlay-input").fill("Alpha");
    await page.locator(".search-overlay-btn").first().click();

    await expect(page.locator(".search-overlay-count")).toBeVisible();
    await expect(page.locator(".graph-node")).toHaveCount(1);
  });

  test("clear search restores original graph", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    const originalCount = await page.locator(".graph-node").count();

    await page.keyboard.press("Control+f");
    await page.locator(".search-overlay-input").fill("Alpha");
    await page.locator(".search-overlay-btn").first().click();
    await expect(page.locator(".graph-node")).toHaveCount(1);

    await page.locator(".search-overlay-clear").click();
    await expect(page.locator(".graph-node")).toHaveCount(originalCount);
  });

  test("Escape closes search overlay", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await page.keyboard.press("Control+f");
    await expect(page.locator(".search-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".search-overlay")).not.toBeVisible();
  });
});

test.describe("Behavioral View", () => {
  test("behavioral root renders lifecycle cards", async ({ page }) => {
    await gotoDiagram(page, "/behavioral");

    expect(await page.locator(".graph-node").count()).toBeGreaterThan(0);
  });

  test("lifecycle cards have play indicators", async ({ page }) => {
    await gotoDiagram(page, "/behavioral");

    const indicators = page.locator(".graph-node-behavior-indicator");
    expect(await indicators.count()).toBeGreaterThan(0);
  });
});

test.describe("Code Rendering in Panel", () => {
  test("file node panel shows code block", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    await openDetailPanel(page, "file-node", "entry.ts");

    const codeSection = page.locator(".detail-code");
    await expect(codeSection).toBeVisible();

    const codeBlock = codeSection.locator(".detail-code-block");
    await expect(codeBlock).toHaveCount(1);

    await expect(codeSection.locator(".detail-code-path")).toHaveText("src/runtime/entry.ts");
    await expect(codeSection.locator(".detail-code-symbol")).toHaveText("bootstrapReplay");
    await expect(codeSection.locator("pre code")).toContainText("bootstrapReplay");
  });

  test("agent node panel shows code block", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    await openDetailPanel(page, "agent-node", "replay-agent");

    await expect(page.locator(".detail-code")).toBeVisible();
    await expect(page.locator(".detail-code-path")).toHaveText("agents/replay-agent.md");
  });

  test("node without code shows no code section", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await openDetailPanel(page, "cluster", "Alpha");

    await expect(page.locator(".detail-code")).not.toBeVisible();
  });
});

test.describe("Synthetic Data Expansion", () => {
  test("renders all five supported node shapes", async ({ page }) => {
    await setupMockApi(page);

    await page.goto("/organizational");
    await waitForDiagram(page);

    await expect(page.locator(".graph-node[data-kind='cluster'] .graph-card--shape-rounded").first()).toBeVisible();
    await expect(page.locator(".graph-node[data-kind='store'] .graph-card--shape-circle").first()).toBeVisible();
    await expect(page.locator(".graph-node[data-kind='agent-node'] .graph-card--shape-hexagon").first()).toBeVisible();
    await expect(page.locator(".graph-node[data-kind='external'] .graph-card--shape-octagon").first()).toBeVisible();

    await page.goto("/behavioral/lifecycles/lifecycle-build");
    await waitForDiagram(page);

    await expect(page.locator(".graph-node[data-kind='behavioral-stage'] .graph-card--shape-pill").first()).toBeVisible();
  });

  test("system node uses borderColor as accent", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha");

    const card = nodeByText(page, "system", "Telemetry & Replay").locator(".graph-card");
    const borderColor = await card.evaluate((el) => getComputedStyle(el).borderColor);
    expect(borderColor).toBe("rgb(229, 83, 75)");
  });

  test("detail panel shows multiple scenarios", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await openDetailPanel(page, "cluster", "Alpha");

    await expect(page.locator(".detail-behavior-item")).toHaveCount(2);
  });

  test("disconnected node dims all peers on hover", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    const externalNode = nodeByText(page, "external", "External API");
    await externalNode.hover();
    await page.waitForTimeout(500);

    await expect(externalNode).not.toHaveClass(/dimmed/);
    expect(await page.locator(".graph-node.dimmed").count()).toBeGreaterThan(0);
  });

  test("compound module groups render nested children", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");

    await expect(page.locator(".graph-node.is-compound[data-kind='module-group']")).toHaveCount(2);
    await expect(page.locator(".graph-node[data-kind='file-node']")).toHaveCount(7);
    await expect(page.locator(".graph-node[data-kind='agent-node']")).toHaveCount(1);
  });

  test("behavioral back-edge renders amber dashed", async ({ page }) => {
    await gotoDiagram(page, "/behavioral/lifecycles/lifecycle-build");

    const backEdge = page.locator(".edge-path[data-kind='behavioral-back-edge']").first();
    await expect(backEdge).toBeVisible();

    const style = await backEdge.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        stroke: computed.stroke,
        strokeDasharray: computed.strokeDasharray,
      };
    });

    expect(style.stroke).toBe("rgb(210, 153, 34)");
    expect(style.strokeDasharray).toContain("6");
    expect(style.strokeDasharray).toContain("4");
  });

  test("unlabeled back-edge produces no overlay label on hover", async ({ page }) => {
    await gotoDiagram(page, "/behavioral/lifecycles/lifecycle-build/stages/stage-implement");

    const hitTargets = page.locator(".overlay-layer .edge-hit-target");
    await expect(hitTargets).toHaveCount(3);

    await hitTargets.last().hover({ force: true });
    await page.waitForTimeout(500);

    await expect(page.locator(".overlay-layer .edge-label text")).toHaveCount(0);
  });

  test("breadcrumb shows three levels at max depth", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");

    await expect(page.locator(".breadcrumb-item")).toHaveCount(2);
    await expect(page.locator(".breadcrumb-item").nth(0)).toHaveText("Organizational");
    await expect(page.locator(".breadcrumb-item").nth(1)).toHaveText("Alpha");
    await expect(page.locator(".breadcrumb-current")).toHaveText("Telemetry & Replay");
  });

  test("view toggle switches between organizational and behavioral", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    await page.locator("[data-view-toggle='behavioral']").click();
    await page.waitForURL("**/behavioral");
    await waitForDiagram(page);
    await expect(nodeByText(page, "behavioral-lifecycle", "Build")).toBeVisible();

    await page.locator("[data-view-toggle='organizational']").click();
    await page.waitForURL("**/organizational");
    await waitForDiagram(page);
    await expect(nodeByText(page, "cluster", "Alpha")).toBeVisible();
  });

  test("long label node is visible and queryable", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");

    await expect(
      page.getByText("event_reconciliation_and_replay_normalizer.ts", { exact: true }),
    ).toBeVisible();
  });

  test("edge colors match per kind", async ({ page }) => {
    await setupMockApi(page);

    await page.goto("/organizational");
    await waitForDiagram(page);

    const storeEdgeColor = await page.locator(".edge-path[data-kind='store-edge']").first().evaluate((el) => {
      return getComputedStyle(el).stroke;
    });
    expect(storeEdgeColor).toBe("rgb(210, 153, 34)");

    await nodeByText(page, "cluster", "Alpha").click({ force: true });
    await page.waitForURL("**/organizational/clusters/cluster-alpha");
    await waitForDiagram(page);

    await nodeByText(page, "system", "Telemetry & Replay").click({ force: true });
    await page.waitForURL("**/organizational/clusters/cluster-alpha/systems/system-a3");
    await waitForDiagram(page);

    const agentEdgeColor = await page.locator(".edge-path[data-kind='agent-invoke']").first().evaluate((el) => {
      return getComputedStyle(el).stroke;
    });
    expect(agentEdgeColor).toBe("rgb(157, 123, 238)");
  });
});
