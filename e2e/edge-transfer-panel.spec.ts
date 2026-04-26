import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { setupMockApi } from "./helpers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const liveDiagramData = JSON.parse(
  readFileSync(join(__dirname, "../public/data/diagram.json"), "utf-8"),
);

const MECHANISM_LABELS: Record<string, string> = {
  "artifact-flow": "Artifact flow",
  "feedback-loop": "Feedback loop",
  call: "Call",
  import: "Import",
  "store-read": "Store read",
  "store-write": "Store write",
  publish: "Publish",
  subscribe: "Subscribe",
  "agent-invoke": "Agent invoke",
  "cluster-link": "Cluster link",
  unknown: "Unknown",
};

const ROLE_HEADERS: Record<string, string> = {
  produced: "Produced (source emits)",
  consumed: "Consumed (target reads)",
  shared: "Shared (read by both)",
  carried: "Carried",
};

const MECHANISM_CASES = [
  {
    id: "be_lifecycle:philosophy-bootstrap_lifecycle:section-execution",
    panelKind: "behavioral-edge",
    mechanismKind: "artifact-flow",
  },
  {
    id: "be_loop_lifecycle:code-change-realization_1",
    panelKind: "behavioral-edge",
    mechanismKind: "feedback-loop",
  },
  {
    id: "e_coordination_scan",
    panelKind: "system-edge",
    mechanismKind: "call",
  },
  {
    id: "e_bootstrap_taskrouter",
    panelKind: "system-edge",
    mechanismKind: "import",
  },
  {
    id: "e_discover_execute",
    panelKind: "cluster-edge",
    mechanismKind: "cluster-link",
  },
] as const;

function cloneLiveDiagramData() {
  return JSON.parse(JSON.stringify(liveDiagramData));
}

async function setupPublicDiagramApi(page: Page, diagramData = liveDiagramData) {
  await setupMockApi(page);
  await page.route("**/api/diagram", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(diagramData),
    });
  });
}

async function openPanelByUrl(
  page: Page,
  panelKind: string,
  panelId: string,
  panelLabel?: string,
) {
  const params = new URLSearchParams({ panelKind, panelId });
  if (panelLabel) params.set("panelLabel", panelLabel);

  await page.goto(`/organizational?${params.toString()}`);
  await page.locator(".graph-node").first().waitFor({
    state: "visible",
    timeout: 10000,
  });
  await expect(page.locator(".detail-panel.is-open")).toBeVisible();
}

function addSyntheticEdge(
  diagramData: any,
  id: string,
  detail: Record<string, unknown>,
) {
  diagramData.details[id] = {
    id,
    kind: "edge",
    label: id,
    from: "discover",
    fromLabel: "Discover",
    to: "execute",
    toLabel: "Execute",
    ...detail,
  };
}

function transfer(overrides: Record<string, unknown>) {
  return {
    edgeId: "synthetic-edge",
    edge_id: "synthetic-edge",
    mechanismKind: "artifact-flow",
    mechanism_kind: "artifact-flow",
    summary: "Synthetic edge transfer summary",
    trust: { state: "grounded", grounding: "fixture" },
    artifacts: [],
    behaviourCandidates: [],
    behaviour_candidates: [],
    attributionActor: "generator",
    attribution_actor: "generator",
    legacyMechanism: null,
    legacy_mechanism: null,
    ...overrides,
  };
}

function trustBadge(page: Page) {
  return page.getByTestId("trust-badge").first();
}

async function expectTrustState(page: Page, state: string) {
  const badge = trustBadge(page);
  await expect(badge).toBeVisible();

  const dataState = await badge.getAttribute("data-trust-state");
  const className = await badge.getAttribute("class");
  expect(
    dataState === state || className?.split(/\s+/).includes(`trust-badge--${state}`),
  ).toBeTruthy();
}

