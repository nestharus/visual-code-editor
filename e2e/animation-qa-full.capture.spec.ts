/**
 * Full QA capture suite — records videos of all major interactions
 * for Gemini-based animation analysis.
 *
 * Run: npx playwright test e2e/animation-qa-full.capture.spec.ts
 * Requires: npm run serve (port 8742)
 */
import { mkdir } from "fs/promises";
import { resolve } from "path";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const LOAD_WAIT = 4000;
const CAPTURE_DIR = resolve(".tmp/animation-qa/captures");

async function createRecordingContext(
  browser: import("@playwright/test").Browser,
  baseURL: string,
  name: string,
): Promise<{ context: BrowserContext; page: Page; videoDir: string }> {
  const videoDir = resolve(CAPTURE_DIR, name);
  await mkdir(videoDir, { recursive: true });
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: videoDir, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  return { context, page, videoDir };
}

test.describe("QA Captures", () => {
  test("01 — organizational view overview", async ({ browser }, testInfo) => {
    const { context, page } = await createRecordingContext(
      browser,
      testInfo.project.use.baseURL!,
      "01-org-overview",
    );
    await page.goto("/organizational");
    await page.locator(".graph-node").first().waitFor({ state: "visible" });
    await page.waitForTimeout(LOAD_WAIT);

    // Pan around slowly to show the full graph
    await page.mouse.move(960, 540);
    await page.waitForTimeout(1000);

    // Hover over several nodes to show emphasis/dimming
    const nodes = page.locator(".graph-node:not(.is-compound)");
    const count = await nodes.count();
    for (let i = 0; i < Math.min(count, 4); i++) {
      await nodes.nth(i).hover();
      await page.waitForTimeout(800);
    }

    // Move away to reset
    await page.mouse.move(1910, 10, { steps: 10 });
    await page.waitForTimeout(500);

    await context.close();
  });

  test("02 — behavioral view overview", async ({ browser }, testInfo) => {
    const { context, page } = await createRecordingContext(
      browser,
      testInfo.project.use.baseURL!,
      "02-behavioral-overview",
    );
    await page.goto("/behavioral");
    await page.locator(".graph-node").first().waitFor({ state: "visible" });
    await page.waitForTimeout(LOAD_WAIT);

    // Hover over nodes
    const nodes = page.locator(".graph-node:not(.is-compound)");
    const count = await nodes.count();
    for (let i = 0; i < Math.min(count, 4); i++) {
      await nodes.nth(i).hover();
      await page.waitForTimeout(800);
    }

    await page.mouse.move(1910, 10, { steps: 10 });
    await page.waitForTimeout(500);

    await context.close();
  });

  test("03 — hover lift + edge follow", async ({ browser }, testInfo) => {
    const { context, page } = await createRecordingContext(
      browser,
      testInfo.project.use.baseURL!,
      "03-hover-lift",
    );
    await page.goto("/organizational");
    await page.locator(".graph-node").first().waitFor({ state: "visible" });
    await page.waitForTimeout(LOAD_WAIT);

    // Hover multiple nodes slowly, focusing on edge connection points
    const nodes = page.locator(".graph-node:not(.is-compound)");
    const count = await nodes.count();
    for (let i = 0; i < Math.min(count, 3); i++) {
      await nodes.nth(i).hover();
      await page.waitForTimeout(1200);
      await page.mouse.move(1910, 10, { steps: 10 });
      await page.waitForTimeout(600);
    }

    await context.close();
  });

  test("04 — edge hover + labels", async ({ browser }, testInfo) => {
    const { context, page } = await createRecordingContext(
      browser,
      testInfo.project.use.baseURL!,
      "04-edge-hover",
    );
    await page.goto("/organizational");
    await page.locator(".graph-node").first().waitFor({ state: "visible" });
    await page.waitForTimeout(LOAD_WAIT);

    // Hover edge hit targets
    const hitTargets = page.locator(".overlay-layer .edge-hit-target");
    const hitCount = await hitTargets.count();
    for (let i = 0; i < Math.min(hitCount, 4); i++) {
      await hitTargets.nth(i).hover({ force: true });
      await page.waitForTimeout(800);
    }

    await page.mouse.move(1910, 10, { steps: 10 });
    await page.waitForTimeout(500);

    await context.close();
  });

  test("05 — drill-down into cluster", async ({ browser }, testInfo) => {
    const { context, page } = await createRecordingContext(
      browser,
      testInfo.project.use.baseURL!,
      "05-drill-down",
    );
    await page.goto("/organizational");
    await page.locator(".graph-node").first().waitFor({ state: "visible" });
    await page.waitForTimeout(LOAD_WAIT);

    // Click a cluster to drill down
    const cluster = page.locator(".graph-node[data-kind='cluster']").first();
    if ((await cluster.count()) > 0) {
      await cluster.click();
      await page.waitForTimeout(3000); // Wait for drill transition

      // Hover nodes in the drilled view
      const innerNodes = page.locator(".graph-node:not(.is-compound)");
      await innerNodes.first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);

      const innerCount = await innerNodes.count();
      for (let i = 0; i < Math.min(innerCount, 3); i++) {
        await innerNodes.nth(i).hover();
        await page.waitForTimeout(600);
      }

      // Navigate back via breadcrumb
      const breadcrumbLink = page.locator(".breadcrumb-bar a").first();
      if ((await breadcrumbLink.count()) > 0) {
        await breadcrumbLink.click();
        await page.waitForTimeout(3000);
      }
    }

    await context.close();
  });

  test("06 — detail panel open/close", async ({ browser }, testInfo) => {
    const { context, page } = await createRecordingContext(
      browser,
      testInfo.project.use.baseURL!,
      "06-detail-panel",
    );
    await page.goto("/organizational");
    await page.locator(".graph-node").first().waitFor({ state: "visible" });
    await page.waitForTimeout(LOAD_WAIT);

    // Hover to show info button, click it
    const cluster = page.locator(".graph-node[data-kind='cluster']").first();
    if ((await cluster.count()) > 0) {
      await cluster.hover();
      await page.waitForTimeout(400);

      const infoBtn = cluster.locator(".graph-node-info-btn");
      if ((await infoBtn.count()) > 0) {
        await infoBtn.click();
        await page.waitForTimeout(1500);

        // Scroll the panel
        const panel = page.locator(".detail-panel");
        await panel.evaluate((el) => el.scrollBy(0, 200));
        await page.waitForTimeout(800);
        await panel.evaluate((el) => el.scrollBy(0, -200));
        await page.waitForTimeout(500);
      }
    }

    await context.close();
  });

  test("07 — shadowbox modal playback", async ({ browser }, testInfo) => {
    const { context, page } = await createRecordingContext(
      browser,
      testInfo.project.use.baseURL!,
      "07-shadowbox",
    );
    await page.goto("/organizational");
    await page.locator(".graph-node").first().waitFor({ state: "visible" });
    await page.waitForTimeout(LOAD_WAIT);

    // Find a cluster with behavior indicator and open its panel
    const clusterWithBehavior = page
      .locator(
        ".graph-node[data-kind='cluster']:has(.graph-node-behavior-indicator)",
      )
      .first();
    if ((await clusterWithBehavior.count()) > 0) {
      await clusterWithBehavior.hover();
      await page.waitForTimeout(400);
      await clusterWithBehavior.locator(".graph-node-info-btn").click();
      await page.waitForTimeout(1000);

      // Click play button to launch shadowbox
      const playBtn = page.locator(".detail-behavior-play").first();
      if ((await playBtn.count()) > 0) {
        await playBtn.click();
        await page.waitForTimeout(2000);

        // Let the animation play for a while
        await page.waitForTimeout(5000);

        // Try pause
        const pauseBtn = page.locator(".shadowbox-modal-controls button").first();
        if ((await pauseBtn.count()) > 0) {
          await pauseBtn.click();
          await page.waitForTimeout(1000);

          // Resume
          await pauseBtn.click();
          await page.waitForTimeout(3000);
        }

        // Close modal
        const backdrop = page.locator(".shadowbox-modal-backdrop");
        await backdrop.click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(1000);
      }
    }

    await context.close();
  });

  test("08 — view toggle behavioral/organizational", async ({
    browser,
  }, testInfo) => {
    const { context, page } = await createRecordingContext(
      browser,
      testInfo.project.use.baseURL!,
      "08-view-toggle",
    );
    await page.goto("/organizational");
    await page.locator(".graph-node").first().waitFor({ state: "visible" });
    await page.waitForTimeout(LOAD_WAIT);

    // Toggle to behavioral
    const behavioralBtn = page.locator(
      '.view-toggle-btn:has-text("Behavioral")',
    );
    if ((await behavioralBtn.count()) > 0) {
      await behavioralBtn.click();
      await page.waitForTimeout(3000);

      // Hover some nodes
      const nodes = page.locator(".graph-node:not(.is-compound)");
      await nodes.first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);

      // Toggle back to organizational
      const orgBtn = page.locator('.view-toggle-btn:has-text("Organizational")');
      if ((await orgBtn.count()) > 0) {
        await orgBtn.click();
        await page.waitForTimeout(3000);
      }
    }

    await context.close();
  });

  test("09 — node entry animations on load", async ({ browser }, testInfo) => {
    const { context, page } = await createRecordingContext(
      browser,
      testInfo.project.use.baseURL!,
      "09-entry-animations",
    );

    // Navigate directly — capture the initial render and entry animations
    await page.goto("/organizational");
    // Don't wait long — we want to capture the entry animation
    await page.waitForTimeout(6000);

    await context.close();
  });

  test("10 — floating idle animation", async ({ browser }, testInfo) => {
    const { context, page } = await createRecordingContext(
      browser,
      testInfo.project.use.baseURL!,
      "10-float-idle",
    );
    await page.goto("/organizational");
    await page.locator(".graph-node").first().waitFor({ state: "visible" });
    await page.waitForTimeout(LOAD_WAIT);

    // Just sit and watch the floating animation for several seconds
    await page.waitForTimeout(6000);

    await context.close();
  });
});
