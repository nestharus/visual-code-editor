import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { setupMockApi } from "./helpers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const liveDiagramData = JSON.parse(
  readFileSync(join(__dirname, "../public/data/diagram.json"), "utf-8"),
);

const SYNTHETIC_BEHAVIOR_ID = "behavior:int1-witness-test";
const SYNTHETIC_BEHAVIOR_LABEL = "Checkout confirmation writes receipt";

function promotePrompt(label: string) {
  return (
    "Generate a witness test for this behaviour: " +
    label +
    ". Use the existing test framework conventions in this repo. Place the test in the appropriate test file alongside the behaviour's source slices."
  );
}

function cloneLiveDiagramData() {
  return JSON.parse(JSON.stringify(liveDiagramData));
}

function hasCandidateBehaviorDetail(
  detail: Record<string, unknown>,
): detail is Record<string, unknown> & { id: string; label: string } {
  const behavior = detail.behavior;
  const trust =
    behavior && typeof behavior === "object"
      ? (behavior as Record<string, unknown>).trust
      : null;

  return (
    detail.kind === "behavior" &&
    typeof detail.id === "string" &&
    typeof detail.label === "string" &&
    trust !== null &&
    typeof trust === "object" &&
    (trust as Record<string, unknown>).state === "candidate"
  );
}

function findLiveCandidateBehaviorDetail(
  diagramData: Record<string, any>,
): { id: string; label: string } | null {
  for (const detail of Object.values(diagramData.details ?? {})) {
    if (hasCandidateBehaviorDetail(detail as Record<string, unknown>)) {
      return { id: detail.id, label: detail.label };
    }
  }
  return null;
}

function addSyntheticBehaviorDetail(diagramData: Record<string, any>) {
  diagramData.details[SYNTHETIC_BEHAVIOR_ID] = {
    id: SYNTHETIC_BEHAVIOR_ID,
    kind: "behavior",
    label: SYNTHETIC_BEHAVIOR_LABEL,
    description: "Synthetic INT.1 behavior detail used until exporter emits behavior records.",
    behavior: {
      id: SYNTHETIC_BEHAVIOR_ID,
      label: SYNTHETIC_BEHAVIOR_LABEL,
      description:
        "The checkout flow persists a receipt when confirmation succeeds.",
      sourceSlices: [
        {
          filePath: "app/checkout/confirmation.ts",
          startLine: 12,
          endLine: 28,
          startCol: null,
          endCol: null,
          sliceRole: "body",
          discoveredBy: "you-this-session",
          confirmedBy: null,
        },
      ],
      trust: { state: "candidate", grounding: null },
      parentBehaviorId: null,
      attributionActor: "you-this-session",
    },
  };

  return {
    id: SYNTHETIC_BEHAVIOR_ID,
    label: SYNTHETIC_BEHAVIOR_LABEL,
  };
}

async function setupDiagramApi(page: Page) {
  const diagramData = cloneLiveDiagramData();
  const behavior =
    findLiveCandidateBehaviorDetail(diagramData) ??
    addSyntheticBehaviorDetail(diagramData);

  await setupMockApi(page);
  await page.route("**/api/diagram", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(diagramData),
    });
  });

  return behavior;
}

async function openPanelByUrl(
  page: Page,
  panelKind: string,
  panelId: string,
  panelLabel: string,
) {
  const params = new URLSearchParams({ panelKind, panelId, panelLabel });
  const path = panelKind === "behavior" ? "/behavioral" : "/organizational";

  await page.goto(`${path}?${params.toString()}`);
  await page.locator(".graph-node").first().waitFor({
    state: "visible",
    timeout: 10000,
  });
  await expect(page.locator(".detail-panel.is-open")).toBeVisible();
}

function composer(page: Page) {
  return page.getByTestId("floating-composer");
}

function promptInput(page: Page) {
  return page.getByTestId("prompt-input");
}

function promoteToTestButton(page: Page) {
  return page.getByTestId("behaviour-card-promote-to-test");
}

test.describe("BehaviourCard DetailPanel integration", () => {
  test("Behaviour-kind panel renders BehaviourCard", async ({ page }) => {
    const behavior = await setupDiagramApi(page);

    await openPanelByUrl(page, "behavior", behavior.id, behavior.label);

    await expect(page.getByTestId("behaviour-card")).toBeVisible();
  });

  test("Click promote-to-test opens composer in Direct mode", async ({ page }) => {
    const behavior = await setupDiagramApi(page);
    await openPanelByUrl(page, "behavior", behavior.id, behavior.label);

    await promoteToTestButton(page).click();

    await expect(composer(page)).toBeVisible();
    await expect(composer(page)).toHaveAttribute("data-mode", "direct");
  });

  test("Composer prompt is pre-filled with the promote-to-test template", async ({
    page,
  }) => {
    const behavior = await setupDiagramApi(page);
    await openPanelByUrl(page, "behavior", behavior.id, behavior.label);

    await promoteToTestButton(page).click();

    await expect(promptInput(page)).toHaveValue(promotePrompt(behavior.label));
  });

  test("Submit dispatches to /api/tasks/dispatch", async ({ page }) => {
    let receivedBody: unknown = null;
    const behavior = await setupDiagramApi(page);

    await page.route("**/api/tasks/dispatch", async (route) => {
      receivedBody = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          request_id: "request:behaviour-card-int1",
          task: {
            id: "task:behaviour-card-int1",
            label: "Generate a witness test",
            state: "pending",
          },
        }),
      });
    });

    await openPanelByUrl(page, "behavior", behavior.id, behavior.label);
    await promoteToTestButton(page).click();
    await page.getByTestId("submit-button").click();

    const expectedPrompt = promotePrompt(behavior.label);
    await expect.poll(() => receivedBody).toMatchObject({
      label: expectedPrompt.slice(0, 80),
      prompt: expectedPrompt,
      related_behavior_ids: [behavior.id],
      request_id: expect.any(String),
    });
  });

  test("Non-behaviour panels are unchanged", async ({ page }) => {
    await setupDiagramApi(page);

    await openPanelByUrl(page, "cluster", "discover", "Discover");

    await expect(page.locator("#detail-panel-title")).toHaveText("Discover");
    await expect(page.getByTestId("behaviour-card")).toHaveCount(0);
  });
});
