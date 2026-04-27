import { expect, test, type Page } from "@playwright/test";

import type { Widget } from "../app/lib/widget";
import { setupMockApi } from "./helpers";

function widgetsButton(page: Page) {
  return page.getByTestId("widgets-toolbar-button");
}

function widgetsOverlay(page: Page) {
  return page.getByTestId("widgets-panel-overlay");
}

function widgetFixture(overrides: Partial<Widget> = {}): Widget {
  const id = overrides.id ?? "widget:integration.login-button";
  return {
    id,
    label: overrides.label ?? "Login Button",
    kind: overrides.kind ?? "button",
    references: overrides.references ?? [
      {
        surface: "source",
        identifier: "app/components/auth/LoginButton.tsx#LoginButton",
        evidenceSource: "integration-fixture",
      },
    ],
    trust: overrides.trust ?? { state: "candidate", grounding: null },
    attributionActor: overrides.attributionActor ?? "agents:slice-constructor",
    createdAtMs: overrides.createdAtMs ?? Date.now(),
  };
}

async function setupWidgetsApi(page: Page, widgets: readonly Widget[] = defaultWidgets()) {
  let getWidgetsCount = 0;

  await setupMockApi(page);

  await page.route(/\/api\/widgets(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    getWidgetsCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ widgets, computed_at_ms: 123 }),
    });
  });

  return {
    getWidgetsCount: () => getWidgetsCount,
    widgets,
  };
}

function defaultWidgets(): Widget[] {
  return [
    widgetFixture(),
    widgetFixture({
      id: "widget:integration.email-field",
      label: "Email Field",
      kind: "input",
      references: [
        {
          surface: "source",
          identifier: "app/lib/forms/EmailField.tsx#EmailField",
          evidenceSource: "integration-fixture",
        },
      ],
    }),
  ];
}

async function gotoOrganizational(page: Page) {
  await page.goto("/organizational");
  await page.locator(".graph-node").first().waitFor({
    state: "visible",
    timeout: 10000,
  });
}

async function openWidgetsPanel(page: Page) {
  await widgetsButton(page).click();
  await expect(widgetsOverlay(page)).toBeVisible();
  await expect(page.getByTestId("widget-inventory-panel")).toBeVisible();
}

test.describe("Widget inventory integration", () => {
  test("Widgets toolbar button is visible with count", async ({ page }) => {
    const api = await setupWidgetsApi(page);
    await gotoOrganizational(page);

    await expect.poll(() => api.getWidgetsCount()).toBeGreaterThan(0);
    await expect(widgetsButton(page)).toBeVisible();
    await expect(widgetsButton(page)).toHaveAttribute("aria-label", "Open Widgets panel");
    await expect(widgetsButton(page)).toHaveText(/Widgets\s*\(2\)/);
  });

  test("click opens panel and lists widgets fetched from /api/widgets", async ({ page }) => {
    const api = await setupWidgetsApi(page);
    await gotoOrganizational(page);

    await openWidgetsPanel(page);

    await expect.poll(() => api.getWidgetsCount()).toBeGreaterThan(0);
    await expect(page.getByTestId("widget-row-0")).toContainText("Login Button");
    await expect(page.getByTestId("widget-row-1")).toContainText("Email Field");
  });

  test("Escape closes panel and returns focus to Widgets button", async ({ page }) => {
    await setupWidgetsApi(page);
    await gotoOrganizational(page);

    await openWidgetsPanel(page);
    await page.keyboard.press("Escape");

    await expect(widgetsOverlay(page)).toBeHidden();
    await expect(widgetsButton(page)).toBeFocused();
  });
});
