/**
 * Comprehensive E2E tests for the diagram SolidJS app.
 *
 * Tests verify UNIFORMITY: every diagram level uses the same component,
 * same styles, same interactions. No special rules anywhere.
 */

import { test, expect } from "@playwright/test";
import {
  setupMockApi,
  waitForDiagram,
  clickCyNode,
  hoverCyNode,
  hoverCyEdge,
  moveMouseAway,
  getCyState,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

// ============================================================
// RENDER UNIFORMITY — same component, same rules, every level
// ============================================================

const ALL_ROUTES = [
  {
    name: "org-root",
    path: "/organizational",
    expectedNodes: ["cluster-alpha", "cluster-beta", "store-config"],
  },
  {
    name: "org-cluster",
    path: "/organizational/clusters/cluster-alpha",
    expectedNodes: ["system-a1", "system-a2", "system-ext"],
  },
  {
    name: "org-system",
    path: "/organizational/clusters/cluster-alpha/systems/system-a1",
    expectedNodes: ["file-1.py", "file-2.py", "agent-a1", "file-3.py"],
  },
  {
    name: "beh-root",
    path: "/behavioral",
    expectedNodes: ["lifecycle-design", "lifecycle-build"],
  },
  {
    name: "beh-lifecycle",
    path: "/behavioral/lifecycles/lifecycle-design",
    expectedNodes: ["stage-explore", "stage-propose"],
  },
  {
    name: "beh-stage",
    path: "/behavioral/lifecycles/lifecycle-design/stages/stage-explore",
    expectedNodes: ["step-research", "step-analyze"],
  },
];

for (const route of ALL_ROUTES) {
  test.describe(`Render: ${route.name}`, () => {
    test("renders cytoscape canvas", async ({ page }) => {
      await page.goto(route.path);
      await waitForDiagram(page);
      const canvasCount = await page.locator(".cy-container canvas").count();
      expect(canvasCount).toBeGreaterThan(0);
    });

    test("has expected nodes", async ({ page }) => {
      await page.goto(route.path);
      await waitForDiagram(page);
      const state = await getCyState(page);
      expect(state).not.toBeNull();
      for (const nodeId of route.expectedNodes) {
        expect(state!.nodeIds).toContain(nodeId);
      }
    });

    test("has edges", async ({ page }) => {
      await page.goto(route.path);
      await waitForDiagram(page);
      const state = await getCyState(page);
      expect(state!.edgeCount).toBeGreaterThan(0);
    });

    test("nodes are spread out (not stacked)", async ({ page }) => {
      await page.goto(route.path);
      await waitForDiagram(page);
      const positions = await page.evaluate(() => {
        const cy = (window as any).__cy;
        return cy
          .nodes()
          .filter((n: any) => !n.isParent())
          .map((n: any) => ({ id: n.id(), ...n.position() }));
      });
      expect(positions.length).toBeGreaterThan(1);
      // At least some nodes must be at different positions
      const allSameX = positions.every(
        (p: any) => Math.abs(p.x - positions[0].x) < 5,
      );
      const allSameY = positions.every(
        (p: any) => Math.abs(p.y - positions[0].y) < 5,
      );
      expect(allSameX && allSameY).toBe(false);
    });

    test("edges have curved style (not straight)", async ({ page }) => {
      await page.goto(route.path);
      await waitForDiagram(page);
      const edgeStyles = await page.evaluate(() => {
        const cy = (window as any).__cy;
        return cy.edges().map((e: any) => ({
          id: e.id(),
          curveStyle: e.style("curve-style"),
        }));
      });
      for (const edge of edgeStyles) {
        expect(["bezier", "unbundled-bezier", "segments"]).toContain(
          edge.curveStyle,
        );
      }
    });

    test("all edges have labels", async ({ page }) => {
      await page.goto(route.path);
      await waitForDiagram(page);
      const edgeLabels = await page.evaluate(() => {
        const cy = (window as any).__cy;
        return cy.edges().map((e: any) => ({
          id: e.id(),
          label: e.data("label"),
        }));
      });
      for (const edge of edgeLabels) {
        expect(edge.label).toBeTruthy();
      }
    });

    test("edge labels are horizontal (not autorotated)", async ({ page }) => {
      await page.goto(route.path);
      await waitForDiagram(page);
      const rotations = await page.evaluate(() => {
        const cy = (window as any).__cy;
        return cy.edges().map((e: any) => ({
          id: e.id(),
          textRotation: e.style("text-rotation"),
        }));
      });
      for (const edge of rotations) {
        // Labels must be horizontal — no "autorotate"
        expect(edge.textRotation).not.toBe("autorotate");
      }
    });

    test("uses the same .cy-container class", async ({ page }) => {
      await page.goto(route.path);
      await waitForDiagram(page);
      const containerCount = await page.locator(".cy-container").count();
      expect(containerCount).toBe(1);
    });
  });
}

test.describe("Render: org-system fallback layout", () => {
  test("keeps the agent node separated from sibling file nodes", async ({ page }) => {
    await page.goto("/organizational/clusters/cluster-alpha/systems/system-a1");
    await waitForDiagram(page, { expectNodeId: "agent-a1" });
    const positions = await page.evaluate(() => {
      const cy = (window as any).__cy;
      return {
        agent: cy.getElementById("agent-a1").position(),
        file1: cy.getElementById("file-1.py").position(),
        file2: cy.getElementById("file-2.py").position(),
      };
    });
    expect(Math.abs(positions.agent.x - positions.file1.x) < 5 && Math.abs(positions.agent.y - positions.file1.y) < 5).toBe(false);
    expect(Math.abs(positions.agent.x - positions.file2.x) < 5 && Math.abs(positions.agent.y - positions.file2.y) < 5).toBe(false);
  });
});

// ============================================================
// HOVER — node action buttons, highlights, edge animation
// ============================================================

test.describe("Hover: node", () => {
  test("action buttons appear on node hover", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await hoverCyNode(page, "cluster-alpha");
    await page.waitForTimeout(500);
    const overlay = page.locator(".cy-node-actions.is-visible");
    await expect(overlay).toBeVisible();
  });

  test("node gets highlighted class", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await hoverCyNode(page, "cluster-alpha");
    await page.waitForTimeout(300);
    const highlighted = await page.evaluate(() => {
      const cy = (window as any).__cy;
      return cy.getElementById("cluster-alpha").hasClass("highlighted");
    });
    expect(highlighted).toBe(true);
  });

  test("other nodes get dimmed class", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await hoverCyNode(page, "cluster-alpha");
    await page.waitForTimeout(300);
    const dimmedCount = await page.evaluate(() => {
      const cy = (window as any).__cy;
      return cy.elements(".dimmed").length;
    });
    expect(dimmedCount).toBeGreaterThan(0);
  });

  test("connected edges get highlighted", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await hoverCyNode(page, "cluster-alpha");
    await page.waitForTimeout(300);
    const edgeHighlighted = await page.evaluate(() => {
      const cy = (window as any).__cy;
      const node = cy.getElementById("cluster-alpha");
      return node
        .connectedEdges()
        .every((e: any) => e.hasClass("highlighted"));
    });
    expect(edgeHighlighted).toBe(true);
  });

  test("highlights clear on mouse out", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await hoverCyNode(page, "cluster-alpha");
    await page.waitForTimeout(500);
    // Cytoscape uses canvas-level mouse tracking; trigger mouseout
    // programmatically since Playwright can't reliably trigger canvas mouseout
    await page.evaluate(() => {
      const cy = (window as any).__cy;
      cy.getElementById("cluster-alpha").emit("mouseout");
    });
    await page.waitForTimeout(500);
    const anyHighlighted = await page.evaluate(() => {
      const cy = (window as any).__cy;
      return cy
        .elements()
        .some(
          (el: any) => el.hasClass("highlighted") || el.hasClass("dimmed"),
        );
    });
    expect(anyHighlighted).toBe(false);
  });

  test("overlay hides on mouse out", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await hoverCyNode(page, "cluster-alpha");
    await page.waitForTimeout(500);
    // Trigger mouseout on the node (overlay has 300ms hide delay)
    await page.evaluate(() => {
      const cy = (window as any).__cy;
      cy.getElementById("cluster-alpha").emit("mouseout");
    });
    await page.waitForTimeout(600);
    const overlayCount = await page
      .locator(".cy-node-actions.is-visible")
      .count();
    expect(overlayCount).toBe(0);
  });
});

