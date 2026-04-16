import { expect, test } from "@playwright/test";
import { gotoDiagram } from "./helpers";

test.describe("Live Watcher UI", () => {
  test("watcher status indicator is visible in toolbar", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await expect(page.locator(".toolbar-watcher-btn")).toBeVisible();
  });

  test("watcher shows disconnected when SSE is aborted", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await expect(page.locator(".toolbar-watcher-btn")).toHaveClass(/is-disconnected/);
  });

  test("clicking watcher button opens panel", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await page.locator(".toolbar-watcher-btn").click();
    await expect(page.locator(".watcher-panel")).toBeVisible();
  });

  test("watcher panel shows fixture watches", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await page.locator(".toolbar-watcher-btn").click();
    await page.waitForTimeout(500);

    await expect(page.locator(".watcher-entry")).toHaveCount(2);
    await expect(page.locator(".watcher-entry-path").first()).toContainText(
      "/home/user/projects/src",
    );
  });

  test("adding a watch updates the list", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await page.locator(".toolbar-watcher-btn").click();
    await page.waitForTimeout(500);

    await page.locator(".watcher-add-input").fill("/home/user/projects/tests");
    await page.locator(".watcher-add-btn").click();
    await page.waitForTimeout(500);

    await expect(page.locator(".watcher-entry")).toHaveCount(3);
  });

  test("removing a watch updates the list", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await page.locator(".toolbar-watcher-btn").click();
    await page.waitForTimeout(500);

    await page.locator(".watcher-entry-remove").first().click();
    await page.waitForTimeout(500);

    await expect(page.locator(".watcher-entry")).toHaveCount(1);
  });

  test("close button closes watcher panel", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await page.locator(".toolbar-watcher-btn").click();
    await expect(page.locator(".watcher-panel")).toBeVisible();

    await page.locator(".watcher-panel-close").click();
    await expect(page.locator(".watcher-panel")).not.toBeVisible();
  });

  test("regenerate button triggers rebuild", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await page.locator(".toolbar-watcher-btn").click();
    await page.waitForTimeout(500);

    const rebuildButton = page.locator(".watcher-rebuild-btn");
    await expect(rebuildButton).toBeVisible();
    await rebuildButton.click();
    await page.waitForTimeout(500);
  });
});
