import { expect, test, type Locator, type Page } from "@playwright/test";

import { gotoDiagram } from "./helpers";

const FIND_SHORTCUT = process.platform === "darwin" ? "Meta+f" : "Control+f";
const MULTI_SELECT_MODIFIER = process.platform === "darwin" ? "Meta" : "Control";

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

async function openShadowbox(page: Page) {
  await openDetailPanel(page, "cluster", "Alpha");
  const playButton = page.locator(".detail-behavior-play").first();
  await expect(playButton).toBeVisible();
  await playButton.click();
  await expect(page.locator(".shadowbox-modal-shell")).toBeVisible();
}

test.describe("Overlay Accessibility", () => {
  test("Watcher panel focuses path input and restores focus to Live button", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    const watcherButton = page.locator('[data-toolbar="watcher"]');
    await watcherButton.click();

    await expect(page.locator("#watcher-path-input")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#watcher-panel")).not.toBeVisible();
    await expect(watcherButton).toBeFocused();
  });

  test("Prompt dock traps Tab and restores focus to the Prompt button", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    await nodeByText(page, "cluster", "Alpha").click({ modifiers: [MULTI_SELECT_MODIFIER] });
    await nodeByText(page, "cluster", "Beta").click({ modifiers: [MULTI_SELECT_MODIFIER] });

    const promptButton = page.locator('[data-toolbar="prompt"]');
    await promptButton.click();

    const dock = page.locator(".prompt-dock");
    await expect(dock).toBeVisible();
    await expect(page.locator("#prompt-dock-input")).toBeFocused();
    await page.locator("#prompt-dock-input").fill("Summarize the selected entities");

    const focusOrder = [
      page.locator(".prompt-dock-submit"),
      page.locator(".prompt-dock-close"),
      page.locator(".prompt-dock-clear"),
      page.locator(".prompt-dock-chip").nth(0),
      page.locator(".prompt-dock-chip").nth(1),
      page.locator("#prompt-dock-input"),
    ];

    for (const target of focusOrder) {
      await page.keyboard.press("Tab");
      await expect(target).toBeFocused();
    }

    await page.keyboard.press("Escape");
    await expect(dock).not.toBeVisible();
    await expect(promptButton).toBeFocused();
  });

  test("Detail panel focuses its title and returns focus to the viewport", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    await openDetailPanel(page, "cluster", "Alpha");
    await expect(page.locator("#detail-panel-title")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.locator(".detail-panel.is-open")).not.toBeVisible();
    await expect(page.locator("#diagram-viewport")).toBeFocused();
  });

  test("Shadowbox modal traps focus, closes on Escape, and returns focus to the viewport", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    await openShadowbox(page);
    const shell = page.locator(".shadowbox-modal-shell");
    await expect(shell).toBeFocused();

    const playButton = page.locator(".shadowbox-modal-controls .playback-btn").nth(0);
    const stepButton = page.locator(".shadowbox-modal-controls .playback-btn").nth(1);
    const speedSelect = page.locator(".shadowbox-modal-controls .playback-speed");

    await page.keyboard.press("Tab");
    await expect(playButton).toBeFocused();
    await page.keyboard.press("Space");
    await expect(stepButton).toBeEnabled();

    await page.keyboard.press("Tab");
    await expect(stepButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(speedSelect).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(playButton).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(shell).not.toBeVisible();
    await expect(page.locator("#diagram-viewport")).toBeFocused();
  });

  test("Stacked overlays close topmost first", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    await page.locator('[data-toolbar="watcher"]').click();
    await expect(page.locator("#watcher-panel")).toBeVisible();

    await page.locator('[data-toolbar="search"]').click();
    await expect(page.locator(".search-overlay")).toBeVisible();
    await expect(page.locator("#watcher-panel")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".search-overlay")).not.toBeVisible();
    await expect(page.locator("#watcher-panel")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("#watcher-panel")).not.toBeVisible();
  });

  test("Ctrl/Cmd+F is suppressed while Shadowbox is open", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    await openShadowbox(page);
    await page.keyboard.press(FIND_SHORTCUT);

    await expect(page.locator(".search-overlay")).not.toBeVisible();
    await expect(page.locator(".shadowbox-modal-shell")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".shadowbox-modal-shell")).not.toBeVisible();
  });
});