test.describe("Hover: edge", () => {
  test("edge highlights on hover", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await hoverCyEdge(page, "e-ab");
    await page.waitForTimeout(300);
    const highlighted = await page.evaluate(() => {
      const cy = (window as any).__cy;
      return cy.getElementById("e-ab").hasClass("highlighted");
    });
    expect(highlighted).toBe(true);
  });

  test("source and target get neighbor-highlighted", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await hoverCyEdge(page, "e-ab");
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => {
      const cy = (window as any).__cy;
      const edge = cy.getElementById("e-ab");
      return {
        sourceHighlighted: edge
          .source()
          .hasClass("neighbor-highlighted"),
        targetHighlighted: edge
          .target()
          .hasClass("neighbor-highlighted"),
      };
    });
    expect(state.sourceHighlighted).toBe(true);
    expect(state.targetHighlighted).toBe(true);
  });
});

// ============================================================
// NAVIGATION — drill-down through all levels
// ============================================================

test.describe("Navigation: organizational", () => {
  test("click cluster drills to cluster view", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await clickCyNode(page, "cluster-alpha");
    await page.waitForURL("**/organizational/clusters/cluster-alpha");
    await waitForDiagram(page, { expectNodeId: "system-a1" });
    const state = await getCyState(page);
    expect(state!.nodeIds).toContain("system-a1");
  });

  test("click system drills to system view", async ({ page }) => {
    await page.goto("/organizational/clusters/cluster-alpha");
    await waitForDiagram(page);
    await clickCyNode(page, "system-a1");
    await page.waitForURL("**/systems/system-a1");
    await waitForDiagram(page, { expectNodeId: "file-1.py" });
    const state = await getCyState(page);
    expect(state!.nodeIds).toContain("file-1.py");
  });

  test("click external node drills to system view", async ({ page }) => {
    await page.goto("/organizational/clusters/cluster-alpha");
    await waitForDiagram(page);
    await clickCyNode(page, "system-ext");
    await page.waitForURL("**/systems/system-ext");
    await waitForDiagram(page, { expectNodeId: "file-api.py" });
    const state = await getCyState(page);
    expect(state!.nodeIds).toContain("file-api.py");
  });

  test("3-level deep: root → cluster → system", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);

    // Level 1: root → cluster
    await clickCyNode(page, "cluster-alpha");
    await page.waitForURL("**/clusters/cluster-alpha");
    await waitForDiagram(page, { expectNodeId: "system-a1" });

    // Level 2: cluster → system
    await clickCyNode(page, "system-a1");
    await page.waitForURL("**/systems/system-a1");
    await waitForDiagram(page, { expectNodeId: "file-1.py" });

    const state = await getCyState(page);
    expect(state!.nodeIds).toContain("file-1.py");
    expect(state!.nodeIds).toContain("file-2.py");
    expect(state!.nodeIds).toContain("file-3.py");
  });
});

