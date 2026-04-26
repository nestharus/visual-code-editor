import { expect, test, type Locator, type Page } from "@playwright/test";

import { gotoDiagram } from "./helpers";

type ZoomBand = "overview" | "structure" | "detail" | "inspect" | "source";

const NODE_LABEL_SELECTOR = ".graph-node-label";
const EDGE_LABEL_SELECTOR = ".edge-label";
const GRAPH_ROOT_SELECTOR = ".graph-surface-root[data-zoom-band]";

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

async function computedDisplays(locator: Locator): Promise<string[]> {
  const count = await locator.count();
  expect(count).toBeGreaterThan(0);
  return locator.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).display),
  );
}

async function expectAllDisplay(locator: Locator, display: string) {
  const displays = await computedDisplays(locator);
  expect(displays).toEqual(displays.map(() => display));
}

async function expectAllNotDisplay(locator: Locator, display: string) {
  const displays = await computedDisplays(locator);
  expect(displays.every((actual) => actual !== display)).toBe(true);
}

async function firstNodeWithLabel(page: Page): Promise<Locator> {
  const node = page.locator(".graph-node").filter({
    has: page.locator(NODE_LABEL_SELECTOR),
  }).first();
  await expect(node).toBeAttached();
  return node;
}

async function installEdgeHoverProbe(page: Page) {
  await page.evaluate((rootSelector) => {
    const root = document.querySelector(rootSelector);
    if (!root) throw new Error(`Missing graph root ${rootSelector}`);

    document.querySelector("#zoom-edge-hover-probe")?.remove();

    const probe = document.createElement("div");
    probe.id = "zoom-edge-hover-probe";
    probe.className = "graph-edge";
    probe.style.position = "absolute";
    probe.style.left = "24px";
    probe.style.top = "24px";
    probe.style.width = "160px";
    probe.style.height = "44px";
    probe.style.pointerEvents = "auto";
    probe.style.zIndex = "1000";

    const label = document.createElement("span");
    label.className = "edge-label";
    label.textContent = "synthetic hover edge";
    probe.appendChild(label);

    root.appendChild(probe);
  }, GRAPH_ROOT_SELECTOR);
}

async function installBadgeProbe(page: Page) {
  await page.evaluate((rootSelector) => {
    const root = document.querySelector(rootSelector);
    if (!root) throw new Error(`Missing graph root ${rootSelector}`);

    document.querySelector("#zoom-badge-cap-probe")?.remove();

    const probe = document.createElement("div");
    probe.id = "zoom-badge-cap-probe";
    probe.className = "graph-node";
    probe.style.position = "absolute";
    probe.style.left = "24px";
    probe.style.top = "84px";
    probe.style.zIndex = "1000";

    const cluster = document.createElement("div");
    cluster.className = "badge-cluster";

    for (let index = 0; index < 5; index += 1) {
      const badge = document.createElement("span");
      badge.textContent = `badge ${index + 1}`;
      cluster.appendChild(badge);
    }

    probe.appendChild(cluster);
    root.appendChild(probe);
  }, GRAPH_ROOT_SELECTOR);
}

async function visibleBadgeProbeCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const badges = document.querySelectorAll("#zoom-badge-cap-probe .badge-cluster > *");
    return Array.from(badges).filter(
      (badge) => getComputedStyle(badge).display !== "none",
    ).length;
  });
}

test.describe("zoom-band CSS rules", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDiagram(page, "/organizational");
    await expect(graphRoot(page)).toBeAttached();
  });

  test("OVERVIEW hides node labels", async ({ page }) => {
    await setZoomBand(page, "overview");

    await expectAllDisplay(page.locator(NODE_LABEL_SELECTOR), "none");
  });

  test("DETAIL shows node labels", async ({ page }) => {
    await setZoomBand(page, "detail");

    await expectAllNotDisplay(page.locator(NODE_LABEL_SELECTOR), "none");
  });

  test("STRUCTURE band hover reveals labels", async ({ page }) => {
    await setZoomBand(page, "structure");

    const node = await firstNodeWithLabel(page);
    const label = node.locator(NODE_LABEL_SELECTOR).first();

    await expectAllDisplay(label, "none");
    await node.hover();
    await expectAllNotDisplay(label, "none");
  });

  test("DETAIL hides edge labels by default and hover reveals them", async ({ page }) => {
    await installEdgeHoverProbe(page);
    await setZoomBand(page, "detail");

    const probe = page.locator("#zoom-edge-hover-probe");
    const label = probe.locator(EDGE_LABEL_SELECTOR);

    await expectAllDisplay(page.locator(EDGE_LABEL_SELECTOR), "none");
    await page.hover("#zoom-edge-hover-probe");
    await expectAllNotDisplay(label, "none");
  });

  test("INSPECT shows edge labels by default", async ({ page }) => {
    await setZoomBand(page, "inspect");

    await expectAllNotDisplay(page.locator(EDGE_LABEL_SELECTOR), "none");
  });

  test("badge cluster nth-child cap applies at OVERVIEW and DETAIL", async ({ page }) => {
    await installBadgeProbe(page);

    await setZoomBand(page, "overview");
    await expect(visibleBadgeProbeCount(page)).resolves.toBe(0);

    await setZoomBand(page, "detail");
    await expect(visibleBadgeProbeCount(page)).resolves.toBe(2);
  });

  test("visual-regression baseline precondition defaults to DETAIL", async ({ page }) => {
    await expect(graphRoot(page)).toHaveAttribute("data-zoom-band", "detail");
  });
});
