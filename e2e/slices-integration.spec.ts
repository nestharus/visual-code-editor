import { expect, test, type Page } from "@playwright/test";

import type {
  NeighbourhoodRule,
  Slice,
  SliceLifecycleState,
} from "../app/lib/slice";
import { setupMockApi } from "./helpers";

type ConstructBody = Record<string, unknown>;
type TransitionBody = {
  sliceId: string;
  body: Record<string, unknown>;
};

const FIND_SHORTCUT = process.platform === "darwin" ? "Meta+f" : "Control+f";

function slicesButton(page: Page) {
  return page.getByTestId("slices-toolbar-button");
}

function slicesOverlay(page: Page) {
  return page.getByTestId("slices-panel-overlay");
}

function constructSliceButton(page: Page) {
  return page.getByTestId("search-overlay-construct-slice");
}

function ruleSelector(page: Page) {
  return page.getByTestId("search-overlay-rule-selector");
}

function noMatchesMessage(page: Page) {
  return page.getByTestId("search-overlay-no-matches-message");
}

function directNeighboursRule(): NeighbourhoodRule {
  return { kind: "direct-neighbours", edgeKinds: [], maxHops: 0 };
}

function sliceFixture(overrides: Partial<Slice> = {}): Slice {
  const now = Date.now();
  const id = overrides.id ?? "slice:integration-fixture";

  return {
    id,
    query: overrides.query ?? "Alpha",
    matchedEntityIds: overrides.matchedEntityIds ?? ["cluster-alpha"],
    neighbourhoodEntityIds: overrides.neighbourhoodEntityIds ?? [
      "system-api",
      "system-worker",
    ],
    rule: overrides.rule ?? directNeighboursRule(),
    lifecycleState: overrides.lifecycleState ?? "active",
    ttlMs: overrides.ttlMs === undefined ? 60_000 : overrides.ttlMs,
    createdBy: overrides.createdBy ?? "you-this-session",
    createdAtMs: overrides.createdAtMs ?? now,
    pinnedAtMs: overrides.pinnedAtMs ?? null,
    trust: overrides.trust ?? { state: "candidate", grounding: null },
  };
}

async function setupSlicesApi(page: Page, initialSlices: readonly Slice[] = []) {
  const slices = [...initialSlices];
  const constructBodies: ConstructBody[] = [];
  const transitionBodies: TransitionBody[] = [];
  let getSlicesCount = 0;

  await setupMockApi(page);

  await page.route(/\/api\/slices(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    getSlicesCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        slices: slices.filter((slice) => slice.lifecycleState !== "dismissed"),
      }),
    });
  });

  await page.route(/\/api\/slices\/construct(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const body = JSON.parse(route.request().postData() || "{}") as ConstructBody;
    constructBodies.push(body);
    const query = String(body.query ?? "");

    if (query.includes("fake-id")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error_kind: "no-matches",
          request_id: `request:slice-no-match-${constructBodies.length}`,
        }),
      });
      return;
    }

    const slice = sliceFixture({
      id: `slice:constructed-${constructBodies.length}`,
      query,
      rule:
        body.rule && typeof body.rule === "object"
          ? (body.rule as NeighbourhoodRule)
          : directNeighboursRule(),
    });
    slices.unshift(slice);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        slice,
        request_id: `request:slice-construct-${constructBodies.length}`,
      }),
    });
  });

  await page.route(/\/api\/slices\/[^/]+\/transition(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const sliceId = decodeURIComponent(url.pathname.split("/")[3] ?? "");
    const body = JSON.parse(route.request().postData() || "{}") as Record<
      string,
      unknown
    >;
    transitionBodies.push({ sliceId, body });

    const nextState =
      typeof body.to_state === "string"
        ? (body.to_state as SliceLifecycleState)
        : "pinned";
    const sliceIndex = slices.findIndex((slice) => slice.id === sliceId);
    const currentSlice =
      slices[sliceIndex] ??
      sliceFixture({
        id: sliceId,
      });
    const updatedSlice = sliceFixture({
      ...currentSlice,
      lifecycleState: nextState,
      ttlMs: nextState === "pinned" ? null : 60_000,
      pinnedAtMs: nextState === "pinned" ? Date.now() : null,
    });

    if (sliceIndex >= 0) {
      slices[sliceIndex] = updatedSlice;
    } else {
      slices.unshift(updatedSlice);
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, slice: updatedSlice }),
    });
  });

  return {
    constructBodies,
    getSlicesCount: () => getSlicesCount,
    slices,
    transitionBodies,
  };
}