test.describe("Navigation: behavioral", () => {
  test("click lifecycle drills to lifecycle view", async ({ page }) => {
    await page.goto("/behavioral");
    await waitForDiagram(page);
    await clickCyNode(page, "lifecycle-design");
    await page.waitForURL("**/lifecycles/lifecycle-design");
    await waitForDiagram(page, { expectNodeId: "stage-explore" });
    const state = await getCyState(page);
    expect(state!.nodeIds).toContain("stage-explore");
  });

  test("click stage drills to stage view", async ({ page }) => {
    await page.goto("/behavioral/lifecycles/lifecycle-design");
    await waitForDiagram(page);
    await clickCyNode(page, "stage-explore");
    await page.waitForURL("**/stages/stage-explore");
    await waitForDiagram(page, { expectNodeId: "step-research" });
    const state = await getCyState(page);
    expect(state!.nodeIds).toContain("step-research");
  });

  test("3-level deep: root → lifecycle → stage", async ({ page }) => {
    await page.goto("/behavioral");
    await waitForDiagram(page);

    await clickCyNode(page, "lifecycle-design");
    await page.waitForURL("**/lifecycles/lifecycle-design");
    await waitForDiagram(page, { expectNodeId: "stage-explore" });

    await clickCyNode(page, "stage-explore");
    await page.waitForURL("**/stages/stage-explore");
    await waitForDiagram(page, { expectNodeId: "step-research" });

    const state = await getCyState(page);
    expect(state!.nodeIds).toContain("step-research");
    expect(state!.nodeIds).toContain("step-analyze");
  });
});

