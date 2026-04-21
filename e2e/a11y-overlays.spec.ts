import { expect, test, type Locator, type Page } from "@playwright/test";

import { gotoDiagram } from "./helpers";

const FIND_SHORTCUT = process.platform === "darwin" ? "Meta+f" : "Control+f";
const MULTI_SELECT_MODIFIER = process.platform === "darwin" ? "Meta" : "Control";

function nodeByText(page: Page, kind: string, text: string): Locator {
  return page.locator(`.graph-node[data-kind='${kind}']`).filter({ hasText: text }).first();
}

async function openDetailPanel(page: Page, kind: string, text: string): Promise<Locator> {
  const node = nodeByText(page, kind, text);
  await expect(node).toBeVisible();
  await node.hover();
  await page.waitForTimeout(300);
  const infoButton = node.locator(".graph-node-info-btn");
  if (await infoButton.count()) {
    await infoButton.click({ force: true });
    await expect(page.locator(".detail-panel.is-open")).toBeVisible();
    return infoButton;
  } else {
    await node.click({ force: true });
    await expect(page.locator(".detail-panel.is-open")).toBeVisible();
    return node;
  }
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

  test("Detail panel focuses its title and returns focus to its opener", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    const opener = await openDetailPanel(page, "cluster", "Alpha");
    await expect(page.locator("#detail-panel-title")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.locator(".detail-panel.is-open")).not.toBeVisible();
    await expect(opener).toBeFocused();
  });

  test("Detail panel hides from a11y tree when closed", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    // Closed state: the <aside> is always mounted (so the slide-in
    // transform can animate), so it must be inert + aria-hidden to
    // avoid screen readers announcing an empty complementary region.
    const panel = page.locator("#detail-panel");
    await expect(panel).toHaveAttribute("aria-hidden", "true");
    await expect(panel).toHaveAttribute("inert", "");

    await openDetailPanel(page, "cluster", "Alpha");
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await expect(panel).not.toHaveAttribute("inert", /.*/);

    await page.keyboard.press("Escape");
    await expect(page.locator(".detail-panel.is-open")).not.toBeVisible();
    await expect(panel).toHaveAttribute("aria-hidden", "true");
    await expect(panel).toHaveAttribute("inert", "");
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

  test("skip link becomes visible on first Tab and focuses main on activation", async ({ page }) => {
    await page.goto("/behavioral");
    await page.locator("#diagram-viewport").waitFor({ state: "visible" });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#diagram-viewport")).toBeFocused();
  });

  test("shell landmarks and widgets have expected accessible names", async ({ page }) => {
    await page.goto("/behavioral");
    await expect(page.locator("nav#breadcrumb")).toHaveAttribute("aria-label", "Breadcrumb");
    await expect(page.locator(".view-toggle[role='tablist']")).toHaveAttribute(
      "aria-label",
      "Diagram view",
    );
    await expect(page.locator("#diagram-viewport")).toHaveAttribute("aria-label", "Diagram");
  });
});