async function gotoOrganizational(page: Page) {
  await page.goto("/organizational");
  await page.locator(".graph-node").first().waitFor({
    state: "visible",
    timeout: 10000,
  });
}

async function openSlicesPanel(page: Page) {
  await slicesButton(page).click();
  await expect(slicesOverlay(page)).toBeVisible();
}

async function openSearchOverlay(page: Page) {
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
  });
  await page.keyboard.press(FIND_SHORTCUT);
  await expect(page.locator(".search-overlay")).toBeVisible();
  await expect(page.locator(".search-overlay-input")).toBeFocused();
}

async function expectDirectRuleSelected(page: Page) {
  const selector = ruleSelector(page);
  await expect(selector).toBeVisible();

  const tagName = await selector.evaluate((element) =>
    element.tagName.toLowerCase(),
  );
  if (tagName === "select") {
    await expect(selector).toHaveValue("direct-neighbours");
    return;
  }

  await expect(selector).toContainText(/Direct neighbours/i);
}

async function constructSliceFromSearch(page: Page, query: string) {
  await openSearchOverlay(page);
  await page.locator(".search-overlay-input").fill(query);
  await expectDirectRuleSelected(page);
  await constructSliceButton(page).click();
}

test.describe("Slices integration", () => {
  test("Slices toolbar button visible with default count 0", async ({ page }) => {
    await setupSlicesApi(page);
    await gotoOrganizational(page);

    await expect(slicesButton(page)).toBeVisible();
    await expect(slicesButton(page)).toHaveText(/Slices\s*\(0\)/);
  });

  test("Click opens Slices rail", async ({ page }) => {
    await setupSlicesApi(page);
    await gotoOrganizational(page);

    await openSlicesPanel(page);
  });

  test("Construct from search overlay POSTs and opens Slices rail", async ({ page }) => {
    const api = await setupSlicesApi(page);
    await gotoOrganizational(page);

    await constructSliceFromSearch(page, "Alpha");

    await expect.poll(() => api.constructBodies.length).toBe(1);
    expect(api.constructBodies[0]).toMatchObject({
      query: "Alpha",
      rule: directNeighboursRule(),
    });
    await expect(page.locator(".search-overlay")).toHaveCount(0);
    await expect(slicesOverlay(page)).toBeVisible();
    await expect(page.getByTestId("slice-panel")).toContainText("Alpha");
  });

  test("No-matches inline message keeps search overlay open", async ({ page }) => {
    const api = await setupSlicesApi(page);
    await gotoOrganizational(page);

    await constructSliceFromSearch(page, "fake-id-no-match");

    await expect.poll(() => api.constructBodies.length).toBe(1);
    await expect(page.locator(".search-overlay")).toBeVisible();
    await expect(noMatchesMessage(page)).toHaveText("No matches for that query");
  });

  test("Slice listing shows constructed slice with state badge", async ({ page }) => {
    await setupSlicesApi(page);
    await gotoOrganizational(page);

    await constructSliceFromSearch(page, "Alpha");

    await expect(slicesOverlay(page)).toBeVisible();
    await expect(page.getByTestId("slice-panel")).toContainText("Alpha");
    await expect(page.getByTestId("slice-panel-state-badge")).toHaveText("active");
  });

  test("Transition from rail POSTs /api/slices/:id/transition", async ({ page }) => {
    const api = await setupSlicesApi(page);
    await gotoOrganizational(page);

    await constructSliceFromSearch(page, "Alpha");
    await page.getByTestId("slice-panel-action-pin").click();

    await expect.poll(() => api.transitionBodies.length).toBe(1);
    expect(api.transitionBodies[0]).toMatchObject({
      sliceId: "slice:constructed-1",
      body: {
        to_state: "pinned",
      },
    });
  });

  test("Slices toolbar count updates after construction", async ({ page }) => {
    await setupSlicesApi(page);
    await gotoOrganizational(page);

    await expect(slicesButton(page)).toHaveText(/Slices\s*\(0\)/);

    await constructSliceFromSearch(page, "Alpha");

    await expect(slicesButton(page)).toHaveText(/Slices\s*\(1\)/);
  });

  test("Escape closes Slices rail", async ({ page }) => {
    await setupSlicesApi(page, [sliceFixture()]);
    await gotoOrganizational(page);

    await openSlicesPanel(page);
    await page.keyboard.press("Escape");

    await expect(slicesOverlay(page)).toBeHidden();
  });
});