// ============================================================
// BREADCRUMBS — correct labels, navigation, structure
// ============================================================

test.describe("Breadcrumbs", () => {
  test("org root shows single breadcrumb", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    const bc = page.locator("#breadcrumb");
    await expect(bc).toContainText("Organizational");
    const items = await bc.locator(".breadcrumb-current").count();
    expect(items).toBe(1);
  });

  test("cluster level shows two segments", async ({ page }) => {
    await page.goto("/organizational/clusters/cluster-alpha");
    await waitForDiagram(page);
    const bc = page.locator("#breadcrumb");
    await expect(bc).toContainText("Organizational");
    await expect(bc).toContainText("Alpha");
  });

  test("system level shows three segments", async ({ page }) => {
    await page.goto(
      "/organizational/clusters/cluster-alpha/systems/system-a1",
    );
    await waitForDiagram(page);
    const bc = page.locator("#breadcrumb");
    await expect(bc).toContainText("Organizational");
    await expect(bc).toContainText("Alpha");
    await expect(bc).toContainText("System A1");
  });

  test("breadcrumb uses labels not IDs", async ({ page }) => {
    await page.goto("/organizational/clusters/cluster-alpha");
    await waitForDiagram(page);
    const text = await page.locator("#breadcrumb").textContent();
    expect(text).toContain("Alpha");
    expect(text).not.toContain("cluster-alpha");
  });

  test("breadcrumb click navigates back to root", async ({ page }) => {
    await page.goto(
      "/organizational/clusters/cluster-alpha/systems/system-a1",
    );
    await waitForDiagram(page);
    // Click "Organizational" link (first breadcrumb-item)
    await page.locator("#breadcrumb .breadcrumb-item").first().click();
    await page.waitForURL("**/organizational");
    await waitForDiagram(page, { expectNodeId: "cluster-alpha" });
    const state = await getCyState(page);
    expect(state!.nodeIds).toContain("cluster-alpha");
  });

  test("breadcrumb click navigates back to cluster", async ({ page }) => {
    await page.goto(
      "/organizational/clusters/cluster-alpha/systems/system-a1",
    );
    await waitForDiagram(page);
    // Click "Alpha" link (second breadcrumb-item)
    const items = page.locator("#breadcrumb .breadcrumb-item");
    await items.nth(1).click();
    await page.waitForURL("**/clusters/cluster-alpha");
    await waitForDiagram(page, { expectNodeId: "system-a1" });
  });

  test("behavioral breadcrumb structure", async ({ page }) => {
    await page.goto(
      "/behavioral/lifecycles/lifecycle-design/stages/stage-explore",
    );
    await waitForDiagram(page);
    const bc = page.locator("#breadcrumb");
    await expect(bc).toContainText("Behavioral");
    await expect(bc).toContainText("Design");
    await expect(bc).toContainText("Explore");
  });
});

