import { expect, test, type Locator, type Page } from "@playwright/test";

import { gotoDiagram } from "./helpers";

const OLD_ROOT_NODES = [
  { id: "cluster-alpha", label: "Alpha" },
  { id: "cluster-beta", label: "Beta" },
  { id: "store-config", label: "Config Store" },
  { id: "agent-orchestrator", label: "Orchestrator" },
  { id: "external-api", label: "External API" },
];

const OPACITY_EPSILON = 0.01;
const SAMPLE_OFFSETS_MS = [50, 150, 250];

function clusterByLabel(page: Page, label: string) {
  return page
    .locator(`.graph-node[data-kind='cluster']:has(.graph-card[title='${label}'])`)
    .first();
}

async function waitUntilOffset(page: Page, startedAtMs: number, offsetMs: number) {
  const remaining = startedAtMs + offsetMs - Date.now();
  if (remaining > 0) {
    await page.waitForTimeout(remaining);
  }
}

async function readInnerOpacity(node: Locator) {
  return Number.parseFloat(
    await node.locator(".graph-node-inner").evaluate((element) => {
      return window.getComputedStyle(element).opacity;
    }),
  );
}

async function sampleOpacityAtOffsets(
  page: Page,
  node: Locator,
  startedAtMs: number,
) {
  const samples: number[] = [];
  for (const offsetMs of SAMPLE_OFFSETS_MS) {
    await waitUntilOffset(page, startedAtMs, offsetMs);
    samples.push(await readInnerOpacity(node));
  }
  return samples;
}

function expectNonIncreasingOpacity(samples: number[]) {
  for (let i = 1; i < samples.length; i += 1) {
    expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] + OPACITY_EPSILON);
  }

  const distinctValues = new Set(samples.map((value) => value.toFixed(2)));
  expect(distinctValues.size).toBeGreaterThanOrEqual(2);
}

async function oldRootNodeIdsStillRendered(page: Page) {
  return page.locator(".graph-node").evaluateAll((nodes, oldNodes) => {
    const labelToId = new Map(
      (oldNodes as typeof OLD_ROOT_NODES).map((node) => [node.label, node.id]),
    );
    const renderedIds: string[] = [];

    for (const node of nodes) {
      const label = node.querySelector(".graph-card")?.getAttribute("title");
      const id = label ? labelToId.get(label) : undefined;
      if (id) renderedIds.push(id);
    }

    return renderedIds;
  }, OLD_ROOT_NODES);
}

test.describe("diagram route transitions", () => {
  test("cluster drill-down uses CSS exit before replacing the graph", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await gotoDiagram(page, "/organizational");

    const cluster = clusterByLabel(page, "Alpha");
    await expect(cluster).toBeVisible();

    const clickedAtMs = Date.now();
    await cluster.click({ force: true });

    const exitingClassPromise = expect
      .poll(() => page.locator(".graph-node.exiting").count(), {
        timeout: 150,
        intervals: [16, 16, 32, 48],
      })
      .toBeGreaterThanOrEqual(1);

    const opacitySamplesPromise = sampleOpacityAtOffsets(page, cluster, clickedAtMs);

    const oldGraphRemovedPromise = expect
      .poll(async () => (await oldRootNodeIdsStillRendered(page)).length, {
        timeout: 800,
        intervals: [50, 100, 100, 150],
      })
      .toBe(0);

    await exitingClassPromise;
    const opacitySamples = await opacitySamplesPromise;
    expectNonIncreasingOpacity(opacitySamples);
    await oldGraphRemovedPromise;
  });
});
