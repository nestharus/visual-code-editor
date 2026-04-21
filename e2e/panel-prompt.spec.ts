import { expect, test, type Locator } from "@playwright/test";
import { gotoDiagram } from "./helpers";

function nodeByText(page: Parameters<typeof gotoDiagram>[0], kind: string, text: string): Locator {
  return page.locator(`.graph-node[data-kind='${kind}']`).filter({ hasText: text }).first();
}

async function openDetailPanel(page: Parameters<typeof gotoDiagram>[0], kind: string, text: string) {
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

test.describe("Panel Prompt", () => {
  test("panel prompt section visible when detail panel is open", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await openDetailPanel(page, "cluster", "Alpha");
    await expect(page.locator(".detail-prompt")).toBeVisible();
  });

  test("ask mode returns text response", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await openDetailPanel(page, "cluster", "Alpha");

    await page.locator(".detail-prompt-input").fill("Describe this entity");
    await page.locator(".detail-prompt-submit").click();
    await page.waitForTimeout(1000);

    await expect(page.locator(".detail-prompt-answer")).toBeVisible();
    await expect(page.locator(".detail-prompt-answer")).toContainText("Analysis of cluster");
  });

  test("XSS in response is escaped", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await openDetailPanel(page, "cluster", "Alpha");

    await page.locator(".detail-prompt-input").fill("script-test");
    await page.locator(".detail-prompt-submit").click();
    await page.waitForTimeout(1000);

    const answer = page.locator(".detail-prompt-answer");
    await expect(answer).toBeVisible();
    await expect(answer).toContainText("<script>");
    expect(await answer.locator("script").count()).toBe(0);
  });

  test("code block has Use in Prompt button", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    await openDetailPanel(page, "file-node", "entry.ts");

    await expect(page.locator(".detail-code-use-btn").first()).toBeVisible();
  });

  test("clicking Use in Prompt shows focus chip", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    await openDetailPanel(page, "file-node", "entry.ts");

    await page.locator(".detail-code-use-btn").first().click();
    await expect(page.locator(".detail-prompt-focus")).toBeVisible();
  });

  test("edit mode with focused block returns before/after", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    await openDetailPanel(page, "file-node", "entry.ts");

    await page.locator(".detail-code-use-btn").first().click();
    await page.locator(".detail-prompt-mode-btn").last().click();
    await page.locator(".detail-prompt-input").fill("Add error handling");
    await page.locator(".detail-prompt-submit").click();
    await page.waitForTimeout(1000);

    await expect(page.locator(".detail-prompt-edit-label.is-before")).toBeVisible();
    await expect(page.locator(".detail-prompt-edit-label.is-after")).toBeVisible();
  });

  test("closing panel resets prompt state", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await openDetailPanel(page, "cluster", "Alpha");

    await page.locator(".detail-prompt-input").fill("Some prompt text");
    await page.locator("#detail-panel-close").click();
    await page.waitForTimeout(500);

    await openDetailPanel(page, "cluster", "Alpha");
    await expect(page.locator(".detail-prompt-input")).toHaveValue("");
  });

  test("mode toggle switches between ask and edit", async ({ page }) => {
    await gotoDiagram(page, "/organizational/clusters/cluster-alpha/systems/system-a3");
    await openDetailPanel(page, "file-node", "entry.ts");

    const askBtn = page.locator(".detail-prompt-mode-btn").first();
    const editBtn = page.locator(".detail-prompt-mode-btn").last();

    await expect(askBtn).toHaveClass(/is-active/);

    await editBtn.click();
    await expect(editBtn).toHaveClass(/is-active/);
    await expect(askBtn).not.toHaveClass(/is-active/);
  });

  test("Ctrl+F still opens search when panel is open", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await openDetailPanel(page, "cluster", "Alpha");

    await page.keyboard.press("Control+f");
    await expect(page.locator(".search-overlay")).toBeVisible();
  });
});