// ============================================================
// VIEW TOGGLE
// ============================================================

test.describe("View toggle", () => {
  test("toggle to organizational", async ({ page }) => {
    await page.goto("/behavioral");
    await waitForDiagram(page);
    await page
      .locator('button[role="tab"]')
      .filter({ hasText: "Organizational" })
      .click();
    await page.waitForURL("**/organizational");
    await waitForDiagram(page, { expectNodeId: "cluster-alpha" });
  });

  test("toggle to behavioral", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await page
      .locator('button[role="tab"]')
      .filter({ hasText: "Behavioral" })
      .click();
    await page.waitForURL("**/behavioral");
    await waitForDiagram(page, { expectNodeId: "lifecycle-design" });
  });

  test("active tab has is-active class", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    const orgTab = page
      .locator('button[role="tab"]')
      .filter({ hasText: "Organizational" });
    await expect(orgTab).toHaveClass(/is-active/);
    const behTab = page
      .locator('button[role="tab"]')
      .filter({ hasText: "Behavioral" });
    await expect(behTab).not.toHaveClass(/is-active/);
  });
});

// ============================================================
// PANELS — open, populate, close (uniform behavior)
// ============================================================

test.describe("Panel: basic", () => {
  test("panel is initially closed", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    const isOpen = await page
      .locator("#detail-panel")
      .evaluate((el) => el.classList.contains("is-open"));
    expect(isOpen).toBe(false);
  });

  test("clicking non-drillable node opens panel", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await clickCyNode(page, "store-config");
    await page.waitForTimeout(1000);
    const isOpen = await page
      .locator("#detail-panel")
      .evaluate((el) => el.classList.contains("is-open"));
    expect(isOpen).toBe(true);
  });

  test("panel shows entity kind", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await clickCyNode(page, "store-config");
    await page.waitForTimeout(1000);
    await expect(page.locator("#detail-panel-kind")).toHaveText("store");
  });

  test("panel shows entity title", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await clickCyNode(page, "store-config");
    await page.waitForTimeout(1000);
    await expect(page.locator("#detail-panel-title")).toContainText(
      "Config Store",
    );
  });

  test("panel body has content (not fallback)", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await clickCyNode(page, "store-config");
    await page.waitForTimeout(2000);
    const body = page.locator("#detail-panel-body .detail-page");
    const text = await body.textContent();
    expect(text).not.toContain("No detail page available");
    expect(text!.length).toBeGreaterThan(0);
  });

  test("scrim click closes panel", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await clickCyNode(page, "store-config");
    await page.waitForTimeout(1500);
    // Verify panel is open before trying to close
    await expect(
      page.locator("#detail-panel.is-open"),
    ).toBeVisible();
    // Click on the left side of viewport (scrim area, not the panel)
    // Panel is on the right (width ~52rem), scrim covers entire viewport
    await page.mouse.click(50, 400);
    await page.waitForTimeout(1000);
    const isOpen = await page
      .locator("#detail-panel")
      .evaluate((el) => el.classList.contains("is-open"));
    expect(isOpen).toBe(false);
  });

  test("close button closes panel", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await clickCyNode(page, "store-config");
    await page.waitForTimeout(1000);
    await page.locator("#detail-panel-close").click();
    await page.waitForTimeout(500);
    const isOpen = await page
      .locator("#detail-panel")
      .evaluate((el) => el.classList.contains("is-open"));
    expect(isOpen).toBe(false);
  });
});

