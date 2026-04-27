import { expect, test, type Page } from "@playwright/test";

import type { ChangeEvent, UserContext } from "../app/lib/user-context";
import { setupMockApi } from "./helpers";

function digestButton(page: Page) {
  return page.getByTestId("digest-toolbar-button");
}

function digestOverlay(page: Page) {
  return page.getByTestId("digest-panel-overlay");
}

function changeEventFixture(overrides: Partial<ChangeEvent> = {}): ChangeEvent {
  return {
    id: overrides.id ?? "change:integration-fixture",
    kind: overrides.kind ?? "entity-renamed",
    actor: overrides.actor ?? "you-other-session",
    affectedEntityIds: overrides.affectedEntityIds ?? ["entity:integration"],
    affectedKinds: overrides.affectedKinds ?? ["module"],
    tier: overrides.tier ?? "immediate",
    blocking: overrides.blocking ?? false,
    timestampMs: overrides.timestampMs ?? Date.now(),
    contextSummary: overrides.contextSummary ?? "Integration fixture summary.",
    detailUrl: overrides.detailUrl ?? null,
  };
}

function userContextFixture(overrides: Partial<UserContext> = {}): UserContext {
  return {
    id: overrides.id ?? "user-context:integration",
    openedSurfaces: overrides.openedSurfaces ?? [],
    recentPrompts: overrides.recentPrompts ?? [],
    activeTaskIds: overrides.activeTaskIds ?? [],
    activeSliceIds: overrides.activeSliceIds ?? [],
    autoMotionDisabled: overrides.autoMotionDisabled ?? false,
    computedAtMs: overrides.computedAtMs ?? Date.now(),
  };
}

async function setupDigestApi(page: Page, initialEvents: readonly ChangeEvent[] = []) {
  const events = [...initialEvents];
  const userContext = userContextFixture();

  await setupMockApi(page);

  await page.route(/\/api\/user-context\/[^/]+(?:\?.*)?$/, async (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, user_context: userContext }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route(/\/api\/change-events(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    const url = new URL(route.request().url());
    const includeSuppressed = url.searchParams.get("include_suppressed") === "true";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        events: includeSuppressed
          ? events
          : events.filter((event) => event.tier !== "suppressed"),
      }),
    });
  });

  await page.route(/\/api\/change-events\/[^/]+\/dispose(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    const eventId = decodeURIComponent(url.pathname.split("/")[3] ?? "");
    const body = JSON.parse(route.request().postData() || "{}") as {
      disposition?: string;
    };
    const index = events.findIndex((event) => event.id === eventId);
    const currentEvent = events[index] ?? changeEventFixture({ id: eventId });
    const updatedEvent =
      body.disposition === "disposed_to_immediate"
        ? { ...currentEvent, tier: "immediate" as const }
        : currentEvent;
    if (index >= 0) {
      events[index] = updatedEvent;
    } else {
      events.unshift(updatedEvent);
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        event: {
          ...updatedEvent,
          disposition: body.disposition,
          disposedAtMs: Date.now(),
        },
      }),
    });
  });

  return { events, userContext };
}

async function gotoOrganizational(page: Page) {
  await page.goto("/organizational");
  await page.locator(".graph-node").first().waitFor({
    state: "visible",
    timeout: 10000,
  });
}

async function openDigestPanel(page: Page) {
  await digestButton(page).click();
  await expect(digestOverlay(page)).toBeVisible();
  await expect(page.getByTestId("digest-panel")).toBeVisible();
}

test.describe("Digest integration", () => {
  test("Digest toolbar button is visible with immediate count", async ({ page }) => {
    await setupDigestApi(page, [
      changeEventFixture({ id: "change:immediate-one", tier: "immediate" }),
      changeEventFixture({ id: "change:immediate-two", tier: "immediate" }),
      changeEventFixture({ id: "change:stashed-one", tier: "stashed" }),
    ]);
    await gotoOrganizational(page);

    await expect(digestButton(page)).toBeVisible();
    await expect(digestButton(page)).toHaveText(/Digest\s*\(2\)/);
  });

  test("Click opens Digest panel", async ({ page }) => {
    await setupDigestApi(page, [
      changeEventFixture({
        id: "change:open-panel",
        tier: "immediate",
        contextSummary: "Open panel fixture.",
      }),
    ]);
    await gotoOrganizational(page);

    await openDigestPanel(page);
    await expect(page.getByTestId("digest-event-row-immediate-0")).toContainText(
      "Open panel fixture.",
    );
  });

  test("Escape closes Digest panel and returns focus to the toolbar button", async ({
    page,
  }) => {
    await setupDigestApi(page, [
      changeEventFixture({ id: "change:escape-panel", tier: "immediate" }),
    ]);
    await gotoOrganizational(page);

    await openDigestPanel(page);
    await page.keyboard.press("Escape");

    await expect(digestOverlay(page)).toBeHidden();
    await expect(digestButton(page)).toBeFocused();
  });
});
