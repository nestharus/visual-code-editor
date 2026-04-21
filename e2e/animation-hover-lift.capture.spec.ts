import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { setupMockApi } from "./helpers";

const LOAD_WAIT = 4000;
const HOVER_SETTLE_WAIT = 600;
const CAPTURE_DIR = resolve(".tmp/animation-qa/captures");
const MEASUREMENTS_PATH = resolve(
  ".tmp/animation-qa/captures/hover-lift-measurements.json",
);

type BoxMeasurement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type GlowSample = {
  frame: number;
  elapsedMs: number;
  value: number;
};

async function readBoxY(node: Locator): Promise<BoxMeasurement> {
  const box = await node.boundingBox();
  if (!box) {
    throw new Error("Could not read node bounding box");
  }

  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  };
}

async function sampleGlowOpacity(
  page: Page,
  selector: string,
  frames: number,
  fallbackSelector?: string,
) {
  return page.evaluate(
    async ({ selector: innerSelector, frames: frameCount, fallbackSelector: fallbackInnerSelector }) => {
      const samples: GlowSample[] = [];
      const start = performance.now();

      for (let frame = 0; frame < frameCount; frame += 1) {
        await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
        const inner =
          document.querySelector<HTMLElement>(innerSelector) ??
          (fallbackInnerSelector
            ? document.querySelector<HTMLElement>(fallbackInnerSelector)
            : null);
        if (!inner) {
          throw new Error(`Could not find ${innerSelector}`);
        }
        const raw = inner.style.getPropertyValue("--node-glow-opacity").trim();
        const value = raw.length > 0 ? Number(raw) : Number.NaN;
        samples.push({
          frame,
          elapsedMs: performance.now() - start,
          value,
        });
      }

      return samples;
    },
    { selector, frames, fallbackSelector },
  );
}

test("captures hover-lift video and DOM measurements for Alpha", async ({
  browser,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (!baseURL) {
    throw new Error("Playwright baseURL is not configured");
  }

  await mkdir(CAPTURE_DIR, { recursive: true });

  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: CAPTURE_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();
  const video = page.video();
  if (!video) {
    throw new Error("Video recording is not available on this page");
  }

  await setupMockApi(page);
  await page.goto("/organizational");
  await page.locator(".graph-node").first().waitFor({ state: "visible" });
  await page.waitForTimeout(LOAD_WAIT);

  const node = page.locator('.graph-node:has(.graph-card[title="Alpha"])');
  await expect(node).toHaveCount(1);

  const inner = node.locator(".graph-node-inner");
  const before = await readBoxY(node);

  await node.hover();
  await expect(node).toHaveClass(/is-hovered/);
  await page.waitForTimeout(HOVER_SETTLE_WAIT);

  await page.screenshot({ path: 'hover_screenshot.png' });
  const afterHover = await readBoxY(node);
  const innerTransform = await inner.evaluate((element) =>
    window.getComputedStyle(element).transform,
  );
  const normalizedTransform = innerTransform.replace(/\s+/g, "");
  const hasScaleTransform =
    normalizedTransform !== "none" &&
    normalizedTransform !== "matrix(1,0,0,1,0,0)";

  await page.mouse.move(1910, 10, { steps: 10 });
  await expect(node).not.toHaveClass(/is-hovered/);
  await page.waitForTimeout(HOVER_SETTLE_WAIT);

  const afterSettle = await readBoxY(node);
  const hoverDeltaY = afterHover.y - before.y;
  const settleDeltaY = afterSettle.y - before.y;

  const measurements = {
    route: "/organizational",
    selector: '.graph-node:has(.graph-card[title="Alpha"])',
    before,
    afterHover,
    afterSettle,
    hoverDeltaY,
    settleDeltaY,
    innerTransform,
    hasScaleTransform,
  };

  console.log("Hover lift measurements:");
  console.log(JSON.stringify(measurements, null, 2));

  await writeFile(
    MEASUREMENTS_PATH,
    `${JSON.stringify(measurements, null, 2)}\n`,
    "utf8",
  );

  await context.close();

  const videoPath = await video.path();
  console.log(`Hover lift video saved to ${videoPath}`);
});

test("hover glow opacity springs down during hover-out", async ({ page }) => {
  await setupMockApi(page);
  await page.goto("/organizational");
  await page.locator(".graph-node").first().waitFor({ state: "visible" });
  await page.waitForTimeout(LOAD_WAIT);

  const node = page.locator('.graph-node:has(.graph-card--shape-rounded[title="Alpha"])');
  await expect(node).toHaveCount(1);

  await node.hover();
  await expect(node).toHaveClass(/is-hovered/);

  const hoverInSamples = await sampleGlowOpacity(
    page,
    '.graph-node.is-hovered > .graph-node-inner',
    5,
  );

  await page.waitForTimeout(300);
  await page.mouse.move(1910, 10, { steps: 1 });
  await expect(node).toHaveClass(/is-settling/);
  await page.waitForFunction(() =>
    Boolean(document.querySelector(".graph-node.is-settling > .graph-node-inner")),
  );

  const settleSamples = await sampleGlowOpacity(
    page,
    '.graph-node.is-settling:has(.graph-card--shape-rounded[title="Alpha"]) > .graph-node-inner',
    20,
    '.graph-node:has(.graph-card--shape-rounded[title="Alpha"]) > .graph-node-inner',
  );
  const settleValues = settleSamples.map((sample) => sample.value);
  const distinctValues = new Set(settleValues.map((value) => value.toFixed(3)));
  const epsilon = 0.01;
  const nonIncreasing = settleValues.every((value, index) => {
    if (index === 0) return true;
    return value <= settleValues[index - 1] + epsilon;
  });
  const finalValue = settleValues[settleValues.length - 1] ?? Number.NaN;

  console.log("Hover glow hover-in samples:");
  console.log(JSON.stringify(hoverInSamples, null, 2));
  console.log("Hover glow hover-out samples:");
  console.log(JSON.stringify({
    values: settleValues,
    distinctCount: distinctValues.size,
    nonIncreasing,
    finalValue,
  }, null, 2));

  expect(distinctValues.size).toBeGreaterThanOrEqual(5);
  expect(nonIncreasing).toBe(true);
  expect(finalValue).toBeLessThanOrEqual(0.01);
});