// Panel uniformity — every entity type at every level must populate
test.describe("Panel: uniform population", () => {
  // Mix of href-based (org) and metadata-only (behavioral) entities
  const PANEL_ENTITIES = [
    {
      route: "/organizational",
      nodeId: "store-config",
      label: "Config Store",
      kind: "store",
      hasHref: true,
    },
    {
      route:
        "/organizational/clusters/cluster-alpha/systems/system-a1",
      nodeId: "file-1.py",
      label: "file-1.py",
      kind: "file",
      hasHref: true,
    },
    {
      route:
        "/organizational/clusters/cluster-alpha/systems/system-a1",
      nodeId: "file-3.py",
      label: "file-3.py",
      kind: "file",
      hasHref: true,
    },
    {
      route:
        "/organizational/clusters/cluster-alpha/systems/system-a1",
      nodeId: "agent-a1",
      label: "agent-a1",
      kind: "agent",
      hasHref: false,
    },
    {
      route:
        "/behavioral/lifecycles/lifecycle-design/stages/stage-explore",
      nodeId: "step-research",
      label: "Research",
      kind: "step",
      hasHref: false, // metadata-only panel
    },
    {
      route:
        "/behavioral/lifecycles/lifecycle-design/stages/stage-explore",
      nodeId: "step-analyze",
      label: "Analyze",
      kind: "step",
      hasHref: false,
    },
    {
      route:
        "/behavioral/lifecycles/lifecycle-build/stages/stage-implement",
      nodeId: "step-code",
      label: "Code",
      kind: "step",
      hasHref: true,
    },
  ];

  for (const entity of PANEL_ENTITIES) {
    test(`panel populates for ${entity.kind}:${entity.nodeId}`, async ({
      page,
    }) => {
      await page.goto(entity.route);
      await waitForDiagram(page, { expectNodeId: entity.nodeId });
      await clickCyNode(page, entity.nodeId);

      // Wait for panel to open (Playwright auto-retries)
      await expect(page.locator("#detail-panel.is-open")).toBeVisible({
        timeout: 5000,
      });

      // Panel title must contain label
      await expect(page.locator("#detail-panel-title")).toContainText(
        entity.label,
        { timeout: 5000 },
      );

      // Panel body must have content — NOT "No detail page available"
      // or "No details available"
      await page.waitForTimeout(2000);
      const body = page.locator("#detail-panel-body");
      const bodyText = await body.textContent();
      expect(bodyText!.length).toBeGreaterThan(10);
      expect(bodyText).not.toContain("No detail page available");
      expect(bodyText).not.toContain("No details available");
    });
  }

  test("metadata-only agent panel renders field labels", async ({ page }) => {
    await page.goto("/organizational/clusters/cluster-alpha/systems/system-a1");
    await waitForDiagram(page, { expectNodeId: "agent-a1" });
    await clickCyNode(page, "agent-a1");
    await expect(page.locator("#detail-panel.is-open")).toBeVisible({
      timeout: 5000,
    });
    const body = page.locator("#detail-panel-body");
    await expect(body).toContainText("Coordinates module work");
    await expect(body).toContainText("Path");
    await expect(body).toContainText("Module");
    await expect(body).toContainText("System");
    await expect(body).not.toContainText("No details available");
  });
});

// ============================================================
// ZOOM
// ============================================================

test.describe("Zoom", () => {
  test("mouse wheel zooms in", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);

    const initialZoom = await page.evaluate(
      () => (window as any).__cy?.zoom(),
    );
    const box = await page.locator(".cy-container").boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(500);

    const newZoom = await page.evaluate(
      () => (window as any).__cy?.zoom(),
    );
    expect(newZoom).toBeGreaterThan(initialZoom);
  });

  test("mouse wheel zooms out", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);

    const initialZoom = await page.evaluate(
      () => (window as any).__cy?.zoom(),
    );
    const box = await page.locator(".cy-container").boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(500);

    const newZoom = await page.evaluate(
      () => (window as any).__cy?.zoom(),
    );
    expect(newZoom).toBeLessThan(initialZoom);
  });
});

// ============================================================
// ANIMATIONS — drill-in/out transitions work
// ============================================================

