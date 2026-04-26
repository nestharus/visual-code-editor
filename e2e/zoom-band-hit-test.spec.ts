import { expect, test, type Locator, type Page } from "@playwright/test";

import { gotoDiagram } from "./helpers";

type ZoomBand = "overview" | "structure" | "detail" | "inspect" | "source";

const GRAPH_ROOT_SELECTOR = ".graph-surface-root[data-zoom-band]";
const EDGE_HIT_TARGET_SELECTOR = ".overlay-layer .edge-hit-target";
const HIGHLIGHTED_EDGE_SELECTOR = ".overlay-layer .graph-edge.highlighted";
const MOUSE_PARK_X = 1910;
const MOUSE_PARK_Y = 10;

type Point = { x: number; y: number };

function graphRoot(page: Page): Locator {
  return page.locator(GRAPH_ROOT_SELECTOR).first();
}

async function setZoomBand(page: Page, band: ZoomBand) {
  await page.evaluate(
    ({ rootSelector, nextBand }) => {
      const root = document.querySelector(rootSelector);
      if (!root) throw new Error(`Missing graph root ${rootSelector}`);
      root.setAttribute("data-zoom-band", nextBand);
    },
    { rootSelector: GRAPH_ROOT_SELECTOR, nextBand: band },
  );

  await expect(graphRoot(page)).toHaveAttribute("data-zoom-band", band);
}

async function edgeHitTargetStrokeWidth(page: Page): Promise<string> {
  return page.evaluate((selector) => {
    const edgeHitTarget = document.querySelector(selector);
    if (!edgeHitTarget) throw new Error(`Missing edge hit target ${selector}`);
    return getComputedStyle(edgeHitTarget).strokeWidth;
  }, EDGE_HIT_TARGET_SELECTOR);
}

async function firstEdgeHitTarget(page: Page): Promise<Locator> {
  const hitTarget = page.locator(EDGE_HIT_TARGET_SELECTOR).first();
  await expect(hitTarget).toBeAttached();
  return hitTarget;
}

async function edgeHitTargetHoverPoints(page: Page): Promise<Point[]> {
  return page.evaluate((selector) => {
    return Array.from(document.querySelectorAll(selector)).flatMap((element) => {
      const path = element as SVGPathElement;
      const ctm = path.getScreenCTM();
      if (!ctm) return [];

      const length = path.getTotalLength();
      return [0.25, 0.5, 0.75].map((ratio) => {
        const point = path.getPointAtLength(length * ratio);
        const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(ctm);
        return { x: screenPoint.x, y: screenPoint.y };
      });
    });
  }, EDGE_HIT_TARGET_SELECTOR);
}

async function hoverAnyEdgeHitTarget(page: Page) {
  const hoverPoints = await edgeHitTargetHoverPoints(page);
  expect(hoverPoints.length).toBeGreaterThan(0);

  for (const point of hoverPoints) {
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(100);
    if ((await page.locator(HIGHLIGHTED_EDGE_SELECTOR).count()) > 0) return;
  }
}

async function clearEdgeHover(page: Page) {
  await page.mouse.move(MOUSE_PARK_X, MOUSE_PARK_Y, { steps: 10 });
  await expect(page.locator(HIGHLIGHTED_EDGE_SELECTOR)).toHaveCount(0);
}

test.describe("zoom-band hit-test precision", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await expect(graphRoot(page)).toBeAttached();
    await firstEdgeHitTarget(page);
  });

  test("OVERVIEW band has 12px edge hit-target stroke", async ({ page }) => {
    await setZoomBand(page, "overview");

    await expect(edgeHitTargetStrokeWidth(page)).resolves.toBe("12px");
  });

  test("DETAIL band has 8px edge hit-target stroke by default", async ({ page }) => {
    await expect(graphRoot(page)).toHaveAttribute("data-zoom-band", "detail");

    await expect(edgeHitTargetStrokeWidth(page)).resolves.toBe("8px");
  });

  test("SOURCE band has 4px edge hit-target stroke", async ({ page }) => {
    await setZoomBand(page, "source");

    await expect(edgeHitTargetStrokeWidth(page)).resolves.toBe("4px");
  });

  test("edge hover interaction is preserved at every zoom band", async ({ page }) => {
    for (const band of ["overview", "structure", "detail", "inspect", "source"] as const) {
      await setZoomBand(page, band);
      await clearEdgeHover(page);

      await hoverAnyEdgeHitTarget(page);

      await expect(page.locator(HIGHLIGHTED_EDGE_SELECTOR)).toHaveCount(1);
    }
  });
});
