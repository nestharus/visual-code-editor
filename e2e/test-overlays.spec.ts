import { expect, test, type Locator, type Page } from "@playwright/test";
import { gotoDiagram } from "./helpers";

function nodeByText(page: Page, kind: string, text: string): Locator {
  return page.locator(`.graph-node[data-kind='${kind}']`).filter({ hasText: text }).first();
}

test.describe("Test Runner Overlays", () => {
  test("tests toolbar toggle is visible", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await expect(page.locator(".toolbar-tests-btn")).toBeVisible();
  });

  test("tests toggle starts active", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await expect(page.locator(".toolbar-tests-btn")).toHaveClass(/is-active/);
  });

  test("failing file node shows X badge", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    const failingNode = nodeByText(page, "file-node", "replay-worker.ts");
    await expect(failingNode.locator(".graph-node-test-badge--failed")).toBeVisible();
  });

  test("passing file node shows check badge", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    const passingNode = nodeByText(page, "file-node", "entry.ts");
    await expect(passingNode.locator(".graph-node-test-badge--passed")).toBeVisible();
  });

  test("covered node has coverage tint", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    const highCoverageNode = nodeByText(page, "file-node", "entry.ts");
    await expect(highCoverageNode).toHaveAttribute("data-test-coverage", "high");
  });

  test("low coverage node gets low bucket", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    const lowCoverageNode = nodeByText(page, "file-node", "replay-worker.ts");
    await expect(lowCoverageNode).toHaveAttribute("data-test-coverage", "low");
  });

  test("clicking toggle hides badges", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    await expect(page.locator(".graph-node-test-badge--failed").first()).toBeVisible();

    await page.locator(".toolbar-tests-btn").click();
    await expect(page.locator(".graph-node-test-badge")).toHaveCount(0);
  });

  test("toggle hides coverage attributes", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    const node = nodeByText(page, "file-node", "entry.ts");
    await expect(node).toHaveAttribute("data-test-coverage", "high");

    await page.locator(".toolbar-tests-btn").click();
    await expect(node).not.toHaveAttribute("data-test-coverage", /.*/);
  });

  test("plain click still drills down on failing card", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    const clusterNode = nodeByText(page, "cluster", "Alpha");
    await clusterNode.click({ force: true });
    await page.waitForURL("**/organizational/clusters/cluster-alpha");
  });

  test("ctrl+click still selects failing card", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    const failingNode = nodeByText(page, "file-node", "replay-worker.ts");
    await failingNode.click({ modifiers: ["Control"] });
    await expect(failingNode).toHaveClass(/is-selected/);
  });

  test("info button still works on nodes with badges", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    const failingNode = nodeByText(page, "file-node", "replay-worker.ts");
    await failingNode.hover();
    await page.waitForTimeout(300);
    await failingNode.click({ force: true });
    await expect(page.locator(".detail-panel.is-open")).toBeVisible();
  });
});