test.describe("Animations", () => {
  test("drill-in triggers animation (nodes move/fade)", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);

    const beforePos = await page.evaluate(() => {
      const cy = (window as any).__cy;
      return cy.nodes().first().position();
    });

    await clickCyNode(page, "cluster-alpha");
    // Check mid-animation state (200ms is during expand-out)
    await page.waitForTimeout(200);

    const during = await page.evaluate(() => {
      const cy = (window as any).__cy;
      const node = cy.nodes().first();
      return {
        opacity: parseFloat(node.style("opacity") || "1"),
        position: node.position(),
      };
    });

    const moved =
      Math.abs(during.position.x - beforePos.x) > 5 ||
      Math.abs(during.position.y - beforePos.y) > 5;
    const fading = during.opacity < 0.9;
    expect(moved || fading).toBe(true);
  });

  test("after navigation, all nodes are fully visible", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);

    await clickCyNode(page, "cluster-alpha");
    await page.waitForURL("**/clusters/cluster-alpha");
    await waitForDiagram(page, { expectNodeId: "system-a1" });

    const allVisible = await page.evaluate(() => {
      const cy = (window as any).__cy;
      return cy
        .nodes()
        .filter((n: any) => !n.isParent())
        .every((n: any) => parseFloat(n.style("opacity") || "1") >= 0.99);
    });
    expect(allVisible).toBe(true);
  });
});

// ============================================================
// UNIFORMITY — second cluster/lifecycle path works identically
// ============================================================

test.describe("Uniformity: second cluster path", () => {
  test("cluster-beta drill-down works the same", async ({ page }) => {
    await page.goto("/organizational");
    await waitForDiagram(page);
    await clickCyNode(page, "cluster-beta");
    await page.waitForURL("**/clusters/cluster-beta");
    await waitForDiagram(page, { expectNodeId: "system-b1" });

    const state = await getCyState(page);
    expect(state!.nodeIds).toContain("system-b1");
    expect(state!.edgeCount).toBeGreaterThan(0);
  });

  test("system-b1 drill-down works the same", async ({ page }) => {
    await page.goto("/organizational/clusters/cluster-beta");
    await waitForDiagram(page);
    await clickCyNode(page, "system-b1");
    await page.waitForURL("**/systems/system-b1");
    await waitForDiagram(page, { expectNodeId: "file-handler.py" });

    const state = await getCyState(page);
    expect(state!.nodeIds).toContain("file-handler.py");

    // Verify same rendering: curved edges, labels
    const edgeStyles = await page.evaluate(() => {
      const cy = (window as any).__cy;
      return cy.edges().map((e: any) => ({
        curveStyle: e.style("curve-style"),
        label: e.data("label"),
      }));
    });
    for (const edge of edgeStyles) {
      expect(["bezier", "unbundled-bezier", "segments"]).toContain(
        edge.curveStyle,
      );
      expect(edge.label).toBeTruthy();
    }
  });
});

test.describe("Uniformity: second lifecycle path", () => {
  test("lifecycle-build drill-down works the same", async ({ page }) => {
    await page.goto("/behavioral");
    await waitForDiagram(page);
    await clickCyNode(page, "lifecycle-build");
    await page.waitForURL("**/lifecycles/lifecycle-build");
    await waitForDiagram(page, { expectNodeId: "stage-implement" });

    const state = await getCyState(page);
    expect(state!.nodeIds).toContain("stage-implement");
    expect(state!.nodeIds).toContain("stage-verify");
  });

  test("stage-verify drill-down works the same", async ({ page }) => {
    await page.goto("/behavioral/lifecycles/lifecycle-build");
    await waitForDiagram(page);
    await clickCyNode(page, "stage-verify");
    await page.waitForURL("**/stages/stage-verify");
    await waitForDiagram(page, { expectNodeId: "step-qa" });

    const state = await getCyState(page);
    expect(state!.nodeIds).toContain("step-qa");
    expect(state!.nodeIds).toContain("step-release");
  });
});