test.describe("edge transfer detail panel", () => {
  test("renders mechanism chip labels from transfer mechanism kinds", async ({ page }) => {
    await setupPublicDiagramApi(page);

    for (const edge of MECHANISM_CASES) {
      await openPanelByUrl(page, edge.panelKind, edge.id);
      await expect(page.getByTestId("edge-mechanism-chip")).toHaveText(
        MECHANISM_LABELS[edge.mechanismKind],
      );
    }
  });

  test("renders transfer summary text when present", async ({ page }) => {
    await setupPublicDiagramApi(page);

    await openPanelByUrl(page, "cluster-edge", "e_discover_execute");

    await expect(page.getByTestId("edge-summary")).toHaveText(
      "codemap for agent context (+4 more)",
    );
  });

  test("renders trust badge state", async ({ page }) => {
    const diagramData = cloneLiveDiagramData();
    addSyntheticEdge(diagramData, "synthetic-candidate-trust-edge", {
      transfer: transfer({
        edgeId: "synthetic-candidate-trust-edge",
        edge_id: "synthetic-candidate-trust-edge",
        trust: { state: "candidate", grounding: null },
      }),
    });
    await setupPublicDiagramApi(page, diagramData);

    await openPanelByUrl(page, "system-edge", "synthetic-candidate-trust-edge");

    await expectTrustState(page, "candidate");
  });

  test("renders artifacts grouped by role with headers", async ({ page }) => {
    const diagramData = cloneLiveDiagramData();
    addSyntheticEdge(diagramData, "synthetic-all-artifact-roles-edge", {
      transfer: transfer({
        edgeId: "synthetic-all-artifact-roles-edge",
        edge_id: "synthetic-all-artifact-roles-edge",
        artifacts: [
          { role: "produced", name: "compiled bundle" },
          { role: "consumed", name: "source manifest" },
          { role: "shared", name: "trace context" },
          { role: "carried", name: "handoff token" },
        ],
      }),
    });
    await setupPublicDiagramApi(page, diagramData);

    await openPanelByUrl(page, "system-edge", "synthetic-all-artifact-roles-edge");

    for (const [role, header] of Object.entries(ROLE_HEADERS)) {
      await expect(page.getByTestId(`edge-artifacts-${role}`)).toHaveText(header);
    }
    await expect(page.getByText("compiled bundle", { exact: true })).toBeVisible();
    await expect(page.getByText("source manifest", { exact: true })).toBeVisible();
    await expect(page.getByText("trace context", { exact: true })).toBeVisible();
    await expect(page.getByText("handoff token", { exact: true })).toBeVisible();
  });

  test("omits empty artifact role sections", async ({ page }) => {
    const diagramData = cloneLiveDiagramData();
    addSyntheticEdge(diagramData, "synthetic-shared-only-edge", {
      transfer: transfer({
        edgeId: "synthetic-shared-only-edge",
        edge_id: "synthetic-shared-only-edge",
        artifacts: [{ role: "shared", name: "shared context packet" }],
      }),
    });
    await setupPublicDiagramApi(page, diagramData);

    await openPanelByUrl(page, "system-edge", "synthetic-shared-only-edge");

    await expect(page.getByTestId("edge-artifacts-shared")).toHaveText(
      ROLE_HEADERS.shared,
    );
    await expect(page.getByText("shared context packet", { exact: true })).toBeVisible();
    await expect(page.getByTestId("edge-artifacts-produced")).toHaveCount(0);
    await expect(page.getByTestId("edge-artifacts-consumed")).toHaveCount(0);
    await expect(page.getByTestId("edge-artifacts-carried")).toHaveCount(0);
  });

  test("omits mechanism row when transfer is missing", async ({ page }) => {
    const diagramData = cloneLiveDiagramData();
    addSyntheticEdge(diagramData, "synthetic-legacy-mechanism-edge", {
      mechanism: "legacy-handoff",
    });
    await setupPublicDiagramApi(page, diagramData);

    await openPanelByUrl(page, "system-edge", "synthetic-legacy-mechanism-edge");

    await expect(page.getByTestId("edge-mechanism-chip")).toHaveCount(0);
    await expect(page.getByTestId("trust-badge")).toHaveCount(0);
    await expect(page.getByTestId("edge-summary")).toHaveCount(0);
  });

  test("opens behaviour candidate panel on candidate click", async ({ page }) => {
    const diagramData = cloneLiveDiagramData();
    addSyntheticEdge(diagramData, "synthetic-behaviour-candidate-edge", {
      transfer: transfer({
        edgeId: "synthetic-behaviour-candidate-edge",
        edge_id: "synthetic-behaviour-candidate-edge",
        behaviourCandidates: [
          {
            behaviourId: "lifecycle:code-change-realization",
            behaviour_id: "lifecycle:code-change-realization",
            trust: { state: "candidate", grounding: null },
            evidenceSource: "synthetic fixture",
            evidence_source: "synthetic fixture",
          },
        ],
        behaviour_candidates: [
          {
            behaviourId: "lifecycle:code-change-realization",
            behaviour_id: "lifecycle:code-change-realization",
            trust: { state: "candidate", grounding: null },
            evidenceSource: "synthetic fixture",
            evidence_source: "synthetic fixture",
          },
        ],
      }),
    });
    await setupPublicDiagramApi(page, diagramData);

    await openPanelByUrl(page, "system-edge", "synthetic-behaviour-candidate-edge");
    await page
      .locator(".detail-panel.is-open")
      .getByRole("button", { name: /Code Change Realization/ })
      .click();

    await expect(page).toHaveURL(/panelId=lifecycle%3Acode-change-realization/);
    await expect(page.locator("#detail-panel-title")).toHaveText(
      "Code Change Realization",
    );
  });

  test("renders trust badge with img role and aria label", async ({ page }) => {
    await setupPublicDiagramApi(page);

    await openPanelByUrl(page, "cluster-edge", "e_discover_execute");

    const badge = trustBadge(page);
    await expect(badge).toHaveAttribute("role", "img");
    await expect(badge).toHaveAttribute("aria-label", "Trust: grounded");
  });

  test("does not render edge transfer sections for non-edge panels", async ({ page }) => {
    await setupPublicDiagramApi(page);

    await openPanelByUrl(page, "cluster", "discover", "Discover");

    await expect(page.locator("#detail-panel-title")).toHaveText("Discover");
    await expect(page.getByTestId("edge-mechanism-chip")).toHaveCount(0);
    await expect(page.getByTestId("edge-summary")).toHaveCount(0);
    await expect(page.getByTestId("trust-badge")).toHaveCount(0);
    for (const role of Object.keys(ROLE_HEADERS)) {
      await expect(page.getByTestId(`edge-artifacts-${role}`)).toHaveCount(0);
    }
  });
});
