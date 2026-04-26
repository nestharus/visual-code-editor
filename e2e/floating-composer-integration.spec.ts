import { expect, test, type Locator, type Page } from "@playwright/test";

import { gotoDiagram } from "./helpers";

const MULTI_SELECT_MODIFIER = process.platform === "darwin" ? "Meta" : "Control";

function composerRoot(page: Page): Locator {
  return page.locator('[data-testid="composer-root"], [data-testid="floating-composer"]');
}

function promptInput(page: Page): Locator {
  return page.getByTestId("prompt-input");
}

function submitButton(page: Page): Locator {
  return page.getByTestId("submit-button");
}

function anchorInfo(page: Page): Locator {
  return page.getByTestId("anchor-info-row");
}

function promptTrigger(page: Page): Locator {
  return page.locator(".detail-panel.is-open").getByTestId("prompt-trigger-button");
}

function nodeByText(page: Page, kind: string, text: string): Locator {
  return page.locator(`.graph-node[data-kind='${kind}']`).filter({ hasText: text }).first();
}

async function openPanel(page: Page, path: string): Promise<Locator> {
  await gotoDiagram(page, path);
  const panel = page.locator(".detail-panel.is-open");
  await expect(panel).toBeVisible();
  await expect(page.locator("#detail-panel-title")).toBeVisible();
  return panel;
}

async function focusBody(page: Page) {
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
  });
  await expect(page.locator("body")).toBeFocused();
}

async function expectComposerClosed(page: Page) {
  await expect(composerRoot(page)).toHaveCount(0);
}

async function expectLegacyPromptRemoved(page: Page) {
  await expect(
    page.locator(".detail-prompt, .prompt-dock, #prompt-dock, #prompt-dock-input"),
  ).toHaveCount(0);
  await expect(page.getByText("Panel Prompt", { exact: true })).toHaveCount(0);
}

test.describe("FloatingComposer integration", () => {
  test("Prompt button on edge panel opens composer", async ({ page }) => {
    await openPanel(
      page,
      "/organizational?panelKind=store-edge&panelId=e-a-store&panelLabel=write",
    );

    const trigger = promptTrigger(page);
    await expect(trigger).toBeVisible();
    await trigger.click();

    await expect(composerRoot(page)).toBeVisible();
    await expect(promptInput(page)).toBeFocused();
    await expect(anchorInfo(page)).toContainText(/edge/i);
    await expect(anchorInfo(page)).toContainText("e-a-store");
  });

  test("Prompt button on node panel opens composer", async ({ page }) => {
    await openPanel(
      page,
      "/organizational?panelKind=cluster&panelId=cluster-alpha&panelLabel=Alpha",
    );

    const trigger = promptTrigger(page);
    await expect(trigger).toBeVisible();
    await trigger.click();

    await expect(composerRoot(page)).toBeVisible();
    await expect(promptInput(page)).toBeFocused();
    await expect(anchorInfo(page)).toContainText(/node/i);
    await expect(anchorInfo(page)).toContainText("cluster-alpha");
  });

  test("/ key opens composer when body is focused", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    await nodeByText(page, "cluster", "Alpha").click({
      modifiers: [MULTI_SELECT_MODIFIER],
    });
    await expectComposerClosed(page);

    await focusBody(page);
    await page.keyboard.press("/");

    await expect(composerRoot(page)).toBeVisible();
    await expect(promptInput(page)).toBeFocused();
    await expect(anchorInfo(page)).toContainText("cluster-alpha");
  });

  test("/ key is ignored in inputs", async ({ page }) => {
    await gotoDiagram(page, "/organizational");

    await page.locator('[data-toolbar="search"]').click();
    const searchInput = page.locator(".search-overlay-input");
    await expect(searchInput).toBeFocused();

    await page.keyboard.press("/");

    await expect(searchInput).toHaveValue("/");
    await expectComposerClosed(page);
  });

  test("Direct mode submission POSTs to /api/tasks/dispatch", async ({
    page,
  }) => {
    let receivedBody: unknown = null;

    await page.route("**/api/tasks/dispatch", async (route) => {
      receivedBody = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          request_id: "request:floating-composer-direct",
          task: {
            id: "task:floating-composer-direct",
            label: "Run this panel directly",
            state: "pending",
          },
        }),
      });
    });

    await openPanel(
      page,
      "/organizational?panelKind=cluster&panelId=cluster-alpha&panelLabel=Alpha",
    );
    await promptTrigger(page).click();

    await page.getByTestId("mode-pill-direct").click();
    await promptInput(page).fill("Run this panel directly");
    await submitButton(page).click();

    await expect.poll(() => receivedBody).toMatchObject({
      label: "Run this panel directly",
      prompt: "Run this panel directly",
      related_behavior_ids: [],
      request_id: expect.any(String),
    });
  });

  test("Escape closes composer and restores focus to the trigger", async ({ page }) => {
    await openPanel(
      page,
      "/organizational?panelKind=cluster&panelId=cluster-alpha&panelLabel=Alpha",
    );

    const trigger = promptTrigger(page);
    await trigger.click();
    await expect(composerRoot(page)).toBeVisible();
    await expect(promptInput(page)).toBeFocused();

    await page.keyboard.press("Escape");

    await expectComposerClosed(page);
    await expect(trigger).toBeFocused();
  });

  test("PanelPrompt is fully removed from normal panel DOM", async ({ page }) => {
    await openPanel(
      page,
      "/organizational?panelKind=cluster&panelId=cluster-alpha&panelLabel=Alpha",
    );
    await expectLegacyPromptRemoved(page);

    await openPanel(
      page,
      "/organizational?panelKind=store-edge&panelId=e-a-store&panelLabel=write",
    );
    await expectLegacyPromptRemoved(page);
  });

  test("existing node, edge, and behavioral panels still open", async ({ page }) => {
    await openPanel(
      page,
      "/organizational?panelKind=cluster&panelId=cluster-alpha&panelLabel=Alpha",
    );
    await expect(page.locator("#detail-panel-title")).toHaveText("Alpha");
    await expect(page.locator("#detail-panel-kind")).toHaveText("cluster");

    await openPanel(
      page,
      "/organizational?panelKind=store-edge&panelId=e-a-store&panelLabel=write",
    );
    await expect(page.locator("#detail-panel-title")).toHaveText("write");
    await expect(page.locator(".detail-edge-endpoints")).toBeVisible();
    await expect(
      page
        .locator(".detail-edge-endpoints")
        .getByRole("button", { name: /open source node alpha/i }),
    ).toContainText("Alpha");

    await openPanel(
      page,
      "/behavioral?panelKind=stage&panelId=stage-implement&panelLabel=Implement",
    );
    await expect(page.locator("#detail-panel-title")).toHaveText("Implement");
    await expect(page.locator("#detail-panel-kind")).toHaveText("stage");
    await expect(page.locator(".detail-panel-body")).toContainText(
      "Execute the implementation plan.",
    );
  });
});
