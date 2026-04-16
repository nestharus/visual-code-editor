import { expect, test, type Locator, type Page } from "@playwright/test";
import { gotoDiagram } from "./helpers";

function nodeByText(page: Page, kind: string, text: string): Locator {
  return page.locator(`.graph-node[data-kind='${kind}']`).filter({ hasText: text }).first();
}

test.describe("UI Exploration Diagram", () => {
  test("UI toggle button is visible in view toggle", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await expect(page.locator("[data-view-toggle='ui']")).toBeVisible();
  });

  test("clicking UI toggle navigates to /ui", async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await page.locator("[data-view-toggle='ui']").click();
    await page.waitForURL("**/ui");
  });

  test("UI root renders screens", async ({ page }) => {
    await gotoDiagram(page, "/ui");
    await expect(page.locator(".graph-node[data-kind='ui-screen']").first()).toBeVisible();
    expect(await page.locator(".graph-node[data-kind='ui-screen']").count()).toBeGreaterThanOrEqual(3);
  });

  test("clicking a ui-screen drills into it", async ({ page }) => {
    await gotoDiagram(page, "/ui");
    const screenNode = nodeByText(page, "ui-screen", "Organizational Overview");
    await expect(screenNode).toBeVisible();
    await screenNode.click({ force: true });
    await page.waitForURL("**/ui/screens/ui-screen-org");
  });

  test("screen view shows ui-component cards", async ({ page }) => {
    await gotoDiagram(page, "/ui/screens/ui-screen-org");
    await expect(page.locator(".graph-node[data-kind='ui-component']").first()).toBeVisible();
  });

  test("screen view shows ui-implements edges", async ({ page }) => {
    await gotoDiagram(page, "/ui/screens/ui-screen-org");
    expect(await page.locator(".edge-path[data-kind='ui-implements']").count()).toBeGreaterThan(0);
  });

  test("breadcrumbs show UI Exploration on /ui/screens/:id", async ({ page }) => {
    await gotoDiagram(page, "/ui/screens/ui-screen-org");
    await expect(page.locator(".breadcrumb-item").first()).toContainText("UI Exploration");
  });

  test("view toggle shows UI as active on /ui", async ({ page }) => {
    await gotoDiagram(page, "/ui");
    await expect(page.locator("[data-view-toggle='ui']")).toHaveClass(/is-active/);
    await expect(page.locator("[data-view-toggle='behavioral']")).not.toHaveClass(/is-active/);
  });

  test("organizational tab still works from /ui", async ({ page }) => {
    await gotoDiagram(page, "/ui");
    await page.locator("[data-view-toggle='organizational']").click();
    await page.waitForURL("**/organizational");
    await expect(page.locator(".graph-node[data-kind='cluster']").first()).toBeVisible();
  });
});
