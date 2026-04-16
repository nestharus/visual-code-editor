import { expect, test, type Locator, type Page } from "@playwright/test";
import { gotoDiagram } from "./helpers";

function nodeByText(page: Page, kind: string, text: string): Locator {
  return page.locator(`.graph-node[data-kind='${kind}']`).filter({ hasText: text }).first();
}

test.describe("Graph Diffs", () => {
  test("diff toolbar toggle is visible when diff data exists", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await expect(page.locator('[data-toolbar="diff"]')).toBeVisible();
  });

  test("diff toggle starts inactive", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await expect(page.locator('[data-toolbar="diff"]')).toHaveAttribute("aria-checked", "false");
  });

  test("enabling diff mode adds data-diff-status to added node", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    await page.locator('[data-toolbar="diff"]').click();
    await page.waitForTimeout(200);

    const addedNode = nodeByText(page, "file-node", "replay-worker.ts");
    await expect(addedNode).toHaveAttribute("data-diff-status", "added");
  });

  test("enabling diff mode adds data-diff-status to removed node", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    await page.locator('[data-toolbar="diff"]').click();
    await page.waitForTimeout(200);

    const removedNode = nodeByText(page, "file-node", "dead-letter.ts");
    await expect(removedNode).toHaveAttribute("data-diff-status", "removed");
  });

  test("disabling diff mode removes data-diff-status", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    await page.locator('[data-toolbar="diff"]').click();
    await page.waitForTimeout(200);

    const addedNode = nodeByText(page, "file-node", "replay-worker.ts");
    await expect(addedNode).toHaveAttribute("data-diff-status", "added");

    await page.locator('[data-toolbar="diff"]').click();
    await expect(addedNode).not.toHaveAttribute("data-diff-status", /.*/);
  });

  test("removed ghost does not respond to click drill", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    await page.locator('[data-toolbar="diff"]').click();
    await page.waitForTimeout(200);

    const removedNode = nodeByText(page, "file-node", "dead-letter.ts");
    const beforeUrl = page.url();
    await removedNode.click({ force: true });
    await page.waitForTimeout(400);
    expect(page.url()).toBe(beforeUrl);
  });

  test("removed ghost does not select on ctrl+click", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    await page.locator('[data-toolbar="diff"]').click();
    await page.waitForTimeout(200);

    const removedNode = nodeByText(page, "file-node", "dead-letter.ts");
    await removedNode.click({ modifiers: ["Control"] });
    await expect(removedNode).not.toHaveClass(/is-selected/);
  });

  test("added node still responds to click", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    await page.locator('[data-toolbar="diff"]').click();
    await page.waitForTimeout(200);

    const addedNode = nodeByText(page, "file-node", "replay-worker.ts");
    await addedNode.click({ modifiers: ["Control"] });
    await expect(addedNode).toHaveClass(/is-selected/);
  });

  test("diff mode persists toggle state across session navigation", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await page.locator('[data-toolbar="diff"]').click();
    await expect(page.locator('[data-toolbar="diff"]')).toHaveAttribute("aria-checked", "true");

    await page.locator("[data-view-toggle='behavioral']").click();
    await page.waitForURL("**/behavioral");
    await expect(page.locator('[data-toolbar="diff"]')).toHaveAttribute("aria-checked", "true");
  });
});
